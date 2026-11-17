//! Arcade launcher channel: escanea ROMs y emula con un core libretro embebido.
//!
//! Si el usuario configuró `arcade_default_emulator`/`arcade_emulators`, se
//! mantiene el lanzamiento de un binario externo (compatibilidad). Si no, el
//! juego corre dentro del backend con un core libretro y se sirve como stream.

pub mod av;
pub mod core;
pub mod cores;
pub mod frame_image;
pub mod runner;

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use catodo_domain::ChannelInfo;
use serde_json::{json, Map, Value};
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};

use crate::channels::{AudioSource, Channel, LiveFrame, LiveStream};
use crate::config::RuntimeConfig;
use crate::events::EventBroker;

use av::{AudioEncoder, Encoder};
use runner::Session;

const ROM_EXTS: &[&str] = &[
    "zip", "nes", "smc", "sfc", "gb", "gba", "md", "n64", "rom", "bin", "iso", "img", "cue", "chd",
    "pbp", "m3u",
];
const BOXART_NAMES: &[&str] = &["boxart.png", "boxart.jpg", "boxart.jpeg"];
const SCAN_TTL: Duration = Duration::from_secs(60);

pub struct ArcadeChannel {
    config: RuntimeConfig,
    broker: EventBroker,
    systems: RwLock<Vec<Value>>,
    current: Arc<RwLock<Option<Value>>>,
    playing: Arc<AtomicBool>,
    scanned_at: Mutex<Option<Instant>>,
    pid: Arc<Mutex<Option<u32>>>,
    session: Mutex<Option<Session>>,
    encoder: Mutex<Option<Encoder>>,
    audio_encoder: Mutex<Option<AudioEncoder>>,
    mode: Arc<RwLock<Option<&'static str>>>,
}

impl ArcadeChannel {
    pub fn new(config: RuntimeConfig, broker: EventBroker) -> Arc<Self> {
        Arc::new(Self {
            config,
            broker,
            systems: RwLock::new(Vec::new()),
            current: Arc::new(RwLock::new(None)),
            playing: Arc::new(AtomicBool::new(false)),
            scanned_at: Mutex::new(None),
            pid: Arc::new(Mutex::new(None)),
            session: Mutex::new(None),
            encoder: Mutex::new(None),
            audio_encoder: Mutex::new(None),
            mode: Arc::new(RwLock::new(None)),
        })
    }

    async fn refresh(&self) {
        let fresh = self
            .scanned_at
            .lock()
            .await
            .is_some_and(|at| at.elapsed() < SCAN_TTL);
        if fresh {
            return;
        }
        let base = self
            .config
            .get_string("arcade_dir")
            .await
            .unwrap_or_else(|| format!("{}/Arcade", std::env::var("HOME").unwrap_or_default()));
        let systems = scan(Path::new(&base));
        *self.systems.write().await = systems;
        *self.scanned_at.lock().await = Some(Instant::now());
    }

    async fn find_game(&self, rel: &str) -> Option<Value> {
        let systems = self.systems.read().await;
        for system in systems.iter() {
            let games = system.get("games").and_then(Value::as_array)?;
            if let Some(game) = games
                .iter()
                .find(|game| game.get("rel").and_then(Value::as_str) == Some(rel))
            {
                return Some(game.clone());
            }
        }
        None
    }

    /// Comando externo configurado por el usuario, si existe.
    async fn external_template(&self, system: &str) -> Option<String> {
        let per_system = self
            .config
            .get("arcade_emulators")
            .await
            .as_object()
            .and_then(|map| map.get(system))
            .and_then(Value::as_str)
            .map(str::to_string);
        per_system
    }

    async fn default_external_template(&self) -> Option<String> {
        self.config
            .get_string("arcade_default_emulator")
            .await
            .filter(|value| !value.is_empty())
    }

    async fn launch(&self, rel: &str) -> anyhow::Result<()> {
        self.refresh().await;
        let Some(game) = self.find_game(rel).await else {
            anyhow::bail!("unknown game: {rel}");
        };
        let system = game
            .get("system")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let rom = game
            .get("rom")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        // `arcade_mode` manda: auto (default) respeta el emulador configurado,
        // embedded fuerza el core adentro de la ventana y external exige uno.
        let mode = self
            .config
            .get_string("arcade_mode")
            .await
            .unwrap_or_else(|| "auto".to_string());
        let configured = match self.external_template(&system).await {
            Some(template) => Some(template),
            None => self.default_external_template().await,
        };
        let template = match mode.as_str() {
            "embedded" => None,
            "external" => match configured {
                Some(template) => Some(template),
                None => anyhow::bail!(
                    "modo external sin emulador configurado para «{system}»: \
                     agregá una entrada en arcade_emulators"
                ),
            },
            _ => configured,
        };

        if let Some(template) = template {
            return self.launch_external(&template, &rom, &system, game).await;
        }
        self.launch_embedded(&rom, &system, game).await
    }

