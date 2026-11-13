//! IPTV channel: M3U/M3U8 playlist + live ffmpeg proxy.

use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use catodo_domain::ChannelInfo;
use serde_json::{json, Map, Value};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};

use crate::channels::{Channel, LiveStream};
use crate::config::RuntimeConfig;
use crate::events::EventBroker;

const PLAYLIST_TTL: Duration = Duration::from_secs(60);
const OTHER_GROUP: &str = "Otros";
const CHANNEL_ID: &str = "iptv";

/// Una entrada de la playlist M3U.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub logo: String,
    pub group: String,
    pub url: String,
}

/// Parsea una playlist M3U/M3U8.
///
/// Formato soportado: `#EXTINF:-1 [attrs] ,Nombre` seguido de la URL en la
/// línea siguiente. Los atributos `tvg-logo` y `group-title` son opcionales.
pub fn parse_m3u(text: &str) -> Vec<Entry> {
    let mut entries = Vec::new();
    let mut pending: Option<(String, String, String)> = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF") {
            let attrs = rest.split_once(',').map(|(a, _)| a).unwrap_or(rest);
            let name = rest
                .rsplit_once(',')
                .map(|(_, n)| n.trim().to_string())
                .unwrap_or_default();
            let logo = attribute(attrs, "tvg-logo").unwrap_or_default();
            let group = attribute(attrs, "group-title")
                .filter(|g| !g.is_empty())
                .unwrap_or_else(|| OTHER_GROUP.to_string());
            pending = Some((name, logo, group));
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if let Some((name, logo, group)) = pending.take() {
            let id = format!("ch-{}", entries.len());
            let name = if name.is_empty() {
                format!("Canal {}", entries.len() + 1)
            } else {
                name
            };
            entries.push(Entry {
                id,
                name,
                logo,
                group,
                url: line.to_string(),
            });
        }
    }
    entries
}

fn attribute(attrs: &str, key: &str) -> Option<String> {
    let needle = format!("{key}=\"");
    let start = attrs.find(&needle)? + needle.len();
    let rest = &attrs[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Agrupa las entradas preservando el orden de aparición de los grupos.
pub fn group_entries(entries: &[Entry]) -> Vec<(String, Vec<Entry>)> {
    let mut groups: Vec<(String, Vec<Entry>)> = Vec::new();
    for entry in entries {
        match groups.iter_mut().find(|(name, _)| name == &entry.group) {
            Some((_, list)) => list.push(entry.clone()),
            None => groups.push((entry.group.clone(), vec![entry.clone()])),
        }
    }
    groups
}

/// Siguiente/anterior dentro del mismo grupo (con wrap).
pub fn step_in_group<'a>(
    entries: &'a [Entry],
    current: Option<&Entry>,
    delta: isize,
) -> Option<&'a Entry> {
    let group = current.map(|e| e.group.as_str())?;
    let list: Vec<&Entry> = entries.iter().filter(|e| e.group == group).collect();
    if list.is_empty() {
        return None;
    }
    let idx = current
        .and_then(|c| list.iter().position(|e| e.id == c.id))
        .unwrap_or(0);
    let len = list.len() as isize;
    let next = (idx as isize + delta).rem_euclid(len) as usize;
    Some(list[next])
}

fn header_block(headers: &Map<String, Value>) -> Option<String> {
    let lines: Vec<String> = headers
        .iter()
        .filter_map(|(key, value)| value.as_str().map(|v| format!("{key}: {v}\r\n")))
        .collect();
    if lines.is_empty() {
        None
    } else {
        Some(lines.concat())
    }
}

/// Detecta si la fuente es HLS (se puede re-encapsular con `-c copy`).
async fn detect_hls(ffprobe: &str, url: &str, headers: &Option<String>) -> bool {
    if url.contains(".m3u8") {
        return true;
    }
    let mut cmd = Command::new(ffprobe);
    cmd.args([
        "-v",
        "error",
        "-show_entries",
        "format=format_name",
        "-of",
        "csv=p=0",
    ]);
    if let Some(block) = headers {
        cmd.arg("-headers").arg(block);
    }
    cmd.arg(url);
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    cmd.kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(5), cmd.output()).await;
    match output {
        Ok(Ok(out)) if out.status.success() => String::from_utf8_lossy(&out.stdout).contains("hls"),
        _ => false,
    }
}

fn ffmpeg_args(url: &str, headers: &Option<String>, hls: bool) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
    ];
    if let Some(block) = headers {
        args.push("-headers".to_string());
        args.push(block.clone());
    }
    args.push("-i".to_string());
    args.push(url.to_string());
    if hls {
        args.extend(["-c", "copy"].map(str::to_string));
    } else {
        args.extend(["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac"].map(str::to_string));
    }
    args.extend(["-f", "mpegts", "pipe:1"].map(str::to_string));
    args
}

