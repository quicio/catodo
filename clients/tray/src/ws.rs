//! WebSocket connection to the backend.
//!
//! Opens `ws(s)://host:port/api/ws?token=<token>`, receives the initial
//! snapshot, and applies relevant events to `MenuState`. Auto-reconnects
//! with exponential backoff (1s → 30s cap). On `config_changed` with key
//! `mode_presets` it triggers a re-fetch of the preset list via HTTP.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

use crate::AppState;

pub struct WsHandle {
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

impl WsHandle {
    pub fn shutdown(self) {
        let _ = self.shutdown_tx.send(true);
    }
}

/// Start the WS connection task. Returns a handle that can be used to shut
/// down the loop (used by the "Re-pair" menu action).
pub fn start(app: &AppHandle, host: &str, port: u16, use_tls: bool, token: &str) -> WsHandle {
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let host = host.to_string();
    let port = port;
    let use_tls = use_tls;
    let token = token.to_string();
    let app_handle = app.clone();

    let handle = WsHandle { shutdown_tx: shutdown_tx.clone() };
    tauri::async_runtime::spawn(async move {
        run_loop(app_handle, host, port, use_tls, token, shutdown_rx).await;
    });
    handle
}

async fn run_loop(
    app: AppHandle,
    host: String,
    port: u16,
    use_tls: bool,
    token: String,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let mut backoff_ms = 1000u64;
    loop {
        if *shutdown.borrow() {
            return;
        }
        match connect_once(&app, &host, port, use_tls, &token, &mut shutdown).await {
            Ok(()) => {
                // Clean disconnect (shutdown signalled).
                return;
            }
            Err(e) => {
                log::warn!("ws: connect/recv failed: {e}; retrying in {}ms", backoff_ms);
                mark_disconnected(&app).await;
                // Sleep with cancellation.
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_millis(backoff_ms)) => {}
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() { return; }
                    }
                }
                backoff_ms = (backoff_ms * 2).min(30_000);
            }
        }
    }
}

async fn connect_once(
    app: &AppHandle,
    host: &str,
    port: u16,
    use_tls: bool,
    token: &str,
    shutdown: &mut tokio::sync::watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let scheme = if use_tls { "wss" } else { "ws" };
    let url = format!("{}://{}:{}/api/ws?token={}", scheme, host, port, token);
    log::info!("ws: connecting to {}", url);
    let (ws_stream, _) = tokio_tungstenite::connect_async(&url).await?;
    let (mut write, mut read) = ws_stream.split();

    // Mark connected.
    mark_connected(app).await;

    loop {
        tokio::select! {
            biased;
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    let _ = write.send(Message::Close(None)).await;
                    return Ok(());
                }
            }
            msg = read.next() => {
                let Some(msg) = msg else { return Err(anyhow::anyhow!("ws closed by peer")); };
                match msg? {
                    Message::Text(text) => {
                        if let Ok(v) = serde_json::from_str::<Value>(&text) {
                            handle_event(app, v).await;
                        }
                    }
                    Message::Ping(p) => { let _ = write.send(Message::Pong(p)).await; }
                    Message::Close(_) => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}

async fn mark_connected(app: &AppHandle) {
    let state = app.state::<AppState>();
    {
        let mut s = state.menu_state.lock().await;
        s.connected = true;
    }
    crate::menu::rebuild(app).await.ok();
    // Initial preset fetch (the WS only emits changes — first list comes via HTTP).
    refresh_presets(app).await;
}

async fn mark_disconnected(app: &AppHandle) {
    let state = app.state::<AppState>();
    {
        let mut s = state.menu_state.lock().await;
        s.connected = false;
    }
    crate::menu::rebuild(app).await.ok();
}

async fn handle_event(app: &AppHandle, v: Value) {
    let event = v.get("event").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let state = app.state::<AppState>();

    match event.as_str() {
        "state_snapshot" => {
            // Snapshot carries channel + playback state. Refresh presets too.
            let channels = v.get("channels").cloned().unwrap_or(Value::Null);
            let current_id = v.get("current_channel_id").and_then(|x| x.as_str()).map(|s| s.to_string());
            {
                let mut s = state.menu_state.lock().await;
                s.current_channel_id = current_id.clone();
                s.current_channel_is_media = current_id
                    .as_deref()
                    .and_then(|cid| channels.get(cid))
                    .and_then(|c| c.get("type"))
                    .and_then(|t| t.as_str())
                    .map(|t| t == "media")
                    .unwrap_or(false);
                if let Some(ch) = current_id.as_deref().and_then(|cid| channels.get(cid)) {
                    s.playback_status = ch.get("status").and_then(|x| x.as_str()).unwrap_or("").to_string();
                }
                if let Some(vol) = v.get("volume").and_then(|x| x.as_u64()) {
                    s.volume = vol.min(100) as u8;
                }
            }
            crate::menu::rebuild(app).await.ok();
        }
        "channel_changed" => {
            let cid = v.get("channel_id").and_then(|x| x.as_str()).map(|s| s.to_string());
            {
                let mut s = state.menu_state.lock().await;
                s.current_channel_id = cid;
            }
            crate::menu::rebuild(app).await.ok();
        }
        "playback_status_changed" => {
            let status = v.get("status").and_then(|x| x.as_str()).unwrap_or("").to_string();
            {
                let mut s = state.menu_state.lock().await;
                s.playback_status = status;
            }
            crate::menu::rebuild(app).await.ok();
        }
        "playback_progress" => {
            // No-op for the menu; keep it cheap.
        }
        "volume_changed" => {
            let vol = v.get("volume").and_then(|x| x.as_u64()).unwrap_or(0).min(100) as u8;
            {
                let mut s = state.menu_state.lock().await;
                s.volume = vol;
            }
            crate::menu::rebuild(app).await.ok();
        }
        "track_changed" => {
            let track = crate::menu::TrackMeta {
                title: v.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                artist: v.get("artist").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            };
            {
                let mut s = state.menu_state.lock().await;
                s.track = Some(track);
            }
        }
        "config_changed" => {
            let key = v.get("key").and_then(|x| x.as_str()).unwrap_or("");
            if key == "mode_presets" {
                refresh_presets(app).await;
            }
        }
        _ => {}
    }
}

/// Fetch the preset list via HTTP and update MenuState.
async fn refresh_presets(app: &AppHandle) {
    let state = app.state::<AppState>();
    let token = state.token.lock().await.clone();
    let host = state.host.clone();
    let port = state.port;
    let use_tls = state.use_tls;

    let scheme = if use_tls { "https" } else { "http" };
    let url = format!("{}://{}:{}/api/modes", scheme, host, port);
    let mut req = reqwest::Client::new().get(&url);
    if let Some(t) = token.as_deref() {
        req = req.header("X-Catodo-Token", t);
    }
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => { log::warn!("presets: fetch failed: {e}"); return; }
    };
    let body: Value = match resp.json().await {
        Ok(b) => b,
        Err(_) => return,
    };
    let mut new_presets: Vec<crate::menu::Preset> = Vec::new();
    if let Some(arr) = body.get("presets").and_then(|x| x.as_array()) {
        for p in arr {
            let id = p.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let name = p.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            if !id.is_empty() && !name.is_empty() {
                new_presets.push(crate::menu::Preset { id, name });
            }
        }
    }
    {
        let mut s = state.menu_state.lock().await;
        s.presets = new_presets;
    }
    crate::menu::rebuild(app).await.ok();
}

// Silence unused warnings for the `Arc<Mutex<…>>` pattern we don't currently
// need at this layer.
#[allow(dead_code)]
type _UnusedArc = Arc<Mutex<()>>;