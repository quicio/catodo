//! Custom CRT frame image: upload, serve and clear.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

use crate::pair::RequestOrigin;
use crate::ServerState;

const FILE_NAME: &str = "arcade-frame.img";
const DEFAULT_IMAGE: &str = "/arcade/vintage-crt.webp";

fn data_path(state: &ServerState) -> PathBuf {
    state.config.store().data_dir().join(FILE_NAME)
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

async fn set_key(state: &ServerState, key: &str, value: Value) {
    if state.config.set(key, value.clone()).await.is_ok() {
        state
            .broker
            .publish(json!({"event": "config_changed", "key": key, "value": value}));
    }
}

pub async fn upload(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "frame upload is local-only"})),
        ));
    }
    if body.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "empty image"})),
        ));
    }
    let Some(mime) = image_mime(&body) else {
        return Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Json(json!({"detail": "expected a PNG, JPEG or WebP image"})),
        ));
    };

    let dir = state.config.store().data_dir();
    let target = dir.join(FILE_NAME);
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    if let Err(error) = tokio::fs::create_dir_all(&dir).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        ));
    }
    if let Err(error) = tokio::fs::write(&tmp, &body).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        ));
    }
    if let Err(error) = tokio::fs::rename(&tmp, &target).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        ));
    }

    let version = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let url = format!("/api/arcade/frame?v={version}");
    set_key(&state, "arcade_monitor_image", json!(url)).await;
    set_key(&state, "arcade_monitor_mode", json!("image")).await;

    Ok(Json(json!({
        "ok": true,
        "url": url,
        "mode": "image",
        "mime": mime,
        "bytes": body.len(),
    })))
}

pub async fn get(State(state): State<ServerState>) -> Response {
    let bytes = match tokio::fs::read(data_path(&state)).await {
        Ok(bytes) => bytes,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let mime = image_mime(&bytes).unwrap_or("application/octet-stream");
    let mut response = bytes.into_response();
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

pub async fn delete(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "frame upload is local-only"})),
        ));
    }
    let _ = tokio::fs::remove_file(data_path(&state)).await;
    set_key(&state, "arcade_monitor_image", json!(DEFAULT_IMAGE)).await;
    set_key(&state, "arcade_monitor_mode", json!("css")).await;
    Ok(Json(json!({"ok": true})))
}
