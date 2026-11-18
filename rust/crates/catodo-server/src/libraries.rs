//! Media library (emission channel) management endpoints.

use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::media::channel_from_config_entry;
use crate::pair::RequestOrigin;
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

fn normalized_kind(value: Option<&str>) -> &'static str {
    match value {
        Some("videos" | "movies") => "videos",
        _ => "series",
    }
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for character in value.chars() {
        let lower = character.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
            dash = false;
        } else if !out.is_empty() && !dash {
            out.push('-');
            dash = true;
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "canal".to_string()
    } else {
        out
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn unique_id(base: &str, libraries: &[Value]) -> String {
    let mut candidate = base.to_string();
    let mut suffix = 2;
    while libraries
        .iter()
        .any(|entry| entry.get("id").and_then(Value::as_str) == Some(candidate.as_str()))
    {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    candidate
}

fn entry_json(
    id: &str,
    name: &str,
    path: &str,
    kind: &str,
    icon: &str,
    color: &Value,
    order: i64,
) -> Value {
    json!({
        "id": id,
        "name": name,
        "path": path,
        "kind": normalized_kind(Some(kind)),
        "icon": if icon.is_empty() { "clapperboard" } else { icon },
        "color": color,
        "order": order,
    })
}

fn normalize_entry(entry: &Value) -> Option<Value> {
    let id = entry.get("id").and_then(Value::as_str)?;
    let name = entry.get("name").and_then(Value::as_str).unwrap_or(id);
    let path = entry.get("path").and_then(Value::as_str)?;
    let kind = normalized_kind(entry.get("kind").and_then(Value::as_str));
    let icon = entry
        .get("icon")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("clapperboard");
    let color = entry.get("color").cloned().unwrap_or(Value::Null);
    let order = entry.get("order").and_then(Value::as_i64).unwrap_or(6);
    Some(entry_json(id, name, path, kind, icon, &color, order))
}

fn all_libraries(state: &ServerState) -> Vec<Value> {
    configured_libraries(state)
        .iter()
        .filter_map(normalize_entry)
        .collect()
}

pub async fn list(State(state): State<ServerState>) -> Json<Value> {
    Json(Value::Array(all_libraries(&state)))
}

pub async fn add(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "libraries are local-only"})),
        ));
    }
    let name = body
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let path = body.get("path").and_then(Value::as_str).unwrap_or("");
    if name.is_empty() || path.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "name y path son obligatorios"})),
        ));
    }
    let kind = normalized_kind(body.get("kind").and_then(Value::as_str));
    let mut libraries = configured_libraries(&state);
    let requested_id = body.get("id").and_then(Value::as_str).unwrap_or("");
    let base = if requested_id.is_empty() {
        slugify(name)
    } else if valid_id(requested_id) {
        requested_id.to_string()
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "invalid library id"})),
        ));
    };
    let id = unique_id(&base, &libraries);
    let icon = body
        .get("icon")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("clapperboard");
    let color = body.get("color").cloned().unwrap_or(Value::Null);
    let order = body
        .get("order")
        .and_then(Value::as_i64)
        .unwrap_or(6 + libraries.len() as i64);
    let entry = entry_json(&id, name, path, kind, icon, &color, order);
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

pub async fn update(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
    Path(library_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "libraries are local-only"})),
        ));
    }
    let mut libraries = configured_libraries(&state);
    let Some(index) = libraries
        .iter()
        .position(|entry| entry.get("id").and_then(Value::as_str) == Some(library_id.as_str()))
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown library: {library_id}")})),
        ));
    };
    let current = normalize_entry(&libraries[index]).ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": "invalid stored library"})),
        )
    })?;
    let name = body
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            current
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(&library_id)
        });
    let path = body
        .get("path")
        .and_then(Value::as_str)
        .or_else(|| current.get("path").and_then(Value::as_str))
        .unwrap_or("");
    if path.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "path no puede estar vacío"})),
        ));
    }
    let kind = normalized_kind(
        body.get("kind")
            .and_then(Value::as_str)
            .or_else(|| current.get("kind").and_then(Value::as_str)),
    );
    let icon = body
        .get("icon")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .or_else(|| current.get("icon").and_then(Value::as_str))
        .unwrap_or("clapperboard");
    let color = body
        .get("color")
        .cloned()
        .unwrap_or_else(|| current.get("color").cloned().unwrap_or(Value::Null));
    let order = body
        .get("order")
        .and_then(Value::as_i64)
        .or_else(|| current.get("order").and_then(Value::as_i64))
        .unwrap_or(6);
    let entry = entry_json(&library_id, name, path, kind, icon, &color, order);
    libraries[index] = entry.clone();
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

    let was_current = state.manager.current().await.as_deref() == Some(library_id.as_str());
    state.manager.unregister(&library_id).await;
    if let Some(channel) =
        channel_from_config_entry(&entry, &state.broker, state.config.store().data_dir())
    {
        let _ = state.manager.register(channel).await;
    }
    state.manager.reorder().await;
    if was_current {
        let _ = state.manager.open(&library_id).await;
    }
    state.broker.publish(json!({"event": "libraries_changed"}));
    Ok(Json(json!({"ok": true, "id": library_id})))
}

pub async fn remove(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
    Path(library_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "libraries are local-only"})),
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
    let was_current = state.manager.current().await.as_deref() == Some(library_id.as_str());
    state.manager.unregister(&library_id).await;
    state.broker.publish(json!({"event": "libraries_changed"}));
    if was_current {
        state
            .broker
            .publish(json!({"event": "channel_changed", "channel_id": null}));
    }
    Ok(Json(json!({"ok": true, "id": library_id})))
}

#[cfg(test)]
mod tests {
    use super::{add, RequestOrigin};
    use crate::config::RuntimeConfig;
    use crate::events::EventBroker;
    use crate::manager::ChannelManager;
    use crate::ServerState;
    use axum::extract::{Extension, State};
    use axum::Json;
    use serde_json::{json, Value};
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn add_publishes_libraries_changed() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("catodo-libraries-{unique}"));
        let config = RuntimeConfig::new(dir.clone());
        let broker = EventBroker::new();
        let manager = Arc::new(ChannelManager::new(broker.clone(), dir));
        manager.init().await;
        let state = ServerState::new("test", config, broker.clone(), manager);
        let mut events = broker.subscribe();

        let response = add(
            State(state),
            Extension(RequestOrigin { external: false }),
            Json(json!({"name":"Test","path":"/tmp/test","kind":"videos"})),
        )
        .await
        .unwrap();
        assert_eq!(response.0["ok"], true);

        let event: Value = tokio::time::timeout(Duration::from_secs(1), events.recv())
            .await
            .expect("event")
            .expect("broker open");
        assert_eq!(event["event"], "libraries_changed");
    }
}
