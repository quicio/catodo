//! Local media library channels (Anime and configured libraries).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use catodo_domain::ChannelInfo;
use serde_json::{json, Map, Value};
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};

use crate::channels::Channel;
use crate::config::RuntimeConfig;
use crate::events::EventBroker;
use crate::iptv::resolve_binary;
use crate::store::Store;

const VIDEO_EXTS: &[&str] = &["mp4", "mkv", "avi", "webm", "mov"];
/// Contenedores que Chromium reproduce nativamente. El resto se remuxea.
const NATIVE_EXTS: &[&str] = &["mp4", "m4v", "webm"];
const CACHE_DIR: &str = "media-cache";
/// Subir cuando cambie la estrategia de remux: invalida cachés viejas.
const CACHE_VERSION: u32 = 2;
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

#[derive(Debug, Default, Clone)]
struct AudioTrack {
    codec: Option<String>,
}

#[derive(Debug, Default, Clone)]
struct MediaProbe {
    video: Option<String>,
    video_pix_fmt: Option<String>,
    audio: Vec<AudioTrack>,
}

/// ¿Chromium puede abrir este archivo tal cual? Sólo por contenedor: los
/// `.mp4`/`.webm` se sirven directo; `.mkv`, `.avi` y `.mov` se remuxean.
fn is_native_container(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .is_some_and(|ext| NATIVE_EXTS.contains(&ext.as_str()))
}

