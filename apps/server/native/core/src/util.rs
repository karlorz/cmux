use anyhow::{anyhow, Result};
use std::process::{Command, Stdio};

fn redact_git_arg(arg: &str) -> String {
    let lower = arg.to_ascii_lowercase();
    if lower.contains("http.extraheader=") || lower.contains("authorization:") {
        return "<redacted>".to_string();
    }

    // Redact credentials embedded in URLs (e.g. https://user:pass@host/...).
    for scheme in ["https://", "http://", "ssh://"] {
        if let Some(rest) = arg.strip_prefix(scheme) {
            if let Some(at) = rest.find('@') {
                return format!("{scheme}<redacted>@{}", &rest[at + 1..]);
            }
        }
    }

    arg.to_string()
}

fn redact_git_args(args: &[&str]) -> Vec<String> {
    args.iter().map(|a| redact_git_arg(a)).collect()
}

pub fn run_git(cwd: &str, args: &[&str]) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args).stdin(Stdio::null());
    let output = cmd.output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        let redacted = redact_git_args(args);
        Err(anyhow!("git {:?} failed: {}", redacted, err))
    }
}