    async fn launch_external(
        &self,
        template: &str,
        rom: &str,
        system: &str,
        game: Value,
    ) -> anyhow::Result<()> {
        let expanded = template.replace("{rom}", rom);
        let argv =
            shlex::split(&expanded).ok_or_else(|| anyhow::anyhow!("invalid emulator command"))?;
        let Some((program, args)) = argv.split_first() else {
            anyhow::bail!("empty emulator command");
        };
        self.stop().await;
        let child = Command::new(program).args(args).spawn()?;
        let pid = child.id();
        *self.pid.lock().await = pid;
        *self.mode.write().await = Some("external");
        *self.current.write().await = Some(game.clone());
        self.playing.store(true, Ordering::SeqCst);
        self.broker.publish(json!({
            "event": "game_launched",
            "channel_id": "arcade",
            "game": game,
            "system": system,
            "mode": "external",
        }));

        let broker = self.broker.clone();
        let playing = self.playing.clone();
        let current = self.current.clone();
        let pid_slot = self.pid.clone();
        let mode = self.mode.clone();
        tokio::spawn(async move {
            let mut child = child;
            let _ = child.wait().await;
            playing.store(false, Ordering::SeqCst);
            *current.write().await = None;
            *pid_slot.lock().await = None;
            *mode.write().await = None;
            broker.publish(json!({"event": "game_exited", "channel_id": "arcade"}));
        });
        Ok(())
    }

    async fn launch_embedded(&self, rom: &str, system: &str, game: Value) -> anyhow::Result<()> {
        self.stop().await;
        // Aviso antes de descargar: el core pesa unos MB y la primera vez por
        // sistema se nota. Sin esto el usuario sólo ve que "no pasa nada".
        if let Some(core) = cores::missing_core(&self.config, system).await {
            self.broker.publish(json!({
                "event": "arcade_core_download",
                "channel_id": "arcade",
                "system": system,
                "core": core,
                "game": game.get("name").cloned().unwrap_or(Value::Null),
            }));
        }
        let (core_path, spec) = match cores::ensure_core(&self.config, system).await {
            Ok(value) => value,
            Err(error) => {
                self.broker.publish(json!({
                    "event": "arcade_core_missing",
                    "channel_id": "arcade",
                    "system": system,
                    "error": error.to_string(),
                }));
                return Err(error);
            }
        };

        let rom_path = PathBuf::from(rom);
        let core_for_thread = core_path.clone();
        let rom_for_thread = rom_path.clone();
        let session =
            tokio::task::spawn_blocking(move || Session::start(&core_for_thread, &rom_for_thread))
                .await
                .map_err(|error| anyhow::anyhow!("thread del core: {error}"))??;

        let shared = session.shared();
        let (width, height) = shared.resolution();
        *self.session.lock().await = Some(session);
        *self.mode.write().await = Some("embedded");
        *self.current.write().await = Some(game.clone());
        self.playing.store(true, Ordering::SeqCst);
        self.broker.publish(json!({
            "event": "game_launched",
            "channel_id": "arcade",
            "game": game,
            "system": system,
            "mode": "embedded",
            "core": spec.core,
            "resolution": [width, height],
        }));
        Ok(())
    }

    async fn session_shared(&self) -> Option<Arc<runner::SessionShared>> {
        self.session
            .lock()
            .await
            .as_ref()
            .map(|session| session.shared())
    }

