use clap::{Args, Parser, Subcommand};
use cmux_sandbox::models::{
    CreateSandboxRequest, EnvVar, ExecRequest, ExecResponse, SandboxSummary,
};
use cmux_sandbox::DEFAULT_HTTP_PORT;
use reqwest::Client;
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use uuid::Uuid;

#[derive(Parser, Debug)]
#[command(name = "cmux", about = "cmux sandbox controller")]
struct Cli {
    /// Base URL for the sandbox daemon (http or https)
    #[arg(long, env = "CMUX_SANDBOX_URL", default_value_t = default_base_url())]
    base_url: String,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    #[command(subcommand)]
    Sandboxes(SandboxCommand),
    /// Fetch the OpenAPI document from the server
    Openapi,
}

#[derive(Subcommand, Debug)]
enum SandboxCommand {
    /// List known sandboxes
    List,
    /// Create a new sandbox
    Create(CreateArgs),
    /// Inspect a sandbox
    Show { id: Uuid },
    /// Execute a command inside a sandbox
    Exec(ExecArgs),
    /// Tear down a sandbox
    Delete { id: Uuid },
}

#[derive(Args, Debug)]
struct CreateArgs {
    #[arg(long)]
    name: Option<String>,
    /// Optional positional name for convenience: `cmux sandboxes create myname`
    #[arg(value_name = "NAME")]
    positional_name: Option<String>,
    #[arg(long)]
    workspace: Option<PathBuf>,
    #[arg(long, value_parser = parse_env)]
    env: Vec<EnvVar>,
    #[arg(long = "read-only", value_name = "PATH")]
    read_only_paths: Vec<PathBuf>,
    #[arg(long, value_name = "PATH")]
    tmpfs: Vec<String>,
}

#[derive(Args, Debug)]
struct ExecArgs {
    id: Uuid,
    #[arg(trailing_var_arg = true, required = true)]
    command: Vec<String>,
    #[arg(long)]
    workdir: Option<String>,
    #[arg(short = 'e', long = "env", value_parser = parse_env)]
    env: Vec<EnvVar>,
}

fn default_base_url() -> String {
    format!("http://127.0.0.1:{DEFAULT_HTTP_PORT}")
}

fn parse_env(raw: &str) -> Result<EnvVar, String> {
    let parts: Vec<&str> = raw.splitn(2, '=').collect();
    if parts.len() != 2 {
        return Err("env should look like KEY=value".to_string());
    }

    Ok(EnvVar {
        key: parts[0].to_string(),
        value: parts[1].to_string(),
    })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    if std::env::var("CMUX_DEBUG").is_ok() {
        eprintln!("cmux base url: {}", cli.base_url);
    }
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .no_proxy()
        .http2_keep_alive_interval(Duration::from_secs(30))
        .build()?;

    match cli.command {
        Command::Openapi => {
            let url = format!("{}/openapi.json", cli.base_url.trim_end_matches('/'));
            let response = client.get(url).send().await?;
            let value: serde_json::Value = parse_response(response).await?;
            print_json(&value)?;
        }
        Command::Sandboxes(cmd) => match cmd {
            SandboxCommand::List => {
                let url = format!("{}/sandboxes", cli.base_url.trim_end_matches('/'));
                let response = client.get(url).send().await?;
                let sandboxes: Vec<SandboxSummary> = parse_response(response).await?;
                print_json(&sandboxes)?;
            }
            SandboxCommand::Create(args) => {
                let resolved_name = args.name.or(args.positional_name);
                let body = CreateSandboxRequest {
                    name: resolved_name,
                    workspace: args.workspace.map(|p| p.to_string_lossy().to_string()),
                    read_only_paths: args
                        .read_only_paths
                        .iter()
                        .map(|p| p.to_string_lossy().to_string())
                        .collect(),
                    tmpfs: args.tmpfs,
                    env: args.env,
                };

                let url = format!("{}/sandboxes", cli.base_url.trim_end_matches('/'));
                let response = client.post(url).json(&body).send().await?;
                let summary: SandboxSummary = parse_response(response).await?;
                print_json(&summary)?;
            }
            SandboxCommand::Show { id } => {
                let url = format!("{}/sandboxes/{id}", cli.base_url.trim_end_matches('/'));
                let response = client.get(url).send().await?;
                let summary: SandboxSummary = parse_response(response).await?;
                print_json(&summary)?;
            }
            SandboxCommand::Exec(args) => {
                let command = if args.command.len() == 1 && args.command[0].contains(' ') {
                    vec!["/bin/sh".into(), "-c".into(), args.command[0].clone()]
                } else {
                    args.command
                };
                let body = ExecRequest {
                    command,
                    workdir: args.workdir,
                    env: args.env,
                };
                let url = format!(
                    "{}/sandboxes/{}/exec",
                    cli.base_url.trim_end_matches('/'),
                    args.id
                );
                let response = client.post(url).json(&body).send().await?;
                let result: ExecResponse = parse_response(response).await?;
                print_json(&result)?;
            }
            SandboxCommand::Delete { id } => {
                let url = format!("{}/sandboxes/{id}", cli.base_url.trim_end_matches('/'));
                let response = client.delete(url).send().await?;
                let summary: SandboxSummary = parse_response(response).await?;
                print_json(&summary)?;
            }
        },
    }

    Ok(())
}

async fn parse_response<T>(response: reqwest::Response) -> anyhow::Result<T>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let status = response.status();
    if !status.is_success() {
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| String::from("unknown error"));
        return Err(anyhow::anyhow!("request failed: {status} - {text}"));
    }

    Ok(response.json::<T>().await?)
}

fn print_json<T: Serialize>(value: &T) -> anyhow::Result<()> {
    let rendered = serde_json::to_string_pretty(value)?;
    println!("{rendered}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_env_value() {
        let env = parse_env("KEY=value").unwrap();
        assert_eq!(env.key, "KEY");
        assert_eq!(env.value, "value");
    }

    #[test]
    fn rejects_invalid_env_value() {
        assert!(parse_env("INVALID").is_err());
    }

    #[test]
    fn exec_single_string_is_wrapped_in_shell() {
        let args = ExecArgs {
            id: Uuid::nil(),
            command: vec!["echo 123".into()],
            workdir: None,
            env: Vec::new(),
        };
        let built = ExecRequest {
            command: if args.command.len() == 1 && args.command[0].contains(' ') {
                vec!["/bin/sh".into(), "-c".into(), args.command[0].clone()]
            } else {
                args.command
            },
            workdir: args.workdir.clone(),
            env: args.env.clone(),
        };
        assert_eq!(built.command, vec!["/bin/sh", "-c", "echo 123"]);
    }
}
