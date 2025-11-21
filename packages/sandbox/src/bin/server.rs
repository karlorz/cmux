use clap::Parser;
use cmux_sandbox::bubblewrap::BubblewrapService;
use cmux_sandbox::build_router;
use cmux_sandbox::DEFAULT_HTTP_PORT;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "cmux-sandboxd", author, version)]
struct Options {
    /// Address the HTTP server binds to
    #[arg(long, default_value = "0.0.0.0")]
    bind: String,
    /// Port for the HTTP server
    #[arg(long, default_value_t = DEFAULT_HTTP_PORT, env = "CMUX_SANDBOX_PORT")]
    port: u16,
    /// Directory used for sandbox workspaces
    #[arg(long, default_value = "/var/lib/cmux/sandboxes")]
    data_dir: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let options = Options::parse();
    init_tracing();

    let bind_ip: IpAddr = options
        .bind
        .parse()
        .map_err(|error| anyhow::anyhow!("invalid bind address: {error}"))?;

    let service = Arc::new(BubblewrapService::new(options.data_dir).await?);
    let app = build_router(service);

    let addr = SocketAddr::new(bind_ip, options.port);
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("cmux-sandboxd listening on http://{}", addr);
    tracing::info!("HTTP/1.1 and HTTP/2 are enabled");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .init();
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!("failed to listen for shutdown signal: {error}");
    }
    tracing::info!("shutdown signal received");
}
