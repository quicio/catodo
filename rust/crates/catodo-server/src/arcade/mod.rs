//! Arcade launcher channel: escanea ROMs y emula con un core libretro embebido.
//!
//! Si el usuario configuró `arcade_default_emulator`/`arcade_emulators`, se
//! mantiene el lanzamiento de un binario externo (compatibilidad). Si no, el
//! juego corre dentro del backend con un core libretro y se sirve como stream.

pub mod core;
pub mod cores;
pub mod runner;

use std::path::{Path, PathBuf};
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

use runner::Session;

const ROM_EXTS: &[&str] = &[
    "zip", "nes", "smc", "sfc", "gb", "gba", "md", "n64", "rom", "bin", "iso", "cue", "chd", "pbp",
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

        let template = match self.external_template(&system).await {
            Some(template) => Some(template),
            None => self.default_external_template().await,
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
        let (fps, core_name, error) = match shared.as_ref() {
            Some(shared) => (shared.fps(), shared.core_name(), shared.error()),
            None => (0.0, None, None),
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
            "resolution": [width, height],
            "error": error,
        }))
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
        flat_games(&path, &system_name, &mut games);
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
                games.push(json!({
                    "name": game_dir.file_name().to_string_lossy(),
                    "rom": rom.to_string_lossy(),
                    "boxart": boxart,
                    "rel": format!("{system_name}/{}", game_dir.file_name().to_string_lossy()),
                    "system": system_name,
                }));
            }
        }
        if !games.is_empty() {
            systems.push(json!({"name": system_name, "games": games}));
        }
    }
    systems
}

fn flat_games(directory: &Path, system: &str, games: &mut Vec<Value>) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !ROM_EXTS.contains(&extension.as_str()) {
            continue;
        }
        let name = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        let boxart = ["png", "jpg", "jpeg"]
            .iter()
            .map(|ext| path.with_extension(ext))
            .find(|candidate| candidate.is_file())
            .map(|candidate| candidate.to_string_lossy().to_string());
        games.push(json!({
            "name": name,
            "rom": path.to_string_lossy(),
            "boxart": boxart,
            "rel": format!("{system}/{name}"),
            "system": system,
        }));
    }
}

fn find_rom(directory: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(directory).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file()
            && path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| ROM_EXTS.contains(&value.to_lowercase().as_str()))
                .unwrap_or(false)
        {
            return Some(path);
        }
    }
    None
}