async fn probe_local(ffprobe: &str, path: &Path) -> Option<MediaProbe> {
    let output = Command::new(ffprobe)
        .args(["-v", "error", "-print_format", "json", "-show_streams"])
        .arg(path)
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let parsed: Value = serde_json::from_slice(&output.stdout).ok()?;
    let mut probe = MediaProbe::default();
    for stream in parsed["streams"].as_array()? {
        // Las carátulas embebidas son streams de video "attached_pic".
        if stream["disposition"]["attached_pic"].as_i64() == Some(1) {
            continue;
        }
        match stream["codec_type"].as_str() {
            Some("video") if probe.video.is_none() => {
                probe.video = stream["codec_name"].as_str().map(str::to_string);
                probe.video_pix_fmt = stream["pix_fmt"].as_str().map(str::to_string);
            }
            Some("audio") => probe.audio.push(AudioTrack {
                codec: stream["codec_name"].as_str().map(str::to_string),
            }),
            _ => {}
        }
    }
    Some(probe)
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
    /// Serializa el remux: una petición prepara y el resto espera.
    normalizing: Mutex<()>,
    ffmpeg: String,
    ffprobe: String,
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
            normalizing: Mutex::new(()),
            ffmpeg: resolve_binary("ffmpeg"),
            ffprobe: resolve_binary("ffprobe"),
        }
    }

    #[cfg(test)]
    fn with_binaries(mut self, ffmpeg: &str, ffprobe: &str) -> Self {
        self.ffmpeg = ffmpeg.to_string();
        self.ffprobe = ffprobe.to_string();
        self
    }

    /// Ruta de caché estable por archivo, invalidada por mtime + tamaño.
    fn remux_cache_path(&self, source: &Path) -> Option<PathBuf> {
        let metadata = std::fs::metadata(source).ok()?;
        let size = metadata.len();
        let modified = metadata
            .modified()
            .ok()?
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_secs();
        let mut hash = 0xcbf2_9ce4_8422_2325_u64;
        for byte in source.to_string_lossy().as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        let stem = source
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        let safe: String = stem
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                    character
                } else {
                    '_'
                }
            })
            .take(60)
            .collect();
        Some(self.store.data_dir().join(CACHE_DIR).join(format!(
            "v{CACHE_VERSION}-{safe}-{hash:016x}-{modified}-{size}.mp4"
        )))
    }

    /// Convierte (remux o transcode) el contenedor a un MP4 cacheado.
    async fn ensure_mp4(&self, source: &Path) -> anyhow::Result<PathBuf> {
        let cache = self
            .remux_cache_path(source)
            .ok_or_else(|| anyhow::anyhow!("no pude leer los metadatos de la fuente"))?;
        if cache.exists() {
            return Ok(cache);
        }
        let _guard = self.normalizing.lock().await;
        if cache.exists() {
            return Ok(cache);
        }
        let probe = probe_local(&self.ffprobe, source).await;
        let copy_video = probe.as_ref().map_or(true, |probe| {
            matches!(probe.video.as_deref(), Some("h264"))
                && matches!(
                    probe.video_pix_fmt.as_deref(),
                    Some("yuv420p" | "yuvj420p") | None
                )
        });
        let copy_audio = probe.as_ref().map_or(true, |probe| {
            probe.audio.is_empty()
                || probe.audio[0].codec.as_deref() == Some("aac")
                || probe
                    .audio
                    .iter()
                    .any(|track| track.codec.as_deref() == Some("aac"))
        });
        // Si el primer audio no es AAC, pero hay una pista AAC, se usa esa:
        // copiar es órdenes de magnitud más rápido que transcodificar 24 min.
        let audio_ordinal = probe
            .as_ref()
            .and_then(|probe| {
                if probe.audio.first()?.codec.as_deref() == Some("aac") {
                    Some(0)
                } else {
                    probe
                        .audio
                        .iter()
                        .position(|track| track.codec.as_deref() == Some("aac"))
                }
            })
            .unwrap_or(0);
        if let Some(parent) = cache.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let tmp = cache.with_extension("part.mp4");
        let mut command = Command::new(&self.ffmpeg);
        command
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-y")
            .arg("-i")
            .arg(source)
            .arg("-map")
            .arg("0:v:0?")
            .arg("-map")
            .arg(format!("0:a:{audio_ordinal}?"))
            .arg("-sn")
            .arg("-dn");
        if copy_video {
            command.args(["-c:v", "copy"]);
        } else {
            command.args([
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            ]);
        }
        if copy_audio {
            command.args(["-c:a", "copy"]);
        } else {
            command.args(["-c:a", "aac", "-b:a", "384k"]);
        }
        command
            .args(["-movflags", "+faststart", "-f", "mp4"])
            .arg(&tmp)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        tracing::info!(
            source = %source.display(),
            cache = %cache.display(),
            copy_video,
            copy_audio,
            "media: preparando MP4 compatible"
        );
        let output = command.output().await?;
        if !output.status.success() {
            let _ = tokio::fs::remove_file(&tmp).await;
            let detail = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!(
                "ffmpeg falló: {}",
                detail.lines().last().unwrap_or("sin detalle").trim()
            );
        }
        tokio::fs::rename(&tmp, &cache).await?;
        Ok(cache)
    }

    async fn playable_path(&self, source: &Path) -> PathBuf {
        if is_native_container(source) {
            return source.to_path_buf();
        }
        match self.ensure_mp4(source).await {
            Ok(path) => path,
            Err(error) => {
                tracing::warn!(
                    source = %source.display(),
                    %error,
                    "media: no se pudo remuxear; se sirve el archivo original"
                );
                source.to_path_buf()
            }
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
        let episode = self.current_episode().await?;
        Some(self.playable_path(Path::new(&episode.path)).await)
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

    fn test_channel(dir: &Path, data_dir: PathBuf) -> MediaChannel {
        let library = Library {
            id: "anime".to_string(),
            name: "Anime".to_string(),
            path: dir.to_path_buf(),
            kind: "series".to_string(),
            icon: String::new(),
            color: None,
            order: 1,
        };
        MediaChannel::new(library, EventBroker::new(), data_dir)
    }

    #[test]
    fn native_containers_skip_remux() {
        assert!(is_native_container(Path::new("a.mp4")));
        assert!(is_native_container(Path::new("a.WEBM")));
        assert!(!is_native_container(Path::new("a.mkv")));
        assert!(!is_native_container(Path::new("a.avi")));
        assert!(!is_native_container(Path::new("a.mov")));
    }

    #[test]
    fn remux_cache_path_changes_with_the_source() {
        let dir = workdir("cache-key");
        let source = dir.join("Ep 1.mkv");
        std::fs::write(&source, b"a").unwrap();
        let channel = test_channel(&dir, dir.join("data"));
        let first = channel.remux_cache_path(&source).unwrap();
        assert!(first.starts_with(dir.join("data").join(CACHE_DIR)));
        std::fs::write(&source, b"ab").unwrap();
        assert_ne!(first, channel.remux_cache_path(&source).unwrap());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn remuxes_mkv_to_cached_mp4_and_reuses_it() {
        let dir = workdir("remux");
        let source = dir.join("Ep 1.mkv");
        std::fs::write(&source, b"matroska").unwrap();

        let ffprobe = dir.join("ffprobe-fake");
        std::fs::write(
            &ffprobe,
            "#!/bin/sh\necho '{\"streams\":[{\"codec_type\":\"video\",\"codec_name\":\"h264\",\"pix_fmt\":\"yuv420p\"},{\"codec_type\":\"audio\",\"codec_name\":\"ac3\"},{\"codec_type\":\"audio\",\"codec_name\":\"aac\"}]}'\n",
        )
        .unwrap();
        let args_log = dir.join("ffmpeg-args.log");
        let ffmpeg = dir.join("ffmpeg-fake");
        std::fs::write(
            &ffmpeg,
            format!(
                "#!/bin/sh\nlast=\"\"\nargs=\"\"\nfor arg in \"$@\"; do last=\"$arg\"; args=\"$args|$arg\"; done\nprintf '%s' \"$args\" > \"{}\"\nprintf 'MP4' > \"$last\"\n",
                args_log.display()
            ),
        )
        .unwrap();
        for bin in [&ffmpeg, &ffprobe] {
            let mut perms = std::fs::metadata(bin).unwrap().permissions();
            std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o755);
            std::fs::set_permissions(bin, perms).unwrap();
        }

        let channel = test_channel(&dir, dir.join("data"))
            .with_binaries(ffmpeg.to_str().unwrap(), ffprobe.to_str().unwrap());
        *channel.episodes.write().await = vec![Episode {
            path: source.to_string_lossy().to_string(),
            name: "Ep 1".to_string(),
            collection: String::new(),
            series: "Show".to_string(),
            season: String::new(),
            rel: "Ep 1.mkv".to_string(),
        }];
        *channel.current.write().await = Some(0);

        let served = channel.current_stream().await.expect("stream preparado");
        assert_ne!(served, source);
        assert!(served.starts_with(dir.join("data").join(CACHE_DIR)));
        assert_eq!(std::fs::read(&served).unwrap(), b"MP4");
        let args = std::fs::read_to_string(&args_log).unwrap();
        assert!(args.contains("|0:a:1?"), "debe elegir la pista AAC: {args}");
        assert!(args.contains("|-c:a|copy"), "debe copiar el AAC: {args}");
        // La segunda petición usa la caché.
        assert_eq!(channel.current_stream().await.unwrap(), served);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn native_mp4_is_served_without_remux() {
        let dir = workdir("native");
        let source = dir.join("Ep 1.mp4");
        std::fs::write(&source, b"mp4").unwrap();
        let channel = test_channel(&dir, dir.join("data"));
        *channel.episodes.write().await = vec![Episode {
            path: source.to_string_lossy().to_string(),
            name: "Ep 1".to_string(),
            collection: String::new(),
            series: "Show".to_string(),
            season: String::new(),
            rel: "Ep 1.mp4".to_string(),
        }];
        *channel.current.write().await = Some(0);
        assert_eq!(channel.current_stream().await.unwrap(), source);
        std::fs::remove_dir_all(&dir).ok();
    }
}
