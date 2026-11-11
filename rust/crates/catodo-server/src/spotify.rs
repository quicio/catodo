//! Spotify channel. macOS uses AppleScript against Spotify.app; Linux can
//! plug an MPRIS adapter into the same `SpotifyClient` trait later.

use std::collections::VecDeque;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use catodo_domain::ChannelInfo;
use serde_json::{json, Map, Value};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::channels::Channel;
use crate::events::EventBroker;
use crate::store::Store;

const SPOTIFY_APP: &str = "/Applications/Spotify.app";
const HISTORY_KEY: &str = "spotify_history";

#[async_trait]
pub trait SpotifyClient: Send + Sync {
    fn is_available(&self) -> bool;
    async fn state(&self) -> anyhow::Result<Value>;
    async fn play_pause(&self) -> anyhow::Result<()>;
    async fn play(&self) -> anyhow::Result<()>;
    async fn pause(&self) -> anyhow::Result<()>;
    async fn next(&self) -> anyhow::Result<()>;
    async fn previous(&self) -> anyhow::Result<()>;
    async fn set_volume(&self, level: u8) -> anyhow::Result<()>;
    async fn open_uri(&self, uri: &str) -> anyhow::Result<()>;
}

pub struct MacSpotifyClient;

#[cfg(target_os = "macos")]
pub fn default_client() -> Option<Arc<dyn SpotifyClient>> {
    let client = MacSpotifyClient;
    if client.is_available() {
        Some(Arc::new(client))
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
pub struct PlayerctlSpotifyClient;

#[cfg(target_os = "linux")]
impl PlayerctlSpotifyClient {
    async fn run(&self, args: &[&str]) -> anyhow::Result<String> {
        let output = tokio::time::timeout(
            Duration::from_secs(4),
            Command::new("playerctl")
                .arg("-p")
                .arg("spotify")
                .args(args)
                .output(),
        )
        .await
        .map_err(|_| anyhow::anyhow!("playerctl timeout"))??;
        if !output.status.success() {
            anyhow::bail!("playerctl failed");
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

#[cfg(target_os = "linux")]
#[async_trait]
impl SpotifyClient for PlayerctlSpotifyClient {
    fn is_available(&self) -> bool {
        which("playerctl").is_some() && std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_some()
    }

    async fn state(&self) -> anyhow::Result<Value> {
        let status = self
            .run(&["status"])
            .await
            .unwrap_or_else(|_| "Stopped".to_string());
        let metadata = self
            .run(&[
                "metadata",
                "--format",
                "{{title}}\t{{artist}}\t{{album}}\t{{mpris:trackid}}\t{{mpris:artUrl}}",
            ])
            .await
            .unwrap_or_default();
        let fields: Vec<&str> = metadata.split('\t').collect();
        let get = |index: usize| fields.get(index).copied().unwrap_or("");
        let position = self
            .run(&["position"])
            .await
            .ok()
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0);
        Ok(json!({
            "available": status != "Stopped" || !get(0).is_empty(),
            "status": status,
            "title": get(0),
            "artist": get(1),
            "album": get(2),
            "track_id": get(3),
            "position": position,
            "art_url": get(4),
        }))
    }

    async fn play_pause(&self) -> anyhow::Result<()> {
        self.run(&["play-pause"]).await.map(|_| ())
    }

    async fn play(&self) -> anyhow::Result<()> {
        self.run(&["play"]).await.map(|_| ())
    }

    async fn pause(&self) -> anyhow::Result<()> {
        self.run(&["pause"]).await.map(|_| ())
    }

    async fn next(&self) -> anyhow::Result<()> {
        self.run(&["next"]).await.map(|_| ())
    }

    async fn previous(&self) -> anyhow::Result<()> {
        self.run(&["previous"]).await.map(|_| ())
    }

    async fn set_volume(&self, level: u8) -> anyhow::Result<()> {
        let volume = f64::from(level.min(100)) / 100.0;
        self.run(&["volume", &format!("{volume:.2}")])
            .await
            .map(|_| ())
    }

    async fn open_uri(&self, uri: &str) -> anyhow::Result<()> {
        Command::new("xdg-open").arg(uri).status().await?;
        Ok(())
    }
}

#[cfg(target_os = "linux")]
pub fn default_client() -> Option<Arc<dyn SpotifyClient>> {
    let client = PlayerctlSpotifyClient;
    client
        .is_available()
        .then(|| Arc::new(client) as Arc<dyn SpotifyClient>)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn default_client() -> Option<Arc<dyn SpotifyClient>> {
    None
}

impl MacSpotifyClient {
    async fn run(&self, script: &str) -> anyhow::Result<String> {
        let output = tokio::time::timeout(
            Duration::from_secs(6),
            Command::new("osascript").arg("-e").arg(script).output(),
        )
        .await
        .map_err(|_| anyhow::anyhow!("osascript timeout"))??;
        if !output.status.success() {
            anyhow::bail!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

const STATE_SCRIPT: &str = r#"
tell application "Spotify"
    try
        set pstate to (player state) as string
    on error
        set pstate to "stopped"
    end try
    try
        set tname to name of current track
    on error
        set tname to ""
    end try
    try
        set tartist to artist of current track
    on error
        set tartist to ""
    end try
    try
        set talbum to album of current track
    on error
        set talbum to ""
    end try
    try
        set tid to id of current track
    on error
        set tid to ""
    end try
    try
        set tpos to (position of current track) as string
    on error
        set tpos to "0"
    end try
    try
        set tarturl to artwork url of current track
    on error
        set tarturl to ""
    end try
    return pstate & tab & tname & tab & tartist & tab & talbum & tab & tid & tab & tpos & tab & tarturl
end tell
"#;

#[async_trait]
impl SpotifyClient for MacSpotifyClient {
    fn is_available(&self) -> bool {
        Path::new(SPOTIFY_APP).is_dir() && which("osascript").is_some()
    }

    async fn state(&self) -> anyhow::Result<Value> {
        let raw = self.run(STATE_SCRIPT).await?;
        let fields: Vec<&str> = raw.split('\t').collect();
        let get = |index: usize| fields.get(index).copied().unwrap_or("");
        let pstate = match get(0).to_lowercase().as_str() {
            "playing" => "Playing",
            "paused" => "Paused",
            _ => "Stopped",
        };
        let title = get(1);
        let artist = get(2);
        let album = get(3);
        let track_id = get(4);
        let position = get(5).parse::<f64>().unwrap_or(0.0);
        let art_url = get(6);
        Ok(json!({
            "available": pstate != "Stopped" || !title.is_empty(),
            "status": pstate,
            "title": title,
            "artist": artist,
            "album": album,
            "track_id": track_id,
            "position": position,
            "art_url": art_url,
        }))
    }

    async fn play_pause(&self) -> anyhow::Result<()> {
        self.run("tell application \"Spotify\" to playpause")
            .await
            .map(|_| ())
    }

    async fn play(&self) -> anyhow::Result<()> {
        self.run("tell application \"Spotify\" to play")
            .await
            .map(|_| ())
    }

    async fn pause(&self) -> anyhow::Result<()> {
        self.run("tell application \"Spotify\" to pause")
            .await
            .map(|_| ())
    }

    async fn next(&self) -> anyhow::Result<()> {
        self.run("tell application \"Spotify\" to next track")
            .await
            .map(|_| ())
    }

    async fn previous(&self) -> anyhow::Result<()> {
        self.run("tell application \"Spotify\" to previous track")
            .await
            .map(|_| ())
    }

    async fn set_volume(&self, level: u8) -> anyhow::Result<()> {
        let level = level.min(100);
        self.run(&format!(
            "tell application \"Spotify\" to set sound volume to {level}"
        ))
        .await
        .map(|_| ())
    }

    async fn open_uri(&self, uri: &str) -> anyhow::Result<()> {
        let escaped = uri.replace('"', "\\\"");
        self.run(&format!("open location \"{escaped}\""))
            .await
            .map(|_| ())
    }
}

fn which(binary: &str) -> Option<std::path::PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(binary))
            .find(|candidate| candidate.is_file())
    })
}

pub struct SpotifyChannel {
    client: Arc<dyn SpotifyClient>,
    broker: EventBroker,
    store: Store,
    history: Mutex<VecDeque<Value>>,
    last_status: Mutex<String>,
    track_id: Mutex<Option<String>>,
    position: Mutex<(f64, Instant)>,
}

impl SpotifyChannel {
    pub fn new(
        client: Arc<dyn SpotifyClient>,
        broker: EventBroker,
        data_dir: impl Into<std::path::PathBuf>,
    ) -> Self {
        let store = Store::new(data_dir);
        let stored = store.load(HISTORY_KEY, json!({"version": 1, "items": []}));
        let mut history = VecDeque::new();
        if let Some(items) = stored.get("items").and_then(Value::as_array) {
            for item in items.iter().take(20) {
                history.push_back(item.clone());
            }
        }
        Self {
            client,
            broker,
            store,
            history: Mutex::new(history),
            last_status: Mutex::new("Stopped".to_string()),
            track_id: Mutex::new(None),
            position: Mutex::new((0.0, Instant::now())),
        }
    }

    pub fn start(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                let _ = this.refresh(true).await;
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }

    async fn save_history(&self) {
        let items: Vec<Value> = self.history.lock().await.iter().cloned().collect();
        let _ = self
            .store
            .save(HISTORY_KEY, &json!({"version": 1, "items": items}))
            .await;
    }

    async fn refresh(&self, publish: bool) -> anyhow::Result<Value> {
        if !self.client.is_available() {
            return Ok(json!({"id": "spotify", "available": false}));
        }
        let mut snapshot = self.client.state().await?;
        if !snapshot
            .get("available")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Ok(json!({"id": "spotify", "available": false}));
        }

        let status = snapshot
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("Stopped")
            .to_string();
        {
            let mut last = self.last_status.lock().await;
            if *last != status {
                *last = status.clone();
                if publish {
                    self.broker.publish(json!({
                        "event": "playback_status_changed",
                        "channel_id": "spotify",
                        "status": status,
                        "position": snapshot.get("position").cloned().unwrap_or(json!(0)),
                    }));
                }
            }
        }

        let new_track = snapshot
            .get("track_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if !new_track.is_empty() {
            let mut current = self.track_id.lock().await;
            if current.as_deref() != Some(new_track.as_str()) {
                *current = Some(new_track.clone());
                drop(current);
                let entry = json!({
                    "title": snapshot.get("title").cloned().unwrap_or(json!("")),
                    "artist": snapshot.get("artist").cloned().unwrap_or(json!("")),
                    "album": snapshot.get("album").cloned().unwrap_or(json!("")),
                    "art_url": snapshot.get("art_url").cloned().unwrap_or(json!("")),
                    "track_id": new_track,
                });
                {
                    let mut history = self.history.lock().await;
                    if history.front().and_then(|item| item.get("track_id"))
                        != entry.get("track_id")
                    {
                        history.push_front(entry.clone());
                        while history.len() > 20 {
                            history.pop_back();
                        }
                    }
                }
                self.save_history().await;
                if publish {
                    self.broker.publish(json!({
                        "event": "track_changed",
                        "channel_id": "spotify",
                        "title": entry.get("title").cloned().unwrap_or(json!("")),
                        "artist": entry.get("artist").cloned().unwrap_or(json!("")),
                        "album": entry.get("album").cloned().unwrap_or(json!("")),
                        "art_url": entry.get("art_url").cloned().unwrap_or(json!("")),
                        "status": status,
                    }));
                }
            }
        }

        let real_position = snapshot
            .get("position")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let position = {
            let mut estimator = self.position.lock().await;
            if status == "Playing" {
                estimator.0 = real_position;
                estimator.1 = Instant::now();
            }
            if status == "Playing" {
                estimator.0 + estimator.1.elapsed().as_secs_f64()
            } else {
                real_position
            }
        };
        if publish && status == "Playing" {
            self.broker.publish(json!({
                "event": "playback_progress",
                "channel_id": "spotify",
                "position": position,
                "status": status,
            }));
        }
        snapshot["id"] = json!("spotify");
        snapshot["available"] = json!(true);
        snapshot["position"] = json!(position);
        Ok(snapshot)
    }
}

#[async_trait]
impl Channel for SpotifyChannel {
    fn info(&self) -> ChannelInfo {
        ChannelInfo::new("spotify", "Spotify", "media")
            .with_icon("music")
            .with_order(0)
            .with_capabilities(["history".to_string()])
    }

    async fn open(&self) -> anyhow::Result<()> {
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        Ok(())
    }

    async fn state(&self) -> anyhow::Result<Value> {
        self.refresh(false).await
    }

    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()> {
        match command {
            "play" => self.client.play().await?,
            "pause" => self.client.pause().await?,
            "toggle" | "playpause" => self.client.play_pause().await?,
            "next" => self.client.next().await?,
            "prev" | "previous" => self.client.previous().await?,
            "volume" => {
                let level = args
                    .get("level")
                    .and_then(Value::as_f64)
                    .map(|value| (value * 100.0).round().clamp(0.0, 100.0) as u8)
                    .unwrap_or(50);
                self.client.set_volume(level).await?;
            }
            "open_uri" => {
                if let Some(uri) = args.get("uri").and_then(Value::as_str) {
                    self.client.open_uri(uri).await?;
                }
            }
            _ => {}
        }
        let _ = self.refresh(true).await;
        Ok(())
    }

    async fn history_state(&self) -> Value {
        let items: Vec<Value> = self.history.lock().await.iter().cloned().collect();
        json!({"id": "spotify", "items": items})
    }
}