pub struct IptvChannel {
    config: RuntimeConfig,
    broker: EventBroker,
    cache: RwLock<Option<(Instant, Vec<Entry>)>>,
    current: RwLock<Option<Entry>>,
    child: Arc<Mutex<Option<Child>>>,
    /// Identifica el stream vigente: un watcher sólo reporta error si sigue vivo.
    stream_seq: Arc<AtomicU64>,
    last_error: Arc<RwLock<Option<String>>>,
    ffmpeg: String,
    ffprobe: String,
}

impl IptvChannel {
    pub fn new(config: RuntimeConfig, broker: EventBroker) -> Self {
        Self {
            config,
            broker,
            cache: RwLock::new(None),
            current: RwLock::new(None),
            child: Arc::new(Mutex::new(None)),
            stream_seq: Arc::new(AtomicU64::new(0)),
            last_error: Arc::new(RwLock::new(None)),
            ffmpeg: "ffmpeg".to_string(),
            ffprobe: "ffprobe".to_string(),
        }
    }

    /// Permite apuntar a binarios alternativos (tests con scripts falsos).
    pub fn with_binaries(mut self, ffmpeg: impl Into<String>, ffprobe: impl Into<String>) -> Self {
        self.ffmpeg = ffmpeg.into();
        self.ffprobe = ffprobe.into();
        self
    }

    async fn playlist_source(&self) -> String {
        self.config
            .get("iptv_playlist")
            .await
            .as_str()
            .unwrap_or_default()
            .to_string()
    }

    async fn headers(&self) -> Option<String> {
        let value = self.config.get("iptv_headers").await;
        value.as_object().and_then(header_block)
    }

    async fn load_entries(&self, force: bool) -> Vec<Entry> {
        if !force {
            let cached = self.cache.read().await;
            if let Some((at, entries)) = cached.as_ref() {
                if at.elapsed() < PLAYLIST_TTL {
                    return entries.clone();
                }
            }
        }
        let source = self.playlist_source().await;
        let fetched = if source.is_empty() {
            Vec::new()
        } else if source.starts_with("http://") || source.starts_with("https://") {
            match self.fetch_remote(&source).await {
                Ok(text) => parse_m3u(&text),
                Err(error) => {
                    tracing::warn!(%error, "iptv: no se pudo descargar la playlist");
                    Vec::new()
                }
            }
        } else {
            match tokio::fs::read_to_string(&source).await {
                Ok(text) => parse_m3u(&text),
                Err(error) => {
                    tracing::warn!(%error, "iptv: no se pudo leer la playlist");
                    Vec::new()
                }
            }
        };
        *self.cache.write().await = Some((Instant::now(), fetched.clone()));
        fetched
    }

    async fn fetch_remote(&self, url: &str) -> anyhow::Result<String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;
        let mut request = client.get(url);
        if let Some(value) = self.config.get("iptv_headers").await.as_object() {
            for (key, value) in value {
                if let Some(value) = value.as_str() {
                    request = request.header(key, value);
                }
            }
        }
        let response = request.send().await?.error_for_status()?;
        Ok(response.text().await?)
    }

    async fn kill_child(&self) {
        self.stream_seq.fetch_add(1, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().await.take() {
            let _ = child.start_kill();
        }
    }

    async fn select(&self, id: &str) -> anyhow::Result<()> {
        let entries = self.load_entries(false).await;
        let Some(entry) = entries.into_iter().find(|e| e.id == id) else {
            anyhow::bail!("canal IPTV desconocido: {id}");
        };
        self.kill_child().await;
        *self.last_error.write().await = None;
        *self.current.write().await = Some(entry);
        Ok(())
    }

    async fn step(&self, delta: isize) -> anyhow::Result<()> {
        let entries = self.load_entries(false).await;
        let current = self.current.read().await.clone();
        let next = step_in_group(&entries, current.as_ref(), delta).cloned();
        if let Some(entry) = next {
            self.kill_child().await;
            *self.last_error.write().await = None;
            *self.current.write().await = Some(entry);
        }
        Ok(())
    }

    async fn stream_error(&self, detail: impl Into<String>) {
        let detail = detail.into();
        tracing::warn!(%detail, "iptv stream error");
        *self.last_error.write().await = Some(detail.clone());
        self.broker.publish(json!({
            "event": "iptv_stream_error",
            "channel_id": CHANNEL_ID,
            "error": detail,
        }));
    }

    /// Vigila el proceso del stream y reporta una salida anormal.
    fn watch_child(&self, seq: u64) {
        let child = self.child.clone();
        let stream_seq = self.stream_seq.clone();
        let last_error = self.last_error.clone();
        let broker = self.broker.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let mut guard = child.lock().await;
                let Some(process) = guard.as_mut() else {
                    return;
                };
                match process.try_wait() {
                    Ok(Some(status)) => {
                        *guard = None;
                        drop(guard);
                        if !status.success() && stream_seq.load(Ordering::SeqCst) == seq {
                            let detail = format!("ffmpeg terminó con {status}");
                            *last_error.write().await = Some(detail.clone());
                            broker.publish(json!({
                                "event": "iptv_stream_error",
                                "channel_id": CHANNEL_ID,
                                "error": detail,
                            }));
                        }
                        return;
                    }
                    Ok(None) => {}
                    Err(_) => return,
                }
            }
        });
    }
}

