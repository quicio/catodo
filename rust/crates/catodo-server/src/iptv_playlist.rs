//! IPTV playlist management: upload a local .m3u/.m3u8 and make it active.

use std::path::PathBuf;

use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::iptv::{group_entries, parse_m3u};
use crate::pair::RequestOrigin;
use crate::ServerState;

const CHANNEL_ID: &str = "iptv";
const FILE_NAME: &str = "playlist.m3u";

fn playlist_path(state: &ServerState) -> PathBuf {
    state.config.store().data_dir().join("iptv").join(FILE_NAME)
}

async fn set_source(state: &ServerState, value: Value) -> anyhow::Result<()> {
    state.config.set("iptv_playlist", value.clone()).await?;
    state.broker.publish(json!({
        "event": "config_changed",
        "key": "iptv_playlist",
        "value": value,
    }));
    // La caché del canal dura 60 s: forzamos la relectura para que el estado
    // que consulta Ajustes refleje la lista recién cargada.
    let _ = state
        .manager
        .command(CHANNEL_ID, "refresh", serde_json::Map::new())
        .await;
    Ok(())
}

pub async fn upload(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "la playlist IPTV es local-only"})),
        ));
    }
    if body.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "archivo vacío"})),
        ));
    }

    // Guardamos como UTF-8 normalizado para que el canal pueda releerla con
    // `read_to_string` aunque el archivo original viniera en otra codificación.
    let text = String::from_utf8_lossy(&body);
    let entries = parse_m3u(&text);
    if entries.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "la lista no tiene canales M3U válidos"})),
        ));
    }
    let groups = group_entries(&entries).len();

    let target = playlist_path(&state);
    let Some(dir) = target.parent() else {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": "ruta de playlist inválida"})),
        ));
    };
    if let Err(error) = tokio::fs::create_dir_all(dir).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        ));
    }
    let tmp = target.with_extension("m3u.tmp");
    if let Err(error) = tokio::fs::write(&tmp, text.as_bytes()).await {
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

    let source = target.to_string_lossy().to_string();
    if let Err(error) = set_source(&state, json!(source)).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "source": source,
        "count": entries.len(),
        "groups": groups,
        "bytes": text.len(),
    })))
}

pub async fn clear(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "la playlist IPTV es local-only"})),
        ));
    }
    let _ = tokio::fs::remove_file(playlist_path(&state)).await;
    if let Err(error) = set_source(&state, json!("")).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        ));
    }
    Ok(Json(json!({"ok": true})))
}
