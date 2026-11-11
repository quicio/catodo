//! Declarative plugin management (install/list/enable/disable).

use std::path::{Path, PathBuf};

use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Map, Value};

use crate::channels::channel_from_manifest;
use crate::ServerState;

const STATE_NAME: &str = "plugins";

fn plugins_dir(state: &ServerState) -> PathBuf {
    state.config.store().data_dir().join("plugins")
}

fn state_map(state: &ServerState) -> Map<String, Value> {
    state
        .config
        .store()
        .load(STATE_NAME, json!({}))
        .as_object()
        .cloned()
        .unwrap_or_default()
}

async fn save_state(state: &ServerState, value: Map<String, Value>) -> anyhow::Result<()> {
    state
        .config
        .store()
        .save(STATE_NAME, &Value::Object(value))
        .await
}

fn manifest_for(state: &ServerState, plugin_id: &str) -> Option<PathBuf> {
    let installed = plugins_dir(state).join(plugin_id).join("manifest.json");
    if installed.is_file() {
        return Some(installed);
    }
    let bundled = catodo_platform::plugins_repo()
        .join(plugin_id)
        .join("manifest.json");
    bundled.is_file().then_some(bundled)
}

fn plugin_entry(state: &ServerState, plugin_id: &str) -> Option<Value> {
    let path = manifest_for(state, plugin_id)?;
    let manifest: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let plugin_state = state_map(state)
        .get(plugin_id)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    Some(json!({
        "id": plugin_id,
        "name": manifest.get("name").cloned().unwrap_or(json!(plugin_id)),
        "version": manifest.get("version").cloned().unwrap_or(json!("?")),
        "type": manifest.get("type").cloned().unwrap_or(json!("?")),
        "enabled": plugin_state.get("enabled").and_then(Value::as_bool).unwrap_or(true),
        "origin": plugin_state.get("origin").cloned().unwrap_or(json!("local")),
        "valid": true,
    }))
}

fn installed_ids(state: &ServerState) -> Vec<String> {
    let mut ids: Vec<String> = std::fs::read_dir(plugins_dir(state))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            (path.is_dir() && path.join("manifest.json").is_file())
                .then(|| entry.file_name().to_string_lossy().to_string())
        })
        .collect();
    ids.sort();
    ids
}

fn copy_dir(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let destination = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &destination)?;
        } else {
            std::fs::copy(entry.path(), destination)?;
        }
    }
    Ok(())
}

pub async fn seed_bundled(state: &ServerState) {
    let repo = catodo_platform::plugins_repo();
    let index = std::fs::read_to_string(repo.join("index.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let Some(index) = index else {
        return;
    };
    let Some(entries) = index.get("plugins").and_then(Value::as_array) else {
        return;
    };
    let mut state_map = state_map(state);
    let mut changed = false;
    for entry in entries {
        if !entry
            .get("bundled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let Some(id) = entry.get("id").and_then(Value::as_str) else {
            continue;
        };
        let source = repo.join(id);
        let target = plugins_dir(state).join(id);
        if !target.join("manifest.json").is_file() && copy_dir(&source, &target).is_ok() {
            changed = true;
        }
        state_map.entry(id.to_string()).or_insert_with(|| {
            changed = true;
            json!({
                "enabled": true,
                "origin": "bundled",
                "version": entry.get("version").cloned().unwrap_or(json!("0.0.0")),
            })
        });
    }
    if changed {
        let _ = save_state(state, state_map).await;
    }
}

pub async fn list(State(state): State<ServerState>) -> Json<Value> {
    let entries: Vec<Value> = installed_ids(&state)
        .iter()
        .filter_map(|id| plugin_entry(&state, id))
        .collect();
    Json(Value::Array(entries))
}

pub async fn get(
    State(state): State<ServerState>,
    AxumPath(plugin_id): AxumPath<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    plugin_entry(&state, &plugin_id).map(Json).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown plugin: {plugin_id}")})),
        )
    })
}

pub async fn install(
    State(state): State<ServerState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let Some(plugin_id) = body.get("id").and_then(Value::as_str) else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "missing 'id'"})),
        ));
    };
    let source = catodo_platform::plugins_repo().join(plugin_id);
    if !source.join("manifest.json").is_file() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("plugin not found in repo: {plugin_id}")})),
        ));
    }
    let target = plugins_dir(&state).join(plugin_id);
    copy_dir(&source, &target).map_err(|error| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"detail": error.to_string()})),
        )
    })?;
    let mut state_map = state_map(&state);
    state_map.insert(
        plugin_id.to_string(),
        json!({"enabled": true, "origin": "repo", "version": "unknown"}),
    );
    let _ = save_state(&state, state_map).await;
    state.broker.publish(json!({"event": "plugins_changed"}));
    get(State(state), AxumPath(plugin_id.to_string())).await
}

pub async fn set_enabled(
    state: ServerState,
    plugin_id: String,
    enabled: bool,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if manifest_for(&state, &plugin_id).is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown plugin: {plugin_id}")})),
        ));
    }
    let mut state_map = state_map(&state);
    let entry = state_map
        .entry(plugin_id.clone())
        .or_insert_with(|| json!({"enabled": true, "origin": "local"}));
    if let Some(object) = entry.as_object_mut() {
        object.insert("enabled".to_string(), json!(enabled));
    }
    let _ = save_state(&state, state_map).await;

    if enabled {
        if let Some(manifest) = manifest_for(&state, &plugin_id) {
            if let Some(channel) = channel_from_manifest(&manifest, &state.config) {
                let _ = state.manager.register(channel).await;
                state.manager.reorder().await;
            }
        }
    } else {
        state.manager.unregister(&plugin_id).await;
    }
    state.broker.publish(json!({"event": "plugins_changed"}));
    Ok(Json(json!({"ok": true, "id": plugin_id})))
}
