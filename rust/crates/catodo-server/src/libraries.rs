//! Media library management endpoints.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::media::channel_from_config_entry;
use crate::ServerState;

fn configured_libraries(state: &ServerState) -> Vec<Value> {
    state
        .config
        .store()
        .load("config", json!({}))
        .get("libraries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn all_libraries(state: &ServerState) -> Vec<Value> {
    let anime_dir = state
        .config
        .store()
        .load("config", json!({}))
        .get("anime_dir")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("{}/Anime", std::env::var("HOME").unwrap_or_default()));
    let mut libraries = vec![json!({
        "id": "anime",
        "name": "Anime",
        "path": anime_dir,
        "kind": "series",
        "builtin": true,
        "order": 2,
    })];
    for (index, entry) in configured_libraries(state).iter().enumerate() {
        let mut entry = entry.clone();
        if let Some(object) = entry.as_object_mut() {
            object.insert("builtin".to_string(), json!(false));
            object.insert("order".to_string(), json!(6 + index));
        }
        libraries.push(entry);
    }
    libraries
}

pub async fn list(State(state): State<ServerState>) -> Json<Value> {
    Json(Value::Array(all_libraries(&state)))
}

pub async fn add(
    State(state): State<ServerState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let id = body.get("id").and_then(Value::as_str).unwrap_or("");
    let path = body.get("path").and_then(Value::as_str).unwrap_or("");
    let kind = body.get("kind").and_then(Value::as_str).unwrap_or("series");
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        || path.is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "id y path son obligatorios"})),
        ));
    }
    if !matches!(kind, "series" | "movies") {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "kind debe ser series o movies"})),
        ));
    }
    let mut libraries = configured_libraries(&state);
    if id == "anime"
        || libraries
            .iter()
            .any(|entry| entry.get("id").and_then(Value::as_str) == Some(id))
    {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"detail": format!("biblioteca ya configurada: {id}")})),
        ));
    }
    let entry = json!({
        "id": id,
        "name": body.get("name").and_then(Value::as_str).unwrap_or(id),
        "path": path,
        "kind": kind,
    });
    libraries.push(entry.clone());
    state
        .config
        .set("libraries", Value::Array(libraries))
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"detail": "could not save libraries"})),
            )
        })?;

    if let Some(channel) =
        channel_from_config_entry(&entry, &state.broker, state.config.store().data_dir())
    {
        let _ = state.manager.register(channel).await;
        state.manager.reorder().await;
    }
    state.broker.publish(json!({"event": "libraries_changed"}));
    Ok(Json(json!({"ok": true, "id": id})))
}

pub async fn remove(
    State(state): State<ServerState>,
    Path(library_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if library_id == "anime" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "la biblioteca Anime no se puede quitar"})),
        ));
    }
    let libraries = configured_libraries(&state);
    let kept: Vec<Value> = libraries
        .iter()
        .filter(|entry| entry.get("id").and_then(Value::as_str) != Some(library_id.as_str()))
        .cloned()
        .collect();
    if kept.len() == libraries.len() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown library: {library_id}")})),
        ));
    }
    state
        .config
        .set("libraries", Value::Array(kept))
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"detail": "could not save libraries"})),
            )
        })?;
    state.manager.unregister(&library_id).await;
    state.broker.publish(json!({"event": "libraries_changed"}));
    Ok(Json(json!({"ok": true, "id": library_id})))
}