    async fn fetch_boxart(&self, rel: &str) -> anyhow::Result<()> {
        self.refresh().await;
        let Some(game) = self.find_game(rel).await else {
            anyhow::bail!("unknown game: {rel}");
        };
        let name = game.get("name").and_then(Value::as_str).unwrap_or("");
        let rom = game.get("rom").and_then(Value::as_str).unwrap_or("");
        let client = reqwest::Client::new();
        let encoded: String = url::form_urlencoded::byte_serialize(name.as_bytes()).collect();
        let response = client
            .get(format!(
                "https://itunes.apple.com/search?term={encoded}&media=software&limit=1"
            ))
            .timeout(Duration::from_secs(15))
            .send()
            .await?;
        let data: Value = response.json().await?;
        let art = data
            .get("results")
            .and_then(Value::as_array)
            .and_then(|results| results.first())
            .and_then(|result| result.get("artworkUrl100"))
            .and_then(Value::as_str)
            .map(|url| {
                url.replace("100x100bb", "600x600bb")
                    .replace("100x100", "600x600")
            });
        let Some(art) = art else {
            anyhow::bail!("no boxart found for {name}");
        };
        let image = client.get(art).send().await?.bytes().await?;
        let Some(parent) = Path::new(rom).parent() else {
            anyhow::bail!("invalid rom path");
        };
        let target = parent.join("boxart.jpg");
        std::fs::write(&target, image)?;
        {
            let mut systems = self.systems.write().await;
            for system in systems.iter_mut() {
                if let Some(games) = system.get_mut("games").and_then(Value::as_array_mut) {
                    for game in games {
                        if game.get("rel").and_then(Value::as_str) == Some(rel) {
                            game["boxart"] = json!(target.to_string_lossy());
                        }
                    }
                }
            }
        }
        self.broker.publish(json!({
            "event": "boxart_fetched",
            "channel_id": "arcade",
            "game": rel,
        }));
        Ok(())
    }

    async fn stop(&self) {
        let pid = self.pid.lock().await.take();
        if let Some(pid) = pid {
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status()
                .await;
        }
        if let Some(mut encoder) = self.encoder.lock().await.take() {
            encoder.stop();
        }
        if let Some(mut encoder) = self.audio_encoder.lock().await.take() {
            encoder.stop();
        }
        if let Some(mut session) = self.session.lock().await.take() {
            session.stop();
        }
        *self.mode.write().await = None;
        self.playing.store(false, Ordering::SeqCst);
    }
}

#[async_trait]
impl Channel for ArcadeChannel {
    fn info(&self) -> ChannelInfo {
        ChannelInfo::new("arcade", "Arcade", "launcher")
            .with_icon("gamepad")
            .with_order(3)
    }

    async fn open(&self) -> anyhow::Result<()> {
        self.refresh().await;
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.stop().await;
        Ok(())
    }

    async fn state(&self) -> anyhow::Result<Value> {
        self.refresh().await;
        let shared = self.session_shared().await;
        let (width, height) = shared
            .as_ref()
            .map(|shared| shared.resolution())
            .unwrap_or((0, 0));
        let mode = *self.mode.read().await;
        let (fps, aspect, core_name, error, audio_samples, runs) = match shared.as_ref() {
            Some(shared) => (
                shared.fps(),
                shared.aspect_ratio(),
                shared.core_name(),
                shared.error(),
                shared.audio_samples(),
                shared.runs(),
            ),
            None => (0.0, 0.0, None, None, 0, 0),
        };
        Ok(json!({
            "id": "arcade",
            "name": "Arcade",
            "type": "launcher",
            "systems": self.systems.read().await.clone(),
            "current": self.current.read().await.clone(),
            "playing": self.playing.load(Ordering::SeqCst),
            "mode": mode,
            "core": core_name,
            "fps": fps,
            "aspect": aspect,
            "audio_samples": audio_samples,
            "runs": runs,
            "resolution": [width, height],
            "error": error,
        }))
    }

    async fn live_frames(&self) -> Option<tokio::sync::watch::Receiver<Option<Arc<LiveFrame>>>> {
        self.session_shared()
            .await
            .map(|shared| shared.subscribe_frames())
    }

    async fn audio_source(&self) -> Option<Arc<dyn AudioSource>> {
        self.session_shared()
            .await
            .map(|shared| shared as Arc<dyn AudioSource>)
    }

    async fn live_stream(&self) -> Option<LiveStream> {
        let shared = self.session_shared().await?;
        shared.request_h264();
        let mut guard = self.encoder.lock().await;
        // Si ya hay un encoder con su stdout tomado, el cliente anterior sigue
        // leyendo: se reinicia para el nuevo consumidor.
        if guard.as_ref().is_some_and(|encoder| encoder.stdout_taken()) {
            if let Some(mut encoder) = guard.take() {
                encoder.stop();
            }
        }
        if guard.is_none() {
            match Encoder::start(shared).await {
                Ok(encoder) => *guard = Some(encoder),
                Err(error) => {
                    tracing::warn!(%error, "arcade: no se pudo iniciar el encode");
                    return None;
                }
            }
        }
        let stdout = guard.as_mut()?.take_stdout()?;
        Some(LiveStream {
            content_type: "video/mp4".to_string(),
            stdout,
        })
    }

