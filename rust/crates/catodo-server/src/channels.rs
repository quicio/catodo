//! Channel registry: built-in placeholders plus declarative web plugins.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use catodo_domain::ChannelInfo;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tokio::sync::RwLock;

use crate::arcade::ArcadeChannel;
use crate::config::RuntimeConfig;
use crate::events::EventBroker;
use crate::media::build_media_channels;
use crate::spotify::{default_client, SpotifyChannel};

#[async_trait]
pub trait Channel: Send + Sync {
    fn info(&self) -> ChannelInfo;

    async fn open(&self) -> anyhow::Result<()>;
    async fn close(&self) -> anyhow::Result<()>;
    async fn state(&self) -> anyhow::Result<Value>;
    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()>;

    async fn episodes(&self) -> Vec<Value> {
        Vec::new()
    }

    async fn current_stream(&self) -> Option<PathBuf> {
        None
    }

    async fn boxart(&self, _rel: &str) -> Option<PathBuf> {
        None
    }

    async fn history_state(&self) -> Value {
        json!({})
    }
}

#[derive(Debug, Clone, Deserialize)]
struct Manifest {
    id: String,
    name: String,
    #[serde(default)]
    version: String,
    #[serde(rename = "type")]
    channel_type: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    color: String,
    #[serde(default)]
    order: Option<i64>,
    #[serde(default)]
    url: String,
    #[serde(default)]
    search_url: Option<String>,
    #[serde(default)]
    user_agent: Option<String>,
    #[serde(default)]
    partition: Option<String>,
    #[serde(default)]
    config_key: Option<String>,
    #[serde(default)]
    media_keys: Option<Value>,
}

fn valid_manifest(manifest: &Manifest) -> bool {
    if manifest.id.is_empty() || manifest.name.is_empty() || manifest.channel_type != "web" {
        return false;
    }
    if !manifest
        .id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return false;
    }
    if manifest.url.is_empty() {
        return false;
    }
    let parts: Vec<&str> = manifest.version.split('.').collect();
    parts.len() >= 3 && parts.iter().take(3).all(|p| p.parse::<u64>().is_ok())
}

pub struct WebChannel {
    manifest: Manifest,
    config: RuntimeConfig,
    open: AtomicBool,
    current_url: RwLock<Option<String>>,
}

impl WebChannel {
    fn new(manifest: Manifest, config: RuntimeConfig) -> Self {
        Self {
            manifest,
            config,
            open: AtomicBool::new(false),
            current_url: RwLock::new(None),
        }
    }

    fn default_partition(&self) -> String {
        self.manifest
            .partition
            .clone()
            .unwrap_or_else(|| format!("persist:{}", self.manifest.id))
    }

    fn user_agent(&self) -> String {
        match self.manifest.user_agent.as_deref() {
            Some("chrome") => "chrome".to_string(),
            Some("android-tv") => "android-tv".to_string(),
            _ => "default".to_string(),
        }
    }

    async fn configured_url(&self) -> String {
        let channel_key = format!("channel_{}_url", self.manifest.id);
        if let Some(value) = self.config.get_string(&channel_key).await {
            if !value.is_empty() {
                return value;
            }
        }
        if let Some(key) = self.manifest.config_key.as_deref() {
            if let Some(value) = self.config.get_string(key).await {
                if !value.is_empty() {
                    return value;
                }
            }
        }
        self.manifest.url.clone()
    }

    fn same_host(&self, url: &str) -> bool {
        let (Ok(candidate), Ok(base)) = (url::Url::parse(url), url::Url::parse(&self.manifest.url))
        else {
            return false;
        };
        candidate.host_str() == base.host_str()
    }
}

#[async_trait]
impl Channel for WebChannel {
    fn info(&self) -> ChannelInfo {
        ChannelInfo {
            id: self.manifest.id.clone(),
            name: self.manifest.name.clone(),
            icon: if self.manifest.icon.is_empty() {
                "web".to_string()
            } else {
                self.manifest.icon.clone()
            },
            channel_type: self.manifest.channel_type.clone(),
            capabilities: Vec::new(),
            order: self.manifest.order,
            color: if self.manifest.color.is_empty() {
                None
            } else {
                Some(self.manifest.color.clone())
            },
            partition: Some(self.default_partition()),
            user_agent: Some(self.user_agent()),
            search_url: self.manifest.search_url.clone(),
            media_keys: self.manifest.media_keys.clone(),
        }
    }

    async fn open(&self) -> anyhow::Result<()> {
        self.open.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.open.store(false, Ordering::SeqCst);
        Ok(())
    }

