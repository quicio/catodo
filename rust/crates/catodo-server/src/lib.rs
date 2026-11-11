//! HTTP composition for the Cátodo Rust backend.

pub mod api;
pub mod arcade;
pub mod cast;
pub mod channels;
pub mod config;
pub mod events;
pub mod idle;
pub mod libraries;
pub mod lyrics;
pub mod manager;
pub mod media;
pub mod mixer;
pub mod modes;
pub mod mouse;
pub mod mqtt;
pub mod pair;
pub mod plugins;
pub mod spotify;
pub mod store;
pub mod tunnel;
pub mod voice;
pub mod wallpapers;
pub mod ws;

use std::sync::Arc;

use axum::Router;
use catodo_platform::PlatformInfo;

use crate::cast::CastManager;
use crate::config::RuntimeConfig;
use crate::events::EventBroker;
use crate::idle::IdleManager;
use crate::manager::ChannelManager;
use crate::tunnel::TunnelManager;

#[derive(Clone)]
pub struct ServerState {
    pub version: String,
    pub platform: PlatformInfo,
    pub config: RuntimeConfig,
    pub broker: EventBroker,
    pub manager: Arc<ChannelManager>,
    pub idle: Arc<IdleManager>,
    pub cast: Arc<CastManager>,
    pub tunnel: Arc<TunnelManager>,
}

impl ServerState {
    pub fn new(
        version: impl Into<String>,
        config: RuntimeConfig,
        broker: EventBroker,
        manager: Arc<ChannelManager>,
    ) -> Self {
        let idle = IdleManager::new(config.clone(), broker.clone());
        idle.start();
        let cast = CastManager::new(broker.clone());
        let tunnel = TunnelManager::new(config.clone(), config.store().data_dir());
        Self {
            version: version.into(),
            platform: PlatformInfo::detect(),
            config,
            broker,
            manager,
            idle,
            cast,
            tunnel,
        }
    }
}

pub fn router(state: ServerState) -> Router {
    api::router(state)
}
