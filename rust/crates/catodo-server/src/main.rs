use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use catodo_platform::{data_dir, plugins_repo};
use catodo_server::channels::build_default_channels;
use catodo_server::config::RuntimeConfig;
use catodo_server::events::EventBroker;
use catodo_server::manager::ChannelManager;
use catodo_server::{router, ServerState};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().any(|argument| argument == "--version") {
        println!("catodo {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let host = std::env::var("CATODO_RS_BIND")
        .or_else(|_| std::env::var("CATODO_HOST"))
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("CATODO_RS_PORT")
        .or_else(|_| std::env::var("CATODO_PORT"))
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8769);
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .with_context(|| format!("invalid bind address: {host}:{port}"))?;

    let data = data_dir();
    let config = RuntimeConfig::new(data.clone());
    let broker = EventBroker::new();
    let manager = Arc::new(ChannelManager::new(broker.clone(), data.clone()));
    manager.init().await;

    let state = ServerState::new(env!("CARGO_PKG_VERSION"), config, broker, manager.clone());
    catodo_server::plugins::seed_bundled(&state).await;
    let _ = catodo_server::pair::token(&state).await;
    catodo_server::mqtt::start(&state).await;

    for channel in
        build_default_channels(&state.config, &plugins_repo(), &data, &state.broker).await
    {
        manager.register(channel).await?;
    }
    manager.reorder().await;
    let listener = TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    tracing::info!(%addr, "catodo-server listening");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")?;
    tracing::info!("catodo-server stopped");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