    async fn audio_stream(&self) -> Option<LiveStream> {
        let shared = self.session_shared().await?;
        let mut guard = self.audio_encoder.lock().await;
        if guard.as_ref().is_some_and(|encoder| encoder.stdout_taken()) {
            if let Some(mut encoder) = guard.take() {
                encoder.stop();
            }
        }
        if guard.is_none() {
            match AudioEncoder::start(shared) {
                Ok(encoder) => *guard = Some(encoder),
                Err(error) => {
                    tracing::warn!(%error, "arcade: no se pudo iniciar el audio");
                    return None;
                }
            }
        }
        let stdout = guard.as_mut()?.take_stdout()?;
        Some(LiveStream {
            content_type: "audio/mp4".to_string(),
            stdout,
        })
    }

    async fn boxart(&self, rel: &str) -> Option<PathBuf> {
        self.refresh().await;
        let systems = self.systems.read().await;
        for system in systems.iter() {
            let games = system.get("games").and_then(Value::as_array)?;
            if let Some(game) = games
                .iter()
                .find(|game| game.get("rel").and_then(Value::as_str) == Some(rel))
            {
                return game
                    .get("boxart")
                    .and_then(Value::as_str)
                    .map(PathBuf::from);
            }
        }
        None
    }

    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()> {
        match command {
            "launch" => {
                let rel = args.get("game").and_then(Value::as_str).unwrap_or("");
                self.launch(rel).await?;
            }
            "stop" => self.stop().await,
            "press" | "release" => {
                let name = args.get("button").and_then(Value::as_str).unwrap_or("");
                let Some(shared) = self.session_shared().await else {
                    anyhow::bail!("no hay sesión embebida activa");
                };
                let ok = if command == "press" {
                    shared.press(name)
                } else {
                    shared.release(name)
                };
                if !ok {
                    anyhow::bail!("botón desconocido: {name}");
                }
            }
            "reset" => {
                if let Some(session) = self.session.lock().await.as_ref() {
                    session.reset()?;
                }
            }
            "save_state" | "load_state" => {
                let slot = args.get("slot").and_then(Value::as_u64).unwrap_or(1) as u32;
                if let Some(session) = self.session.lock().await.as_ref() {
                    if command == "save_state" {
                        session.save_state(slot)?;
                    } else {
                        session.load_state(slot)?;
                    }
                }
            }
            "refresh" => {
                *self.scanned_at.lock().await = None;
                self.refresh().await;
            }
            "fetch_boxart" => {
                let rel = args.get("game").and_then(Value::as_str).unwrap_or("");
                self.fetch_boxart(rel).await?;
            }
            "fetch_boxarts" => {
                self.refresh().await;
                let games: Vec<String> = self
                    .systems
                    .read()
                    .await
                    .iter()
                    .flat_map(|system| {
                        system
                            .get("games")
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default()
                    })
                    .filter(|game| game.get("boxart").is_none())
                    .filter_map(|game| game.get("rel").and_then(Value::as_str).map(str::to_string))
                    .collect();
                for rel in games {
                    let _ = self.fetch_boxart(&rel).await;
                }
            }
            _ => {}
        }
        Ok(())
    }
}

fn scan(base: &Path) -> Vec<Value> {
    let mut systems = Vec::new();
    let Ok(entries) = std::fs::read_dir(base) else {
        return systems;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let system_name = entry.file_name().to_string_lossy().to_string();
        let mut games = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        flat_games(&path, &system_name, &mut games, &mut seen);
        if let Ok(game_dirs) = std::fs::read_dir(&path) {
            let mut game_dirs: Vec<_> = game_dirs.flatten().collect();
            game_dirs.sort_by_key(|entry| entry.path());
            for game_dir in game_dirs {
                let game_path = game_dir.path();
                if !game_path.is_dir() {
                    continue;
                }
                let Some(rom) = find_rom(&game_path) else {
                    continue;
                };
                let boxart = BOXART_NAMES
                    .iter()
                    .map(|name| game_path.join(name))
                    .find(|candidate| candidate.is_file())
                    .map(|candidate| candidate.to_string_lossy().to_string());
                let name = game_dir.file_name().to_string_lossy().to_string();
                let rel = format!("{system_name}/{name}");
                if seen.insert(rel.clone()) {
                    games.push(json!({
                        "name": name,
                        "rom": rom.to_string_lossy(),
                        "boxart": boxart,
                        "rel": rel,
                        "system": system_name,
                    }));
                }
            }
        }
        if !games.is_empty() {
            systems.push(json!({"name": system_name, "games": games}));
        }
    }
    systems
}

