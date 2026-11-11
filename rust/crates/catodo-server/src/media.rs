//! Local media library channels (Anime and configured libraries).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use catodo_domain::ChannelInfo;
use serde_json::{json, Map, Value};
use tokio::sync::{Mutex, RwLock};

use crate::channels::Channel;
use crate::config::RuntimeConfig;
use crate::events::EventBroker;
use crate::store::Store;

const VIDEO_EXTS: &[&str] = &["mp4", "mkv", "avi", "webm", "mov"];
const SCAN_TTL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone)]
struct Episode {
    path: String,
    name: String,
    series: String,
    season: String,
    rel: String,
}

impl Episode {
    fn to_value(&self) -> Value {
        json!({
            "path": self.path,
            "name": self.name,
            "series": self.series,
            "season": self.season,
            "rel": self.rel,
        })
    }
}

#[derive(Debug, Clone)]
struct Library {
    id: String,
    name: String,
    path: PathBuf,
    kind: String,
    order: i64,
}

pub struct MediaChannel {
    info: ChannelInfo,
    library: Library,
    episodes: RwLock<Vec<Episode>>,
    current: RwLock<Option<usize>>,
    playing: AtomicBool,
    broker: EventBroker,
    store: Store,
    progress_key: String,
    scanned_at: Mutex<Option<Instant>>,
}

impl MediaChannel {
    fn new(library: Library, broker: EventBroker, data_dir: impl Into<PathBuf>) -> Self {
        let progress_key = if library.id == "anime" {
            "anime_progress".to_string()
        } else {
            format!("media_progress_{}", library.id)
        };
        Self {
            info: ChannelInfo::new(&library.id, &library.name, "app")
                .with_icon("tv")
                .with_order(library.order),
            library,
            episodes: RwLock::new(Vec::new()),
            current: RwLock::new(None),
            playing: AtomicBool::new(false),
            broker,
            store: Store::new(data_dir),
            progress_key,
            scanned_at: Mutex::new(None),
        }
    }

    async fn refresh(&self) {
        let fresh = {
            let scanned = self.scanned_at.lock().await;
            scanned.is_some_and(|at| at.elapsed() < SCAN_TTL)
        };
        if fresh {
            return;
        }
        let episodes = scan(&self.library.path, &self.library.kind);
        let mut current = self.current.write().await;
        if current.is_none() && !episodes.is_empty() {
            *current = Some(0);
        }
        *self.episodes.write().await = episodes;
        *self.scanned_at.lock().await = Some(Instant::now());
    }

    async fn episode_values(&self) -> Vec<Value> {
        self.episodes
            .read()
            .await
            .iter()
            .map(Episode::to_value)
            .collect()
    }

    async fn current_episode(&self) -> Option<Episode> {
        let current = *self.current.read().await;
        let episodes = self.episodes.read().await;
        current.and_then(|index| episodes.get(index).cloned())
    }

    async fn set_current(&self, index: usize) -> Option<Episode> {
        let episode = self.episodes.read().await.get(index).cloned();
        if episode.is_some() {
            *self.current.write().await = Some(index);
        }
        episode
    }

    async fn next_episode(&self) -> Option<Episode> {
        let len = self.episodes.read().await.len();
        if len == 0 {
            return None;
        }
        let current = *self.current.read().await;
        let index = current.map(|index| (index + 1) % len).unwrap_or(0);
        self.set_current(index).await
    }

    async fn previous_episode(&self) -> Option<Episode> {
        let len = self.episodes.read().await.len();
        if len == 0 {
            return None;
        }
        let current = *self.current.read().await;
        let index = current
            .map(|index| (index + len - 1) % len)
            .unwrap_or(len - 1);
        self.set_current(index).await
    }

    async fn select_episode(&self, rel: &str) -> Option<Episode> {
        let index = self
            .episodes
            .read()
            .await
            .iter()
            .position(|episode| episode.rel == rel || episode.path == rel)?;
        self.set_current(index).await
    }

    async fn publish_episode(&self, episode: &Episode) {
        self.broker.publish(json!({
            "event": "episode_changed",
            "channel_id": self.info.id,
            "episode": episode.to_value(),
        }));
    }

    async fn save_progress(&self, rel: &str, position: f64, duration: f64) {
        let mut data = self
            .store
            .load(&self.progress_key, json!({"version": 1, "items": {}}));
        if !data.get("items").is_some_and(Value::is_object) {
            data["items"] = json!({});
        }
        if let Some(items) = data.get_mut("items").and_then(Value::as_object_mut) {
            items.insert(
                rel.to_string(),
                json!({
                    "position": position,
                    "watched": duration > 0.0 && position / duration >= 0.95,
                }),
            );
        }
        let _ = self.store.save(&self.progress_key, &data).await;
    }
}

#[async_trait]
impl Channel for MediaChannel {
    fn info(&self) -> ChannelInfo {
        self.info.clone()
    }

    async fn open(&self) -> anyhow::Result<()> {
        self.playing.store(true, Ordering::SeqCst);
        self.refresh().await;
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.playing.store(false, Ordering::SeqCst);
        Ok(())
    }

