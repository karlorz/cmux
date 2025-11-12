#![deny(clippy::all)]

mod types;
mod util;
mod repo;
mod diff;
mod merge_base;
mod branches;
mod proxy;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use types::{BranchInfo, DiffEntry, GitDiffOptions, GitListRemoteBranchesOptions};
use proxy::{ProxyConfig, ProxyServer};
use proxy::types::{ProxyOptions, ProxyStats};
use std::sync::Arc;
use once_cell::sync::OnceCell;
use tracing::error;

#[napi]
pub async fn get_time() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  #[cfg(debug_assertions)]
  println!("[cmux_native_core] get_time invoked");
  let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
  now.as_millis().to_string()
}

#[napi]
pub async fn git_diff(opts: GitDiffOptions) -> Result<Vec<DiffEntry>> {
  #[cfg(debug_assertions)]
  println!(
    "[cmux_native_git] git_diff headRef={} baseRef={:?} originPathOverride={:?} repoUrl={:?} repoFullName={:?} includeContents={:?} maxBytes={:?}",
    opts.headRef,
    opts.baseRef,
    opts.originPathOverride,
    opts.repoUrl,
    opts.repoFullName,
    opts.includeContents,
    opts.maxBytes
  );
  tokio::task::spawn_blocking(move || diff::refs::diff_refs(opts))
    .await
    .map_err(|e| Error::from_reason(format!("Join error: {e}")))?
    .map_err(|e| Error::from_reason(format!("{e:#}")))
}

#[napi]
pub async fn git_list_remote_branches(opts: GitListRemoteBranchesOptions) -> Result<Vec<BranchInfo>> {
  #[cfg(debug_assertions)]
  println!(
    "[cmux_native_git] git_list_remote_branches repoFullName={:?} repoUrl={:?} originPathOverride={:?}",
    opts.repoFullName,
    opts.repoUrl,
    opts.originPathOverride
  );
  tokio::task::spawn_blocking(move || branches::list_remote_branches(opts))
    .await
    .map_err(|e| Error::from_reason(format!("Join error: {e}")))?
    .map_err(|e| Error::from_reason(format!("{e:#}")))
}

// Global proxy server instance
static PROXY_SERVER: OnceCell<Arc<ProxyServer>> = OnceCell::new();

#[napi]
pub async fn start_proxy_server(opts: ProxyOptions) -> Result<()> {
  #[cfg(debug_assertions)]
  println!(
    "[cmux_native_core] Starting proxy server on port {} with HTTP/2={:?} WebSockets={:?}",
    opts.listen_port,
    opts.enable_http2,
    opts.enable_websockets
  );

  // Initialize tracing
  if std::env::var("RUST_LOG").is_err() {
    std::env::set_var("RUST_LOG", "info");
  }
  let _ = tracing_subscriber::fmt::try_init();

  // Create proxy configuration
  let config = ProxyConfig::from_options(opts);

  // Create and store the proxy server
  let server = Arc::new(
    ProxyServer::new(config)
      .map_err(|e| Error::from_reason(format!("Failed to create proxy server: {e}")))?
  );

  // Store the server instance globally
  PROXY_SERVER.set(server.clone())
    .map_err(|_| Error::from_reason("Proxy server already running"))?;

  // Start the server in a background task
  let server_clone = server.clone();
  tokio::spawn(async move {
    if let Err(e) = server_clone.start().await {
      error!("Proxy server error: {e}");
    }
  });

  Ok(())
}

#[napi]
pub async fn stop_proxy_server() -> Result<()> {
  #[cfg(debug_assertions)]
  println!("[cmux_native_core] Stopping proxy server");

  // Clear the global instance
  if PROXY_SERVER.get().is_some() {
    // In production, we'd implement graceful shutdown
    // For now, just clear the reference
    // The tokio task will continue running until the process ends
    Ok(())
  } else {
    Err(Error::from_reason("Proxy server is not running"))
  }
}

#[napi]
pub async fn get_proxy_stats() -> Result<ProxyStats> {
  #[cfg(debug_assertions)]
  println!("[cmux_native_core] Getting proxy stats");

  if let Some(server) = PROXY_SERVER.get() {
    Ok(server.get_stats().await)
  } else {
    Err(Error::from_reason("Proxy server is not running"))
  }
}

#[cfg(test)]
mod tests;