#[async_trait]
impl Channel for IptvChannel {
    fn info(&self) -> ChannelInfo {
        ChannelInfo::new(CHANNEL_ID, "IPTV", CHANNEL_ID)
            .with_icon("tv")
            .with_order(50)
    }

    async fn open(&self) -> anyhow::Result<()> {
        // Refresca la lista al entrar para que el estado esté al día.
        let _ = self.load_entries(false).await;
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.kill_child().await;
        *self.last_error.write().await = None;
        *self.current.write().await = None;
        Ok(())
    }

    async fn state(&self) -> anyhow::Result<Value> {
        let entries = self.load_entries(false).await;
        let groups: Vec<Value> = group_entries(&entries)
            .into_iter()
            .map(|(name, channels)| {
                json!({
                    "name": name,
                    "channels": channels.iter().map(entry_json).collect::<Vec<_>>(),
                })
            })
            .collect();
        let current = self
            .current
            .read()
            .await
            .clone()
            .map(|entry| entry_json(&entry));
        let configured = !self.playlist_source().await.is_empty();
        let error = self.last_error.read().await.clone();
        Ok(json!({
            "id": CHANNEL_ID,
            "configured": configured,
            "groups": groups,
            "current": current,
            "count": entries.len(),
            "error": error,
        }))
    }

    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()> {
        match command {
            "set_channel" => {
                let id = args
                    .get("channel")
                    .or_else(|| args.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                self.select(id).await
            }
            "next" => self.step(1).await,
            "prev" | "previous" => self.step(-1).await,
            "refresh" => {
                let _ = self.load_entries(true).await;
                Ok(())
            }
            other => {
                tracing::debug!(command = other, "iptv: comando sin efecto");
                Ok(())
            }
        }
    }

    async fn live_stream(&self) -> Option<LiveStream> {
        let entry = self.current.read().await.clone()?;
        let headers = self.headers().await;
        let hls = detect_hls(&self.ffprobe, &entry.url, &headers).await;
        let args = ffmpeg_args(&entry.url, &headers, hls);
        self.kill_child().await;
        let seq = self.stream_seq.load(Ordering::SeqCst);
        let mut command = Command::new(&self.ffmpeg);
        command
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        match command.spawn() {
            Ok(mut child) => {
                let stdout = child.stdout.take();
                *self.child.lock().await = Some(child);
                self.watch_child(seq);
                stdout.map(|stdout| LiveStream {
                    content_type: "video/mp2t".to_string(),
                    stdout,
                })
            }
            Err(error) => {
                self.stream_error(format!("no se pudo lanzar ffmpeg: {error}"))
                    .await;
                None
            }
        }
    }
}

fn entry_json(entry: &Entry) -> Value {
    json!({
        "id": entry.id,
        "name": entry.name,
        "logo": entry.logo,
        "group": entry.group,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLAYLIST: &str = r#"#EXTM3U
#EXTINF:-1 tvg-logo="https://logo/uno.png" group-title="Noticias",Canal Uno
https://stream/uno.m3u8
#EXTINF:-1 group-title="Noticias",Canal Dos
https://stream/dos.m3u8
#EXTINF:-1,Sin Grupo
https://stream/tres.ts
"#;

    #[test]
    fn parses_groups_logos_and_urls() {
        let entries = parse_m3u(PLAYLIST);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "Canal Uno");
        assert_eq!(entries[0].group, "Noticias");
        assert_eq!(entries[0].logo, "https://logo/uno.png");
        assert_eq!(entries[0].url, "https://stream/uno.m3u8");
        assert_eq!(entries[2].group, OTHER_GROUP);
        assert_eq!(entries[2].name, "Sin Grupo");
    }

    #[test]
    fn ignores_comments_and_trailing_attributes() {
        let text = "#EXTM3U\n#EXTINF:-1 tvg-id=\"x\" group-title=\"Cine\" tvg-logo=\"\",Peli\n#EXTVLCOPT:x\nhttps://stream/peli\n";
        let entries = parse_m3u(text);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Peli");
        assert_eq!(entries[0].group, "Cine");
        assert_eq!(entries[0].url, "https://stream/peli");
    }

    #[test]
    fn groups_preserve_order() {
        let entries = parse_m3u(PLAYLIST);
        let groups = group_entries(&entries);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].0, "Noticias");
        assert_eq!(groups[0].1.len(), 2);
        assert_eq!(groups[1].0, OTHER_GROUP);
    }