    async fn state(&self) -> anyhow::Result<Value> {
        self.refresh().await;
        let episodes = self.episode_values().await;
        let mut series: Map<String, Value> = Map::new();
        for episode in &episodes {
            let name = episode
                .get("series")
                .and_then(Value::as_str)
                .unwrap_or("Sin serie")
                .to_string();
            if let Some(list) = series
                .entry(name.clone())
                .or_insert_with(|| json!({"name": name, "episodes": []}))
                .get_mut("episodes")
                .and_then(Value::as_array_mut)
            {
                list.push(episode.clone());
            }
        }
        let current = self.current_episode().await;
        Ok(json!({
            "id": self.info.id,
            "name": self.info.name,
            "kind": self.library.kind,
            "base": self.library.path,
            "count": episodes.len(),
            "series": series,
            "current": current.map(|episode| episode.to_value()),
            "playing": self.playing.load(Ordering::SeqCst),
        }))
    }

    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()> {
        match command {
            "play" => self.playing.store(true, Ordering::SeqCst),
            "pause" => self.playing.store(false, Ordering::SeqCst),
            "set_episode" => {
                let rel = args
                    .get("episode")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if let Some(episode) = self.select_episode(rel).await {
                    self.playing.store(true, Ordering::SeqCst);
                    self.publish_episode(&episode).await;
                }
            }
            "next" => {
                if let Some(episode) = self.next_episode().await {
                    self.playing.store(true, Ordering::SeqCst);
                    self.publish_episode(&episode).await;
                }
            }
            "prev" => {
                if let Some(episode) = self.previous_episode().await {
                    self.playing.store(true, Ordering::SeqCst);
                    self.publish_episode(&episode).await;
                }
            }
            "seek" => {
                if let Some(episode) = self.current_episode().await {
                    let position = args.get("position").and_then(Value::as_f64).unwrap_or(0.0);
                    let duration = args.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
                    self.save_progress(&episode.rel, position, duration).await;
                }
            }
            "end" => {
                if let Some(episode) = self.current_episode().await {
                    self.save_progress(&episode.rel, 0.0, 1.0).await;
                }
            }
            "refresh" => {
                *self.scanned_at.lock().await = None;
                self.refresh().await;
            }
            _ => {}
        }
        Ok(())
    }

    async fn episodes(&self) -> Vec<Value> {
        self.episode_values().await
    }

    async fn current_stream(&self) -> Option<PathBuf> {
        self.current_episode()
            .await
            .map(|episode| PathBuf::from(episode.path))
    }
}

fn scan(base: &Path, kind: &str) -> Vec<Episode> {
    let mut episodes = Vec::new();
    walk(base, base, kind, &mut episodes);
    episodes.sort_by(|a, b| a.rel.cmp(&b.rel));
    episodes
}

fn walk(base: &Path, dir: &Path, kind: &str, episodes: &mut Vec<Episode>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            walk(base, &path, kind, episodes);
            continue;
        }
        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if !VIDEO_EXTS.contains(&extension.to_lowercase().as_str()) {
            continue;
        }
        let Ok(rel) = path.strip_prefix(base) else {
            continue;
        };
        let parts: Vec<String> = rel
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_string())
            .collect();
        let name = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        let series = if parts.len() > 1 {
            parts[0].clone()
        } else if kind == "movies" {
            "Películas".to_string()
        } else {
            "Sin serie".to_string()
        };
        let season = if kind != "movies" && parts.len() > 2 {
            parts[1].clone()
        } else {
            String::new()
        };
        episodes.push(Episode {
            path: path.to_string_lossy().to_string(),
            name,
            series,
            season,
            rel: rel.to_string_lossy().to_string(),
        });
    }
}

pub fn channel_from_config_entry(
    entry: &Value,
    broker: &EventBroker,
    data_dir: &Path,
) -> Option<Arc<dyn Channel>> {
    let id = entry.get("id").and_then(Value::as_str)?;
    let name = entry.get("name").and_then(Value::as_str).unwrap_or(id);
    let path = entry.get("path").and_then(Value::as_str)?;
    let kind = entry
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("series");
    Some(Arc::new(MediaChannel::new(
        Library {
            id: id.to_string(),
            name: name.to_string(),
            path: PathBuf::from(path),
            kind: if kind == "movies" { "movies" } else { "series" }.to_string(),
            order: 6,
        },
        broker.clone(),
        data_dir.to_path_buf(),
    )) as Arc<dyn Channel>)
}

pub async fn build_media_channels(
    config: &RuntimeConfig,
    broker: &EventBroker,
    data_dir: &Path,
) -> Vec<Arc<dyn Channel>> {
    let mut libraries = Vec::new();
    let anime_dir = config
        .get_string("anime_dir")
        .await
        .unwrap_or_else(|| format!("{}/Anime", std::env::var("HOME").unwrap_or_default()));
    libraries.push(Library {
        id: "anime".to_string(),
        name: "Anime".to_string(),
        path: PathBuf::from(anime_dir),
        kind: "series".to_string(),
        order: 2,
    });

    if let Some(entries) = config.get("libraries").await.as_array().cloned() {
        for (index, entry) in entries.iter().enumerate() {
            let Some(id) = entry.get("id").and_then(Value::as_str) else {
                continue;
            };
            let name = entry.get("name").and_then(Value::as_str).unwrap_or(id);
            let path = entry.get("path").and_then(Value::as_str).unwrap_or("");
            let kind = entry
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("series");
            libraries.push(Library {
                id: id.to_string(),
                name: name.to_string(),
                path: PathBuf::from(path),
                kind: if kind == "movies" { "movies" } else { "series" }.to_string(),
                order: 6 + index as i64,
            });
        }
    }

    libraries
        .into_iter()
        .map(|library| {
            Arc::new(MediaChannel::new(
                library,
                broker.clone(),
                data_dir.to_path_buf(),
            )) as Arc<dyn Channel>
        })
        .collect()
}
