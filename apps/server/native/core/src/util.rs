use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use std::process::{Command, Stdio};

pub fn run_git(cwd: &str, args: &[&str]) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args).stdin(Stdio::null());
    let output = cmd.output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("git {:?} failed: {}", args, err))
    }
}

pub fn run_git_with_config_env(cwd: &str, args: &[&str], configs: &[(&str, String)]) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args).stdin(Stdio::null());

    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GCM_INTERACTIVE", "never");

    if !configs.is_empty() {
        cmd.env("GIT_CONFIG_COUNT", configs.len().to_string());
        for (i, (k, v)) in configs.iter().enumerate() {
            cmd.env(format!("GIT_CONFIG_KEY_{}", i), k);
            cmd.env(format!("GIT_CONFIG_VALUE_{}", i), v);
        }
    }

    let output = cmd.output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("git {:?} failed: {}", args, err))
    }
}

pub fn github_http_extraheader_value(token: &str) -> String {
    // GitHub supports HTTP basic auth with username "x-access-token" and password "{token}".
    // We scope the header to github.com via a host-specific http.*.extraheader config key.
    let raw = format!("x-access-token:{token}");
    let enc = general_purpose::STANDARD.encode(raw.as_bytes());
    format!("AUTHORIZATION: basic {enc}")
}
