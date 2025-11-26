use crate::models::ExecRequest;
use anyhow::anyhow;
use reqwest::Client;
use std::path::{Path, PathBuf};
use tar::Builder;

pub struct AuthFileDef {
    pub name: &'static str,
    pub host_path: &'static str,    // Relative to HOME
    pub sandbox_path: &'static str, // Absolute in sandbox
}

pub struct AuthFileToUpload {
    pub host_path: PathBuf,
    pub sandbox_path: &'static str,
}

pub const AUTH_FILES: &[AuthFileDef] = &[
    AuthFileDef {
        name: "Claude Config",
        host_path: ".claude.json",
        sandbox_path: "/root/.claude.json",
    },
    AuthFileDef {
        name: "Codex Auth",
        host_path: ".codex/auth.json",
        sandbox_path: "/root/.codex/auth.json",
    },
    AuthFileDef {
        name: "Codex Instructions",
        host_path: ".codex/instructions.md",
        sandbox_path: "/root/.codex/instructions.md",
    },
    AuthFileDef {
        name: "Codex Config",
        host_path: ".codex/config.toml",
        sandbox_path: "/root/.codex/config.toml",
    },
    AuthFileDef {
        name: "Gemini Settings",
        host_path: ".gemini/settings.json",
        sandbox_path: "/root/.gemini/settings.json",
    },
    AuthFileDef {
        name: "Gemini OAuth",
        host_path: ".gemini/oauth_creds.json",
        sandbox_path: "/root/.gemini/oauth_creds.json",
    },
    AuthFileDef {
        name: "Gemini MCP Tokens",
        host_path: ".gemini/mcp-oauth-tokens.json",
        sandbox_path: "/root/.gemini/mcp-oauth-tokens.json",
    },
    AuthFileDef {
        name: "Gemini Google Accounts",
        host_path: ".gemini/google_accounts.json",
        sandbox_path: "/root/.gemini/google_accounts.json",
    },
    AuthFileDef {
        name: "Gemini Account ID",
        host_path: ".gemini/google_account_id",
        sandbox_path: "/root/.gemini/google_account_id",
    },
    AuthFileDef {
        name: "Gemini Install ID",
        host_path: ".gemini/installation_id",
        sandbox_path: "/root/.gemini/installation_id",
    },
    AuthFileDef {
        name: "Gemini User ID",
        host_path: ".gemini/user_id",
        sandbox_path: "/root/.gemini/user_id",
    },
    AuthFileDef {
        name: "Gemini Env",
        host_path: ".gemini/.env",
        sandbox_path: "/root/.gemini/.env",
    },
    AuthFileDef {
        name: "Env",
        host_path: ".env",
        sandbox_path: "/root/.env",
    },
    AuthFileDef {
        name: "OpenCode Auth",
        host_path: ".local/share/opencode/auth.json",
        sandbox_path: "/root/.local/share/opencode/auth.json",
    },
    AuthFileDef {
        name: "Amp Settings",
        host_path: ".config/amp/settings.json",
        sandbox_path: "/root/.config/amp/settings.json",
    },
    AuthFileDef {
        name: "Amp Secrets",
        host_path: ".local/share/amp/secrets.json",
        sandbox_path: "/root/.local/share/amp/secrets.json",
    },
    AuthFileDef {
        name: "Cursor CLI Config",
        host_path: ".cursor/cli-config.json",
        sandbox_path: "/root/.cursor/cli-config.json",
    },
    AuthFileDef {
        name: "Cursor Auth",
        host_path: ".config/cursor/auth.json",
        sandbox_path: "/root/.config/cursor/auth.json",
    },
    AuthFileDef {
        name: "Qwen Settings",
        host_path: ".qwen/settings.json",
        sandbox_path: "/root/.qwen/settings.json",
    },
];

pub fn detect_auth_files() -> Vec<AuthFileToUpload> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let home_path = PathBuf::from(home);
    let mut files_to_upload = Vec::new();

    for def in AUTH_FILES {
        let path = home_path.join(def.host_path);
        if path.exists() {
            files_to_upload.push(AuthFileToUpload {
                host_path: path,
                sandbox_path: def.sandbox_path,
            });
        }
    }

    files_to_upload
}

pub async fn upload_auth_files(
    client: &Client,
    base_url: &str,
    id: &str,
    log_progress: bool,
) -> anyhow::Result<()> {
    let files_to_upload = detect_auth_files();
    upload_auth_files_with_list(client, base_url, id, files_to_upload, log_progress).await
}

pub async fn upload_auth_files_with_list(
    client: &Client,
    base_url: &str,
    id: &str,
    files_to_upload: Vec<AuthFileToUpload>,
    log_progress: bool,
) -> anyhow::Result<()> {
    if files_to_upload.is_empty() {
        return Ok(());
    }

    if log_progress {
        eprintln!("Uploading {} auth files...", files_to_upload.len());
    }

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(10);

    tokio::task::spawn_blocking(move || {
        let writer = ChunkedWriter { sender: tx.clone() };
        let mut tar = Builder::new(writer);

        let temp_dir_name = "__cmux_auth_temp";

        for AuthFileToUpload {
            host_path,
            sandbox_path: sandbox_path_str,
        } in files_to_upload
        {
            let sandbox_path = Path::new(sandbox_path_str);
            let rel_sandbox_path = sandbox_path.strip_prefix("/").unwrap_or(sandbox_path);

            let tar_path = Path::new(temp_dir_name).join(rel_sandbox_path);

            if let Err(e) = tar.append_path_with_name(&host_path, &tar_path) {
                let _ = tx.blocking_send(Err(e));
                return;
            }
        }

        if let Err(e) = tar.finish() {
            let _ = tx.blocking_send(Err(e));
        }
    });

    let body = reqwest::Body::wrap_stream(futures::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|msg| (msg, rx))
    }));

    let url = format!("{}/sandboxes/{}/files", base_url.trim_end_matches('/'), id);
    let response = client.post(url).body(body).send().await?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "Failed to upload auth files: {}",
            response.status()
        ));
    }

    let move_script = r#"
        if [ -d /workspace/__cmux_auth_temp ]; then
            cp -r /workspace/__cmux_auth_temp/root/. /root/ 2>/dev/null || true
            rm -rf /workspace/__cmux_auth_temp
        fi
    "#;

    let exec_body = ExecRequest {
        command: vec!["/bin/sh".into(), "-c".into(), move_script.into()],
        workdir: None,
        env: Vec::new(),
    };

    let exec_url = format!("{}/sandboxes/{}/exec", base_url.trim_end_matches('/'), id);
    let exec_response = client.post(exec_url).json(&exec_body).send().await?;

    if !exec_response.status().is_success() {
        return Err(anyhow!(
            "Failed to execute move script: {}",
            exec_response.status()
        ));
    }

    Ok(())
}

struct ChunkedWriter {
    sender: tokio::sync::mpsc::Sender<Result<Vec<u8>, std::io::Error>>,
}

impl std::io::Write for ChunkedWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let data = buf.to_vec();
        match self.sender.blocking_send(Ok(data)) {
            Ok(_) => Ok(buf.len()),
            Err(_) => Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "Channel closed",
            )),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
