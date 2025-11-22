use clap::Parser;
use cmux_sandbox::bubblewrap::BubblewrapService;
use cmux_sandbox::build_router;
use cmux_sandbox::DEFAULT_HTTP_PORT;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

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
    /// Directory used for logs
    #[arg(long, default_value = "/var/log/cmux", env = "CMUX_SANDBOX_LOG_DIR")]
    log_dir: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let options = Options::parse();
    let _guard = init_tracing(&options.log_dir);

    let bind_ip: IpAddr = options
        .bind
        .parse()
        .map_err(|error| anyhow::anyhow!("invalid bind address: {error}"))?;

    let service = Arc::new(BubblewrapService::new(options.data_dir, options.port).await?);
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

fn init_tracing(log_dir: &PathBuf) -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let stdout_layer = tracing_subscriber::fmt::layer().with_target(false);

    // Try to create log dir
    if let Err(e) = std::fs::create_dir_all(log_dir) {
        eprintln!(
            "Failed to create log directory {:?}: {}. Logging to file disabled.",
            log_dir, e
        );
        tracing_subscriber::registry()
            .with(filter)
            .with(stdout_layer)
            .init();
        return None;
    }

    let file_appender = tracing_appender::rolling::daily(log_dir, "cmux-sandboxd.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(non_blocking)
        .with_target(false)
        .with_ansi(false);

    tracing_subscriber::registry()
        .with(filter)
        .with(stdout_layer)
        .with(file_layer)
        .init();

    Some(guard)
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!("failed to listen for shutdown signal: {error}");
    }
    tracing::info!("shutdown signal received");
}
