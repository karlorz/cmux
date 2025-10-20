use std::net::SocketAddr;
use std::path::PathBuf;

use clap::Parser;
use cmux_novnc_proxy::{spawn_proxy, ProxyConfig};
use tracing::{error, info};

#[derive(Parser, Debug)]
#[command(author, version, about = "noVNC websocket proxy")]
struct Args {
    #[arg(long, env = "CMUX_NOVNC_LISTEN", default_value = "0.0.0.0:39380")]
    listen: SocketAddr,
    #[arg(long, env = "CMUX_NOVNC_TARGET", default_value = "127.0.0.1:5901")]
    target: SocketAddr,
    #[arg(long, env = "CMUX_NOVNC_WEB_ROOT", default_value = "/usr/share/novnc")]
    web_root: PathBuf,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .compact()
        .init();

    let config = ProxyConfig {
        listen: args.listen,
        target: args.target,
        web_root: args.web_root.clone(),
    };

    let (bound_addr, handle) = match spawn_proxy(config, async {
        let _ = tokio::signal::ctrl_c().await;
    }) {
        Ok(res) => res,
        Err(err) => {
            error!(error = %err, "failed to start proxy");
            std::process::exit(1);
        }
    };

    info!(listen = %bound_addr, target = %args.target, web_root = %args.web_root.display(), "noVNC proxy ready");

    if let Err(err) = handle.await {
        error!(error = %err, "proxy task exited unexpectedly");
        std::process::exit(1);
    }
}