    #[test]
    fn step_wraps_inside_the_group() {
        let entries = parse_m3u(PLAYLIST);
        let first = &entries[0];
        let next = step_in_group(&entries, Some(first), 1).unwrap();
        assert_eq!(next.name, "Canal Dos");
        let back = step_in_group(&entries, Some(next), 1).unwrap();
        assert_eq!(back.name, "Canal Uno");
        let prev = step_in_group(&entries, Some(first), -1).unwrap();
        assert_eq!(prev.name, "Canal Dos");
        assert!(step_in_group(&entries, None, 1).is_none());
    }

    #[tokio::test]
    async fn streams_stdout_from_the_configured_binary() {
        let dir = std::env::temp_dir().join(format!("catodo-iptv-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let playlist = dir.join("lista.m3u");
        std::fs::write(
            &playlist,
            "#EXTM3U\n#EXTINF:-1 group-title=\"Test\",Canal\nhttp://example/stream.ts\n",
        )
        .unwrap();

        let ffmpeg = dir.join("ffmpeg-fake");
        std::fs::write(&ffmpeg, "#!/bin/sh\nprintf 'FAKETS'\n").unwrap();
        let ffprobe = dir.join("ffprobe-fake");
        std::fs::write(&ffprobe, "#!/bin/sh\necho mpegts\n").unwrap();
        for bin in [&ffmpeg, &ffprobe] {
            let mut perms = std::fs::metadata(bin).unwrap().permissions();
            std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o755);
            std::fs::set_permissions(bin, perms).unwrap();
        }

        let config = RuntimeConfig::new(&dir);
        config
            .set("iptv_playlist", json!(playlist.to_str().unwrap()))
            .await
            .unwrap();
        let channel = IptvChannel::new(config, EventBroker::new())
            .with_binaries(ffmpeg.to_str().unwrap(), ffprobe.to_str().unwrap());

        let mut args = Map::new();
        args.insert("channel".to_string(), json!("ch-0"));
        channel.command("set_channel", args).await.unwrap();

        let live = channel.live_stream().await.expect("live stream");
        assert_eq!(live.content_type, "video/mp2t");
        let mut stdout = live.stdout;
        let mut buf = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut stdout, &mut buf)
            .await
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&buf), "FAKETS");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn reports_early_ffmpeg_exit() {
        let dir = std::env::temp_dir().join(format!("catodo-iptv-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let playlist = dir.join("lista.m3u");
        std::fs::write(
            &playlist,
            "#EXTM3U\n#EXTINF:-1,Canal\nhttp://example/stream.ts\n",
        )
        .unwrap();

        let ffmpeg = dir.join("ffmpeg-fake");
        std::fs::write(&ffmpeg, "#!/bin/sh\nexit 3\n").unwrap();
        let ffprobe = dir.join("ffprobe-fake");
        std::fs::write(&ffprobe, "#!/bin/sh\necho mpegts\n").unwrap();
        for bin in [&ffmpeg, &ffprobe] {
            let mut perms = std::fs::metadata(bin).unwrap().permissions();
            std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o755);
            std::fs::set_permissions(bin, perms).unwrap();
        }

        let config = RuntimeConfig::new(&dir);
        config
            .set("iptv_playlist", json!(playlist.to_str().unwrap()))
            .await
            .unwrap();
        let broker = EventBroker::new();
        let mut events = broker.subscribe();
        let channel = IptvChannel::new(config, broker)
            .with_binaries(ffmpeg.to_str().unwrap(), ffprobe.to_str().unwrap());
        let mut args = Map::new();
        args.insert("channel".to_string(), json!("ch-0"));
        channel.command("set_channel", args).await.unwrap();
        let _live = channel.live_stream().await;

        let event = tokio::time::timeout(Duration::from_secs(3), events.recv())
            .await
            .expect("evento de error")
            .unwrap();
        assert_eq!(event["event"], "iptv_stream_error");

        tokio::time::sleep(Duration::from_millis(100)).await;
        let state = channel.state().await.unwrap();
        assert!(state["error"].as_str().is_some());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ffmpeg_args_copy_hls_and_transcode_rest() {
        let hls = ffmpeg_args("https://s/a.m3u8", &None, true);
        assert!(hls.contains(&"copy".to_string()));
        assert_eq!(hls.last().unwrap(), "pipe:1");
        let ts = ffmpeg_args("https://s/a.ts", &Some("Referer: x\r\n".to_string()), false);
        assert!(ts.contains(&"libx264".to_string()));
        assert!(ts.contains(&"Referer: x\r\n".to_string()));
    }
}