/// Prioridad del archivo primario cuando un juego tiene varios (cue+bin,
/// multi-track, multi-disco). Menor gana.
fn extension_rank(extension: &str) -> u8 {
    match extension {
        "m3u" => 0,
        "cue" => 1,
        "chd" => 2,
        "pbp" => 3,
        "iso" => 4,
        "img" => 5,
        "bin" => 6,
        _ => 7,
    }
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Quita un marcador de pista final: `(Track 1)`, `[Track 02]`, `- Track 1`.
/// No toca marcadores de disco: cada disco sigue siendo un juego distinto.
fn strip_track_marker(stem: &str) -> String {
    let lower = stem.to_ascii_lowercase();
    let markers = [
        "(track", "[track", " - track", " -track", "_track", "(tr.", "[tr.", " tr.", " track",
    ];
    for marker in markers {
        let Some(position) = lower.rfind(marker) else {
            continue;
        };
        let after = lower[position + marker.len()..].trim_start();
        let digits: String = after
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect();
        if digits.is_empty() {
            continue;
        }
        let rest = after[digits.len()..].trim_start();
        let closes = rest.is_empty()
            || rest.starts_with(')')
            || rest.starts_with(']')
            || rest.starts_with('}');
        if !closes {
            continue;
        }
        let cut = stem[..position]
            .trim_end_matches(|character: char| {
                character.is_whitespace()
                    || character == '-'
                    || character == '_'
                    || character == '.'
            })
            .trim();
        if !cut.is_empty() {
            return cut.to_string();
        }
    }
    stem.to_string()
}

fn normalized(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// Archivos referenciados por un `.m3u` (multi-disco): no se listan aparte.
fn m3u_references(files: &[PathBuf]) -> HashSet<PathBuf> {
    let mut referenced = HashSet::new();
    for playlist in files.iter().filter(|path| file_extension(path) == "m3u") {
        let Ok(text) = std::fs::read_to_string(playlist) else {
            continue;
        };
        let parent = playlist.parent().unwrap_or(Path::new("."));
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') || line.contains("://") {
                continue;
            }
            let candidate = Path::new(line);
            let path = if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                parent.join(candidate)
            };
            referenced.insert(normalized(&path));
        }
    }
    referenced
}

fn boxart_for(directory: &Path, name: &str, rom: &Path) -> Option<String> {
    ["png", "jpg", "jpeg"]
        .iter()
        .flat_map(|extension| {
            [
                directory.join(format!("{name}.{extension}")),
                rom.with_extension(extension),
            ]
        })
        .find(|candidate| candidate.is_file())
        .map(|candidate| candidate.to_string_lossy().to_string())
}

fn flat_games(directory: &Path, system: &str, games: &mut Vec<Value>, seen: &mut HashSet<String>) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    files.sort();
    let referenced = m3u_references(&files);
    // Un disco referenciado en el m3u arrastra sus bins con el mismo nombre.
    let referenced_keys: HashSet<String> = referenced
        .iter()
        .filter(|path| matches!(file_extension(path).as_str(), "cue" | "chd" | "pbp"))
        .filter_map(|path| {
            path.file_stem()
                .map(|stem| strip_track_marker(&stem.to_string_lossy()))
        })
        .collect();

    struct Pick {
        rank: u8,
        had_marker: bool,
        path: PathBuf,
    }
    // Clave = nombre sin marcador de pista. Agrupa cue+bin y bins multi-track.
    let mut groups: BTreeMap<String, Pick> = BTreeMap::new();
    for path in &files {
        let extension = file_extension(path);
        if !ROM_EXTS.contains(&extension.as_str()) {
            continue;
        }
        let stem = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        let key = strip_track_marker(&stem);
        if referenced.contains(&normalized(path)) || referenced_keys.contains(&key) {
            continue;
        }
        if key.is_empty() {
            continue;
        }
        let rank = extension_rank(&extension);
        let had_marker = key != stem;
        let replace = match groups.get(&key) {
            None => true,
            Some(current) => {
                rank < current.rank || (rank == current.rank && !had_marker && current.had_marker)
            }
        };
        if replace {
            groups.insert(
                key,
                Pick {
                    rank,
                    had_marker,
                    path: path.clone(),
                },
            );
        }
    }

    for (name, pick) in groups {
        let rel = format!("{system}/{name}");
        if !seen.insert(rel.clone()) {
            continue;
        }
        games.push(json!({
            "name": name,
            "rom": pick.path.to_string_lossy(),
            "boxart": boxart_for(directory, &name, &pick.path),
            "rel": rel,
            "system": system,
        }));
    }
}

