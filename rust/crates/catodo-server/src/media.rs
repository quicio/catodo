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
    collection: String,
    series: String,
    season: String,
    rel: String,
}

impl Episode {
    fn to_value(&self) -> Value {
        json!({
            "path": self.path,
            "name": self.name,
            "collection": self.collection,
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
    icon: String,
    color: Option<String>,
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
        let progress_key = format!("media_progress_{}", library.id);
        Self {
            info: ChannelInfo::new(&library.id, &library.name, "app")
                .with_icon(if library.icon.is_empty() {
                    "clapperboard"
                } else {
                    &library.icon
                })
                .with_order(library.order)
                .with_color(library.color.clone()),
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
        // El scan recorre el disco: no debe bloquear el runtime async.
        let base = self.library.path.clone();
        let kind = self.library.kind.clone();
        let episodes = tokio::task::spawn_blocking(move || scan(&base, &kind))
            .await
            .unwrap_or_default();
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
        // Estructura por modo:
        //   series      → <Serie>/<Temporada?>/<episodio>
        //   movies      → lista plana (las carpetas no agrupan)
        //   collections → <Colección>/<Serie>/<Temporada?>/<episodio>
        let (collection, series, season) = match kind {
            "movies" => (String::new(), "Películas".to_string(), String::new()),
            "collections" => {
                let collection = parts.first().cloned().unwrap_or_default();
                let series = if parts.len() > 2 {
                    parts[1].clone()
                } else if collection.is_empty() {
                    "Sin serie".to_string()
                } else {
                    collection.clone()
                };
                let season = if parts.len() > 3 {
                    parts[2].clone()
                } else {
                    String::new()
                };
                (collection, series, season)
            }
            _ => {
                let series = if parts.len() > 1 {
                    parts[0].clone()
                } else {
                    "Sin serie".to_string()
                };
                let season = if parts.len() > 2 {
                    parts[1].clone()
                } else {
                    String::new()
                };
                (String::new(), series, season)
            }
        };
        episodes.push(Episode {
            path: path.to_string_lossy().to_string(),
            name,
            collection,
            series,
            season,
            rel: rel.to_string_lossy().to_string(),
        });
    }
}

fn library_from_entry(entry: &Value, index: usize) -> Option<Library> {
    let id = entry.get("id").and_then(Value::as_str)?.to_string();
    let path = entry.get("path").and_then(Value::as_str).unwrap_or("");
    if path.is_empty() {
        return None;
    }
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&id)
        .to_string();
    let kind = match entry.get("kind").and_then(Value::as_str) {
        Some("videos" | "movies") => "movies",
        Some("collections" | "collection") => "collections",
        _ => "series",
    }
    .to_string();
    let icon = entry
        .get("icon")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("clapperboard")
        .to_string();
    let color = entry
        .get("color")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let order = entry
        .get("order")
        .and_then(Value::as_i64)
        .unwrap_or(6 + index as i64);
    Some(Library {
        id,
        name,
        path: PathBuf::from(path),
        kind,
        icon,
        color,
        order,
    })
}

pub fn channel_from_config_entry(
    entry: &Value,
    broker: &EventBroker,
    data_dir: &Path,
) -> Option<Arc<dyn Channel>> {
    let library = library_from_entry(entry, 0)?;
    Some(Arc::new(MediaChannel::new(
        library,
        broker.clone(),
        data_dir.to_path_buf(),
    )) as Arc<dyn Channel>)
}

pub async fn build_media_channels(
    config: &RuntimeConfig,
    broker: &EventBroker,
    data_dir: &Path,
) -> Vec<Arc<dyn Channel>> {
    config
        .get("libraries")
        .await
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, entry)| library_from_entry(entry, index))
        .map(|library| {
            Arc::new(MediaChannel::new(
                library,
                broker.clone(),
                data_dir.to_path_buf(),
            )) as Arc<dyn Channel>
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workdir(tag: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("catodo-media-{tag}-{unique}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn scan_series_groups_by_season() {
        let base = workdir("series");
        let season = base.join("Show").join("Season 1");
        std::fs::create_dir_all(&season).unwrap();
        std::fs::write(season.join("Ep 1.mp4"), b"x").unwrap();
        std::fs::write(season.join("Ep 2.mkv"), b"x").unwrap();

        let episodes = scan(&base, "series");
        assert_eq!(episodes.len(), 2);
        assert!(episodes.iter().all(|episode| episode.series == "Show"));
        assert!(episodes.iter().all(|episode| episode.season == "Season 1"));
    }

    #[test]
    fn scan_movies_lists_every_file_flat() {
        let base = workdir("movies");
        std::fs::write(base.join("Movie.mp4"), b"x").unwrap();
        let nested = base.join("Saga").join("Sequel.mkv");
        std::fs::create_dir_all(nested.parent().unwrap()).unwrap();
        std::fs::write(nested, b"x").unwrap();

        let episodes = scan(&base, "movies");
        assert_eq!(episodes.len(), 2);
        assert!(episodes.iter().all(|episode| episode.series == "Películas"));
        assert!(episodes.iter().all(|episode| episode.season.is_empty()));
        assert!(episodes.iter().all(|episode| episode.collection.is_empty()));
    }

    #[test]
    fn scan_collections_groups_collection_series_and_season() {
        let base = workdir("collections");
        let season = base.join("Anime").join("Saint Seiya").join("Season 1");
        std::fs::create_dir_all(&season).unwrap();
        std::fs::write(season.join("Ep 1.mp4"), b"x").unwrap();
        let loose = base.join("Anime").join("Saint Seiya").join("Ep 2.mkv");
        std::fs::write(loose, b"x").unwrap();
        let movie = base.join("Cine").join("Pelicula.mp4");
        std::fs::create_dir_all(movie.parent().unwrap()).unwrap();
        std::fs::write(movie, b"x").unwrap();

        let episodes = scan(&base, "collections");
        assert_eq!(episodes.len(), 3);

        let saint_seiya: Vec<_> = episodes
            .iter()
            .filter(|episode| episode.series == "Saint Seiya")
            .collect();
        assert_eq!(saint_seiya.len(), 2);
        assert!(saint_seiya
            .iter()
            .all(|episode| episode.collection == "Anime"));
        assert!(saint_seiya
            .iter()
            .any(|episode| episode.season == "Season 1"));
        assert!(saint_seiya.iter().any(|episode| episode.season.is_empty()));

        let cine = episodes
            .iter()
            .find(|episode| episode.collection == "Cine")
            .expect("colección Cine");
        assert_eq!(cine.series, "Cine");
        assert!(cine.season.is_empty());
    }

    #[test]
    fn library_entry_reads_metadata_and_normalizes_kind() {
        let entry = json!({
            "id": "sci-fi",
            "name": "Sci-fi",
            "path": "/tmp/sci-fi",
            "kind": "movies",
            "icon": "clapperboard",
            "color": "#00ffcc",
            "order": 12
        });
        let library = library_from_entry(&entry, 0).expect("library");
        assert_eq!(library.kind, "movies");
        assert_eq!(library.icon, "clapperboard");
        assert_eq!(library.color.as_deref(), Some("#00ffcc"));
        assert_eq!(library.order, 12);

        let legacy = json!({"id": "old", "path": "/tmp/old", "kind": "videos"});
        assert_eq!(
            library_from_entry(&legacy, 0).expect("legacy").kind,
            "movies"
        );

        let collections = json!({"id": "coll", "path": "/tmp/coll", "kind": "collections"});
        assert_eq!(
            library_from_entry(&collections, 0)
                .expect("collections")
                .kind,
            "collections"
        );
    }
}
