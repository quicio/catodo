//! Cátodo tray — entry point.
//!
//! Boots the Tauri app, registers the system tray, opens the pairing window
//! when no token is stored, and connects to the backend WebSocket once
//! credentials are available.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod menu;
mod pair;
mod store;
mod tray;
mod ws;

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::menu::MenuState;
use crate::ws::WsHandle;

pub struct AppState {
    pub host: String,
    pub port: u16,
    pub use_tls: bool,
    pub token: Mutex<Option<String>>,
    pub menu_state: Arc<Mutex<MenuState>>,
    pub ws: Mutex<Option<WsHandle>>,
}

fn main() {
    env_logger::init();
    let setup: Box<dyn FnOnce(&mut tauri::App) -> Result<(), Box<dyn std::error::Error>> + Send> =
        Box::new(|app| {
            let handle = app.handle().clone();

            // Decide backend URL from CATODO_BACKEND_URL or fall back to defaults.
            let (host, port, use_tls) = match std::env::var("CATODO_BACKEND_URL") {
                Ok(url) => {
                    let parsed = url::Url::parse(&url)
                        .map_err(|e| format!("invalid CATODO_BACKEND_URL: {e}"))?;
                    (
                        parsed.host_str().unwrap_or("127.0.0.1").to_string(),
                        parsed.port().unwrap_or(8765),
                        parsed.scheme() == "https" || parsed.scheme() == "wss",
                    )
                }
                Err(_) => ("127.0.0.1".to_string(), 8765, false),
            };

            // Load stored token (if any). If missing, open pairing window.
            let token = store::read_token().ok().flatten();

            let menu_state = Arc::new(Mutex::new(MenuState::default()));
            let state = AppState {
                host: host.clone(),
                port,
                use_tls,
                token: Mutex::new(token.clone()),
                menu_state: menu_state.clone(),
                ws: Mutex::new(None),
            };
            let _ = app.handle(); // silence unused
            // Stash the state into the app's state container.
            tauri::Manager::manage(app, state);

            // Build the tray icon and menu.
            tray::install(&handle)?;

            // If no token, show pairing window. Otherwise start WS.
            if token.is_none() {
                pair::open(&handle)?;
            } else if let Some(tok) = token {
                ws::start(&handle, &host, port, use_tls, &tok);
            }

            Ok(())
        });
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .setup(setup)
        .on_menu_event(menu::handle_menu_event)
        .invoke_handler(tauri::generate_handler![pair::submit_code])
        .run(tauri::generate_context!())
        .expect("error while running Cátodo tray");
}