fn find_rom(directory: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(directory).ok()?;
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    files.sort();
    files
        .into_iter()
        .filter_map(|path| {
            let extension = file_extension(&path);
            ROM_EXTS
                .contains(&extension.as_str())
                .then(|| (extension_rank(&extension), path))
        })
        .min_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)))
        .map(|(_, path)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workdir(tag: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("catodo-arcade-{tag}-{unique}"));
        std::fs::create_dir_all(base.join("psx")).unwrap();
        base
    }

    fn write(path: &Path, contents: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    fn games(base: &Path) -> Vec<Value> {
        scan(base)
            .into_iter()
            .find(|system| system["name"] == "psx")
            .and_then(|system| system["games"].as_array().cloned())
            .unwrap_or_default()
    }

    #[test]
    fn cue_and_tracks_collapse_to_one_game() {
        let base = workdir("cue");
        let psx = base.join("psx");
        write(&psx.join("Final Fantasy VII.cue"), b"FILE \"x.bin\" BINARY");
        write(&psx.join("Final Fantasy VII (Track 1).bin"), b"1");
        write(&psx.join("Final Fantasy VII (Track 2).bin"), b"2");
        write(&psx.join("Final Fantasy VII.png"), b"png");

        let games = games(&base);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0]["name"], "Final Fantasy VII");
        assert!(games[0]["rom"].as_str().unwrap().ends_with(".cue"));
    }

    #[test]
    fn multiple_bin_tracks_collapse_to_one_game() {
        let base = workdir("bins");
        let psx = base.join("psx");
        write(&psx.join("Crash Bandicoot (Track 1).bin"), b"1");
        write(&psx.join("Crash Bandicoot (Track 2).bin"), b"2");

        let games = games(&base);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0]["name"], "Crash Bandicoot");
    }

    #[test]
    fn multi_disc_without_m3u_stays_separate() {
        let base = workdir("discs");
        let psx = base.join("psx");
        for disc in 1..=2 {
            write(
                &psx.join(format!("Metal Gear Solid (Disc {disc}).cue")),
                b"cue",
            );
            write(
                &psx.join(format!("Metal Gear Solid (Disc {disc}) (Track 1).bin")),
                b"bin",
            );
        }

        let games = games(&base);
        assert_eq!(games.len(), 2);
        assert!(games
            .iter()
            .all(|game| game["rom"].as_str().unwrap().ends_with(".cue")));
    }

    #[test]
    fn m3u_hides_referenced_discs() {
        let base = workdir("m3u");
        let psx = base.join("psx");
        write(
            &psx.join("Final Fantasy VIII.m3u"),
            b"Final Fantasy VIII (Disc 1).cue\nFinal Fantasy VIII (Disc 2).cue\n",
        );
        for disc in 1..=2 {
            write(
                &psx.join(format!("Final Fantasy VIII (Disc {disc}).cue")),
                b"cue",
            );
            write(
                &psx.join(format!("Final Fantasy VIII (Disc {disc}).bin")),
                b"bin",
            );
        }

        let games = games(&base);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0]["name"], "Final Fantasy VIII");
        assert!(games[0]["rom"].as_str().unwrap().ends_with(".m3u"));
    }

    #[test]
    fn nested_game_folder_prefers_cue() {
        let base = workdir("nested");
        let game = base.join("psx").join("Chrono Cross");
        write(&game.join("Chrono Cross.bin"), b"bin");
        write(&game.join("Chrono Cross.cue"), b"cue");

        let games = games(&base);
        assert_eq!(games.len(), 1);
        assert!(games[0]["rom"].as_str().unwrap().ends_with(".cue"));
    }
}