    async fn state(&self) -> anyhow::Result<Value> {
        let configured = self.configured_url().await;
        let current = self.current_url.read().await.clone();
        Ok(json!({
            "id": self.manifest.id,
            "open": self.open.load(Ordering::SeqCst),
            "url": current.unwrap_or_else(|| configured.clone()),
            "configured_url": configured,
            "partition": self.default_partition(),
            "user_agent": self.user_agent(),
            "search_url": self.manifest.search_url,
        }))
    }

    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()> {
        match command {
            "set_url" => {
                if let Some(url) = args.get("url").and_then(Value::as_str) {
                    self.config
                        .set(&format!("channel_{}_url", self.manifest.id), json!(url))
                        .await?;
                }
            }
            "navigate" => {
                if let Some(url) = args.get("url").and_then(Value::as_str) {
                    if self.same_host(url) {
                        *self.current_url.write().await = Some(url.to_string());
                    }
                }
            }
            "search" => {
                if let Some(template) = self.manifest.search_url.as_deref() {
                    let query = args
                        .get("query")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    if query.is_empty() {
                        return Ok(());
                    }
                    let encoded: String =
                        url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
                    let url = template.replace("{query}", &encoded);
                    if self.same_host(&url) {
                        *self.current_url.write().await = Some(url);
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
}

pub struct PlaceholderChannel {
    info: ChannelInfo,
    open: AtomicBool,
    available: bool,
}

impl PlaceholderChannel {
    fn new(info: ChannelInfo) -> Self {
        Self {
            info,
            open: AtomicBool::new(false),
            available: false,
        }
    }
}

#[async_trait]
impl Channel for PlaceholderChannel {
    fn info(&self) -> ChannelInfo {
        self.info.clone()
    }

    async fn open(&self) -> anyhow::Result<()> {
        self.open.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.open.store(false, Ordering::SeqCst);
        Ok(())
    }

    async fn state(&self) -> anyhow::Result<Value> {
        Ok(json!({
            "id": self.info.id,
            "available": self.available,
            "open": self.open.load(Ordering::SeqCst),
        }))
    }

    async fn command(&self, _command: &str, _args: Map<String, Value>) -> anyhow::Result<()> {
        Ok(())
    }
}

fn read_manifests(dir: &Path, manifests: &mut HashMap<String, Manifest>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let manifest_path = entry.path().join("manifest.json");
        let Ok(text) = std::fs::read_to_string(manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<Manifest>(&text) else {
            continue;
        };
        if valid_manifest(&manifest) {
            manifests.insert(manifest.id.clone(), manifest);
        }
    }
}

pub async fn build_default_channels(
    config: &RuntimeConfig,
    plugins_repo: &Path,
    data_dir: &Path,
    broker: &EventBroker,
) -> Vec<Arc<dyn Channel>> {
    let mut channels: Vec<Arc<dyn Channel>> = Vec::new();
    if let Some(client) = default_client() {
        let spotify = Arc::new(SpotifyChannel::new(
            client,
            broker.clone(),
            data_dir.to_path_buf(),
        ));
        spotify.start();
        channels.push(spotify);
    }
    channels.extend(build_media_channels(config, broker, data_dir).await);
    channels.push(ArcadeChannel::new(config.clone(), broker.clone()));
    channels.push(Arc::new(PlaceholderChannel::new(
        ChannelInfo::new("screen-cast", "Pantalla", "cast")
            .with_icon("cast")
            .with_order(100),
    )));
    let mut manifests: HashMap<String, Manifest> = HashMap::new();
    read_manifests(plugins_repo, &mut manifests);
    read_manifests(&data_dir.join("plugins"), &mut manifests);

    let mut plugin_channels: Vec<Arc<dyn Channel>> = manifests
        .into_values()
        .map(|manifest| Arc::new(WebChannel::new(manifest, config.clone())) as Arc<dyn Channel>)
        .collect();
    plugin_channels.sort_by_key(|channel| {
        let info = channel.info();
        (
            info.order.is_none(),
            info.order.unwrap_or(i64::MAX),
            info.name,
        )
    });
    channels.extend(plugin_channels);
    channels
}

pub fn channel_from_manifest(
    manifest_path: &Path,
    config: &RuntimeConfig,
) -> Option<Arc<dyn Channel>> {
    let text = std::fs::read_to_string(manifest_path).ok()?;
    let manifest = serde_json::from_str::<Manifest>(&text).ok()?;
    valid_manifest(&manifest)
        .then(|| Arc::new(WebChannel::new(manifest, config.clone())) as Arc<dyn Channel>)
}

pub fn default_plugins_repo() -> PathBuf {
    catodo_platform::plugins_repo()
}
