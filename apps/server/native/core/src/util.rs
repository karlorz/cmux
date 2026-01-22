use anyhow::{anyhow, Result};
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

/// Run a git command with an authentication token via http.extraheader.
/// This is useful for fetch/pull operations on private repos.
pub fn run_git_with_auth(cwd: &str, args: &[&str], auth_token: Option<&str>) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).stdin(Stdio::null());

    if let Some(token) = auth_token {
        if !token.is_empty() {
            // Use -c to set the Authorization header for this command only
            cmd.arg("-c")
                .arg(format!("http.extraheader=Authorization: token {}", token));
        }
    }

    cmd.args(args);
    let output = cmd.output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("git {:?} failed: {}", args, err))
    }
}
