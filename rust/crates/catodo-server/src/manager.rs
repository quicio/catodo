//! Channel registry and global state.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Instant;

use catodo_domain::{AppState, ChannelInfo};
use serde_json::{json, Map, Value};
use tokio::sync::{Mutex, RwLock};

use crate::channels::Channel;
use crate::events::EventBroker;
use crate::mixer;
use crate::store::Store;

const HISTORY_SIZE: usize = 16;

pub struct ChannelManager {
    channels: RwLock<HashMap<String, Arc<dyn Channel>>>,
    order: RwLock<Vec<String>>,
    current: RwLock<Option<String>>,
    history: Mutex<VecDeque<String>>,
    broker: EventBroker,
    store: Store,
    volume: AtomicU8,
    playing: AtomicBool,
    last_channel_id: RwLock<Option<String>>,
    started_at: Instant,
}

impl ChannelManager {
    pub fn new(broker: EventBroker, data_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            channels: RwLock::new(HashMap::new()),
            order: RwLock::new(Vec::new()),
            current: RwLock::new(None),
            history: Mutex::new(VecDeque::with_capacity(HISTORY_SIZE)),
            broker,
            store: Store::new(data_dir),
            volume: AtomicU8::new(50),
            playing: AtomicBool::new(false),
            last_channel_id: RwLock::new(None),
            started_at: Instant::now(),
        }
    }

    pub async fn init(&self) {
        let value = self.store.load("last_state", json!({"channel": null}));
        let channel = value.get("channel").and_then(Value::as_str);
        *self.last_channel_id.write().await = channel.map(str::to_string);
        if let Some(level) = mixer::get_volume().await {
            self.volume.store(level, Ordering::SeqCst);
        }
    }

    pub async fn register(&self, channel: Arc<dyn Channel>) -> anyhow::Result<()> {
        let id = channel.info().id;
        let mut channels = self.channels.write().await;
        if channels.contains_key(&id) {
            anyhow::bail!("channel already registered: {id}");
        }
        channels.insert(id.clone(), channel);
        self.order.write().await.push(id);
        Ok(())
    }

    pub async fn reorder(&self) {
        let channels = self.channels.read().await;
        let mut order = self.order.write().await;
        order.sort_by_key(|id| {
            let info = channels[id].info();
            (
                info.order.is_none(),
                info.order.unwrap_or(i64::MAX),
                info.name.to_lowercase(),
            )
        });
    }

    pub async fn list(&self) -> Vec<ChannelInfo> {
        let channels = self.channels.read().await;
        let order = self.order.read().await;
        order
            .iter()
            .filter_map(|id| channels.get(id).map(|channel| channel.info()))
            .collect()
    }

    pub async fn get(&self, id: &str) -> Option<Arc<dyn Channel>> {
        self.channels.read().await.get(id).cloned()
    }

    pub async fn current(&self) -> Option<String> {
        self.current.read().await.clone()
    }

    pub async fn open(&self, channel_id: &str) -> anyhow::Result<()> {
        let channel = self
            .get(channel_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("unknown channel: {channel_id}"))?;

        let previous = self.current.read().await.clone();
        if let Some(previous) = previous {
            if previous != channel_id {
                if let Some(old) = self.get(&previous).await {
                    let _ = old.close().await;
                }
            }
        }

        *self.current.write().await = Some(channel_id.to_string());
        {
            let mut history = self.history.lock().await;
            history.push_back(channel_id.to_string());
            while history.len() > HISTORY_SIZE {
                history.pop_front();
            }
        }
        channel.open().await?;
        if let Some(sinks) = self
            .store
            .load("config", json!({}))
            .get("channel_audio_sinks")
            .and_then(Value::as_object)
        {
            if let Some(sink) = sinks.get(channel_id).and_then(Value::as_str) {
                let _ = mixer::set_default_sink(sink).await;
            }
        }
        self.broker.publish(json!({
            "event": "channel_changed",
            "channel_id": channel_id,
        }));
        self.save_last_channel(channel_id).await;
        Ok(())
    }

    pub async fn close(&self, channel_id: &str) -> anyhow::Result<()> {
        let channel = self
            .get(channel_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("unknown channel: {channel_id}"))?;
        channel.close().await?;
        if self.current.read().await.as_deref() == Some(channel_id) {
            *self.current.write().await = None;
        }
        self.broker.publish(json!({
            "event": "channel_closed",
            "channel_id": channel_id,
        }));
        Ok(())
    }

    pub async fn close_all(&self) {
        let channels: Vec<_> = self.channels.read().await.values().cloned().collect();
        for channel in channels {
            let _ = channel.close().await;
        }
        *self.current.write().await = None;
    }

    pub async fn next(&self) -> anyhow::Result<String> {
        let order = self.order.read().await.clone();
        if order.is_empty() {
            anyhow::bail!("no channels registered");
        }
        let current = self.current.read().await.clone();
        let target = match current {
            None => order[0].clone(),
            Some(current) => {
                let index = order.iter().position(|id| id == &current).unwrap_or(0);
                order[(index + 1) % order.len()].clone()
            }
        };
        self.open(&target).await?;
        Ok(target)
    }

    pub async fn previous(&self) -> anyhow::Result<String> {
        let order = self.order.read().await.clone();
        if order.is_empty() {
            anyhow::bail!("no channels registered");
        }
        let current = self.current.read().await.clone();
        let target = match current {
            None => order[order.len() - 1].clone(),
            Some(current) => {
                let index = order.iter().position(|id| id == &current).unwrap_or(0);
                order[(index + order.len() - 1) % order.len()].clone()
            }
        };
        self.open(&target).await?;
        Ok(target)
    }

    pub async fn command(
        &self,
        channel_id: &str,
        command: &str,
        args: Map<String, Value>,
    ) -> anyhow::Result<()> {
        let channel = self
            .get(channel_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("unknown channel: {channel_id}"))?;
        channel.command(command, args).await?;

        if matches!(command, "play" | "pause" | "toggle" | "next" | "prev") {
            if let Ok(state) = channel.state().await {
                if let Some(playing) = playing_from_state(&state) {
                    if playing != self.playing.load(Ordering::SeqCst) {
                        self.playing.store(playing, Ordering::SeqCst);
                        self.broker
                            .publish(json!({"event": "playing_changed", "playing": playing}));
                    }
                }
            }
        }

        if matches!(command, "navigate" | "search") {
            if let Ok(state) = channel.state().await {
                self.broker.publish(json!({
                    "event": "channel_changed",
                    "channel_id": channel_id,
                    "state": state,
                }));
            }
        }
        Ok(())
    }

    pub async fn set_volume(&self, level: i64) -> u8 {
        let level = level.clamp(0, 100) as u8;
        let applied = mixer::set_volume(level).await;
        if !applied {
            if let Some(current) = self.current().await {
                if let Some(channel) = self.get(&current).await {
                    let mut args = Map::new();
                    args.insert("level".to_string(), json!(f64::from(level) / 100.0));
                    let _ = channel.command("volume", args).await;
                }
            }
        }
        self.volume.store(level, Ordering::SeqCst);
        self.broker
            .publish(json!({"event": "volume_changed", "volume": level}));
        level
    }

    pub async fn adjust_volume(&self, delta: i64) -> u8 {
        let current = i64::from(self.volume.load(Ordering::SeqCst));
        self.set_volume(current + delta).await
    }

    pub async fn state(&self) -> AppState {
        let history = self.history.lock().await.iter().cloned().collect();
        AppState {
            current_channel_id: self.current().await,
            playing: self.playing.load(Ordering::SeqCst),
            volume: self.volume.load(Ordering::SeqCst),
            available_channels: self.list().await,
            history,
            last_channel_id: self.last_channel_id.read().await.clone(),
            uptime_seconds: self.started_at.elapsed().as_secs(),
        }
    }

    pub async fn channel_states(&self) -> Map<String, Value> {
        let channels = self.channels.read().await;
        let order = self.order.read().await;
        let mut states = Map::new();
        for id in order.iter() {
            if let Some(channel) = channels.get(id) {
                if let Ok(state) = channel.state().await {
                    states.insert(id.clone(), state);
                }
            }
        }
        states
    }

    pub async fn unregister(&self, channel_id: &str) {
        self.channels.write().await.remove(channel_id);
        self.order.write().await.retain(|id| id != channel_id);
        if self.current.read().await.as_deref() == Some(channel_id) {
            *self.current.write().await = None;
        }
    }

    async fn save_last_channel(&self, channel_id: &str) {
        *self.last_channel_id.write().await = Some(channel_id.to_string());
        let _ = self
            .store
            .save("last_state", &json!({"channel": channel_id}))
            .await;
    }
}

fn playing_from_state(state: &Value) -> Option<bool> {
    if let Some(playing) = state.get("playing").and_then(Value::as_bool) {
        return Some(playing);
    }
    match state.get("status").and_then(Value::as_str) {
        Some("Playing") => Some(true),
        Some("Paused" | "Stopped") => Some(false),
        _ => None,
    }
}
