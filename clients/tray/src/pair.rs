//! Pairing window: small Tauri window that shows the QR + a text field.
//!
//! When the user submits a code, `submit_code` stores it and starts the WS.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "pair";

/// Open (or focus) the pairing window.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        existing.show()?;
        existing.set_focus()?;
        return Ok(());
    }
    let url = WebviewUrl::App("index.html".into());
    WebviewWindowBuilder::new(app, WINDOW_LABEL, url)
        .title("Cátodo · Emparejar")
        .inner_size(420.0, 540.0)
        .resizable(false)
        .decorations(true)
        .skip_taskbar(true)
        .always_on_top(true)
        .build()?;
    Ok(())
}

/// Frontend calls this once the user submits the pairing code.
#[tauri::command]
pub async fn submit_code(app: AppHandle, code: String) -> Result<(), String> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return Err("empty code".into());
    }

    // Probe the backend: a single GET /api/state with the supplied token.
    // 200 = token is valid; 401/403 = reject and let the user retry.
    let state = app.state::<crate::AppState>();
    let host = state.host.clone();
    let port = state.port;
    let use_tls = state.use_tls;
    let scheme = if use_tls { "https" } else { "http" };
    let probe_url = format!("{}://{}:{}/api/state", scheme, host, port);
    let resp = reqwest::Client::new()
        .get(&probe_url)
        .header("X-Catodo-Token", trimmed)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("backend rejected token (HTTP {})", resp.status().as_u16()));
    }

    crate::store::write_token(trimmed).map_err(|e| format!("store: {e}"))?;
    *state.token.lock().await = Some(trimmed.to_string());

    // Close the pairing window.
    if let Some(w) = app.get_webview_window(WINDOW_LABEL) {
        let _ = w.close();
    }

    // Start the WS.
    crate::ws::start(&app, &host, port, use_tls, trimmed);

    Ok(())
}