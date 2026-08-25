//! Tray menu — types + construction + event dispatch.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::AppState;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct MenuState {
    pub connected: bool,
    pub current_channel_id: Option<String>,
    pub current_channel_is_media: bool,
    pub playback_status: String,
    pub volume: u8,
    pub track: Option<TrackMeta>,
    pub presets: Vec<Preset>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TrackMeta {
    pub title: String,
    pub artist: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
}

pub fn build_menu(
    app: &AppHandle,
    state: Arc<tokio::sync::Mutex<MenuState>>,
) -> tauri::Result<Menu<Wry>> {
    let s = state.blocking_lock();
    let connected = s.connected;
    let can_play_pause = connected && s.current_channel_is_media;
    let playback_label = match s.playback_status.as_str() {
        "Playing" => "❚❚ Pausar",
        _ => "▶ Reproducir",
    };
    let presets: Vec<_> = s.presets.iter().cloned().collect();
    drop(s);

    let mut builder = MenuBuilder::new(app);

    if !connected {
        builder = builder.item(
            &MenuItem::with_id(app, "disconnected", "⚠ Desconectado", false, None::<&str>)?,
        );
    }

    builder = builder
        .item(&MenuItem::with_id(
            app,
            "play_pause",
            playback_label,
            can_play_pause,
            None::<&str>,
        )?)
        .separator()
        .item(&MenuItem::with_id(app, "vol_up", "🔊 Volumen +", connected, None::<&str>)?)
        .item(&MenuItem::with_id(app, "vol_down", "🔉 Volumen −", connected, None::<&str>)?)
        .separator();

    if presets.is_empty() {
        builder = builder.item(&MenuItem::with_id(
            app,
            "no_presets",
            "(sin modos)",
            false,
            None::<&str>,
        )?);
    } else {
        let mut sub = SubmenuBuilder::new(app, "Modos");
        for p in presets {
            let id = format!("preset:{}", p.id);
            sub = sub.item(&MenuItem::with_id(app, id, &p.name, true, None::<&str>)?);
        }
        let submenu = sub.build()?;
        builder = builder.item(&submenu);
    }

    builder = builder.separator();

    builder = builder
        .item(&MenuItem::with_id(
            app,
            "open_remote",
            "🌐 Abrir control remoto",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            app,
            "re_pair",
            "🔑 Volver a emparejar",
            true,
            None::<&str>,
        )?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Salir"))?);

    builder.build()
}

pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().0.as_str().to_string();
    tauri::async_runtime::spawn(dispatch(app.clone(), id));
}

async fn dispatch(app: AppHandle, id: String) {
    let state = app.state::<AppState>();
    let token = state.token.lock().await.clone();

    if id == "play_pause" {
        let ch = state.menu_state.lock().await.current_channel_id.clone();
        if let Some(channel_id) = ch {
            let _ = post_command(
                &state.host,
                state.port,
                state.use_tls,
                token.as_deref(),
                &channel_id,
                "toggle",
            )
            .await;
        }
        return;
    }
    if id == "vol_up" {
        let _ = post_volume(&state.host, state.port, state.use_tls, token.as_deref(), "+").await;
        return;
    }
    if id == "vol_down" {
        let _ = post_volume(&state.host, state.port, state.use_tls, token.as_deref(), "-").await;
        return;
    }
    if id == "open_remote" {
        let scheme = if state.use_tls { "https" } else { "http" };
        let _ = open::that_detached(format!(
            "{}://{}:{}/remote",
            scheme, state.host, state.port
        ));
        return;
    }
    if id == "re_pair" {
        let _ = crate::store::clear_token();
        if let Some(t) = state.ws.lock().await.take() {
            t.shutdown();
        }
        *state.token.lock().await = None;
        let _ = crate::pair::open(&app);
        return;
    }
    if let Some(rest) = id.strip_prefix("preset:") {
        let _ = apply_preset(
            &state.host,
            state.port,
            state.use_tls,
            token.as_deref(),
            rest,
        )
        .await;
        return;
    }
}

async fn post_command(
    host: &str,
    port: u16,
    use_tls: bool,
    token: Option<&str>,
    channel_id: &str,
    command: &str,
) -> anyhow::Result<()> {
    let scheme = if use_tls { "https" } else { "http" };
    let url = format!(
        "{}://{}:{}/api/channels/{}/command",
        scheme, host, port, channel_id
    );
    let mut req = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "command": command }));
    if let Some(t) = token {
        req = req.header("X-Catodo-Token", t);
    }
    req.send().await?;
    Ok(())
}

async fn post_volume(
    host: &str,
    port: u16,
    use_tls: bool,
    token: Option<&str>,
    level: &str,
) -> anyhow::Result<()> {
    let scheme = if use_tls { "https" } else { "http" };
    let url = format!("{}://{}:{}/api/volume?level={}", scheme, host, port, level);
    let mut req = reqwest::Client::new().post(&url);
    if let Some(t) = token {
        req = req.header("X-Catodo-Token", t);
    }
    req.send().await?;
    Ok(())
}

async fn apply_preset(
    host: &str,
    port: u16,
    use_tls: bool,
    token: Option<&str>,
    preset_id: &str,
) -> anyhow::Result<()> {
    let scheme = if use_tls { "https" } else { "http" };
    let url = format!(
        "{}://{}:{}/api/modes/{}/apply",
        scheme, host, port, preset_id
    );
    let mut req = reqwest::Client::new().post(&url);
    if let Some(t) = token {
        req = req.header("X-Catodo-Token", t);
    }
    req.send().await?;
    Ok(())
}

pub async fn rebuild(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let menu_state = state.menu_state.clone();
    let new_menu = build_menu(app, menu_state)?;
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(new_menu))?;
    }
    Ok(())
}