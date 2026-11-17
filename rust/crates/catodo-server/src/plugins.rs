//! Declarative plugin management (catalog/install/uninstall/enable/disable).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Map, Value};

use crate::channels::{channel_from_manifest, manifest_is_valid};
use crate::config::channel_url_key;
use crate::ServerState;

const STATE_NAME: &str = "plugins";

fn plugins_dir(state: &ServerState) -> PathBuf {
    state.config.store().data_dir().join("plugins")
}

fn repo_dir() -> PathBuf {
    catodo_platform::plugins_repo()
}

/// Un id de plugin es un slug: evita `..`, `/` y separadores de path.
pub fn valid_plugin_id(plugin_id: &str) -> bool {
    !plugin_id.is_empty()
        && plugin_id.len() <= 64
        && plugin_id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
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

fn plugin_state(state: &ServerState, plugin_id: &str) -> Map<String, Value> {
    state_map(state)
        .get(plugin_id)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn installed_manifest(state: &ServerState, plugin_id: &str) -> Option<PathBuf> {
    if !valid_plugin_id(plugin_id) {
        return None;
    }
    let path = plugins_dir(state).join(plugin_id).join("manifest.json");
    path.is_file().then_some(path)
}

fn repo_manifest(plugin_id: &str) -> Option<PathBuf> {
    if !valid_plugin_id(plugin_id) {
        return None;
    }
    let path = repo_dir().join(plugin_id).join("manifest.json");
    path.is_file().then_some(path)
}

fn manifest_value(path: &Path) -> Option<Value> {
    serde_json::from_str::<Value>(&std::fs::read_to_string(path).ok()?).ok()
}

fn repo_index() -> Option<Value> {
    serde_json::from_str::<Value>(&std::fs::read_to_string(repo_dir().join("index.json")).ok()?)
        .ok()
}

fn index_entry(index: Option<&Value>, id: &str) -> Option<Value> {
    index?
        .get("plugins")?
        .as_array()?
        .iter()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some(id))
        .cloned()
}

fn entry_bundled(index: Option<&Value>, state: &ServerState, id: &str) -> bool {
    index_entry(index, id)
        .and_then(|entry| entry.get("bundled").and_then(Value::as_bool))
        .unwrap_or(false)
        || plugin_state(state, id)
            .get("origin")
            .and_then(Value::as_str)
            == Some("bundled")
}

fn entry_json(
    id: &str,
    manifest: &Value,
    state: &Map<String, Value>,
    installed: bool,
    bundled: bool,
) -> Value {
    let mut object = Map::new();
    object.insert("id".to_string(), json!(id));
    object.insert(
        "name".to_string(),
        manifest.get("name").cloned().unwrap_or(json!(id)),
    );
    object.insert(
        "version".to_string(),
        manifest.get("version").cloned().unwrap_or(json!("?")),
    );
    object.insert(
        "type".to_string(),
        manifest.get("type").cloned().unwrap_or(json!("?")),
    );
    object.insert("bundled".to_string(), json!(bundled));
    object.insert("installed".to_string(), json!(installed));
    object.insert(
        "enabled".to_string(),
        json!(
            installed
                && state
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
        ),
    );
    object.insert(
        "origin".to_string(),
        state.get("origin").cloned().unwrap_or(json!(if bundled {
            "bundled"
        } else if installed {
            "local"
        } else {
            "repo"
        })),
    );
    object.insert(
        "valid".to_string(),
        json!(!manifest
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()),
    );
    for key in ["url", "user_agent", "partition", "config_key"] {
        if let Some(value) = manifest.get(key) {
            object.insert(key.to_string(), value.clone());
        }
    }
    object.insert(
        "order".to_string(),
        state
            .get("order")
            .cloned()
            .or_else(|| manifest.get("order").cloned())
            .unwrap_or(Value::Null),
    );
    object.insert(
        "drm".to_string(),
        manifest.get("drm").cloned().unwrap_or(json!(false)),
    );
    Value::Object(object)
}

fn plugin_entry(state: &ServerState, plugin_id: &str) -> Option<Value> {
    let path = installed_manifest(state, plugin_id)?;
    let manifest = manifest_value(&path)?;
    let bundled = entry_bundled(repo_index().as_ref(), state, plugin_id);
    Some(entry_json(
        plugin_id,
        &manifest,
        &plugin_state(state, plugin_id),
        true,
        bundled,
    ))
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

/// Ids instalados que no están explícitamente deshabilitados.
pub fn enabled_ids(state: &ServerState) -> HashSet<String> {
    let states = state_map(state);
    installed_ids(state)
        .into_iter()
        .filter(|id| {
            states
                .get(id)
                .and_then(|entry| entry.get("enabled"))
                .and_then(Value::as_bool)
                .unwrap_or(true)
        })
        .collect()
}

/// Overrides de orden persistidos (`order` entero por plugin).
pub fn order_overrides(state: &ServerState) -> HashMap<String, i64> {
    state_map(state)
        .into_iter()
        .filter_map(|(id, entry)| {
            entry
                .get("order")
                .and_then(Value::as_i64)
                .map(|order| (id, order))
        })
        .collect()
}

/// `channel_<id>_url` efectiva por cada canal web instalado.
pub async fn channel_url_values(state: &ServerState) -> Vec<(String, Value)> {
    let mut values = Vec::new();
    for id in installed_ids(state) {
        let Some(path) = installed_manifest(state, &id) else {
            continue;
        };
        let Some(manifest) = manifest_value(&path) else {
            continue;
        };
        if manifest.get("type").and_then(Value::as_str) != Some("web") {
            continue;
        }
        let key = channel_url_key(&id);
        let stored = state
            .config
            .get_string(&key)
            .await
            .filter(|value| !value.is_empty());
        if let Some(value) = stored {
            values.push((key, json!(value)));
            continue;
        }
        if let Some(legacy_key) = manifest.get("config_key").and_then(Value::as_str) {
            if let Some(value) = state
                .config
                .get_string(legacy_key)
                .await
                .filter(|value| !value.is_empty())
            {
                values.push((key, json!(value)));
                continue;
            }
        }
        let url = manifest
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        values.push((key, json!(url)));
    }
    values
}

pub fn is_installed_web(state: &ServerState, plugin_id: &str) -> bool {
    installed_manifest(state, plugin_id)
        .and_then(|path| manifest_value(&path))
        .and_then(|manifest| {
            manifest
                .get("type")
                .and_then(Value::as_str)
                .map(|kind| kind == "web")
        })
        .unwrap_or(false)
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

fn version_tuple(version: &str) -> (u64, u64, u64) {
    let mut parts = version.split('.').map(|part| {
        part.chars()
            .take_while(char::is_ascii_digit)
            .collect::<String>()
            .parse::<u64>()
            .unwrap_or(0)
    });
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

pub async fn seed_bundled(state: &ServerState) {
    let Some(index) = repo_index() else {
        return;
    };
    let Some(entries) = index.get("plugins").and_then(Value::as_array) else {
        return;
    };
    let mut states = state_map(state);
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
        if !valid_plugin_id(id) {
            tracing::warn!(plugin_id = id, "plugins: id inválido en index.json");
            continue;
        }
        let source = repo_dir().join(id);
        let target = plugins_dir(state).join(id);
        let source_version = entry
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("0.0.0");
        let installed = target.join("manifest.json").is_file();
        let installed_version = states
            .get(id)
            .and_then(|entry| entry.get("version"))
            .and_then(Value::as_str)
            .unwrap_or("0.0.0");
        if (!installed || version_tuple(source_version) > version_tuple(installed_version))
            && copy_dir(&source, &target).is_ok()
        {
            changed = true;
        }
        let created = states.entry(id.to_string()).or_insert_with(|| {
            changed = true;
            json!({"enabled": true, "origin": "bundled", "version": source_version})
        });
        if let Some(object) = created.as_object_mut() {
            if version_tuple(source_version)
                > version_tuple(
                    object
                        .get("version")
                        .and_then(Value::as_str)
                        .unwrap_or("0.0.0"),
                )
            {
                object.insert("version".to_string(), json!(source_version));
                changed = true;
            }
            object.entry("enabled".to_string()).or_insert(json!(true));
            object
                .entry("origin".to_string())
                .or_insert(json!("bundled"));
        }
    }
    if changed {
        let _ = save_state(state, states).await;
    }
}

pub async fn list(State(state): State<ServerState>) -> Json<Value> {
    let entries: Vec<Value> = installed_ids(&state)
        .iter()
        .filter_map(|id| plugin_entry(&state, id))
        .collect();
    Json(Value::Array(entries))
}

pub async fn catalog(State(state): State<ServerState>) -> Json<Value> {
    let index = repo_index();
    let installed = installed_ids(&state);
    let mut entries: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if let Some(list) = index
        .as_ref()
        .and_then(|index| index.get("plugins"))
        .and_then(Value::as_array)
    {
        for entry in list {
            let Some(id) = entry.get("id").and_then(Value::as_str) else {
                continue;
            };
            if !valid_plugin_id(id) {
                tracing::warn!(plugin_id = id, "plugins: id inválido en index.json");
                continue;
            }
            let bundled = entry
                .get("bundled")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let installed_path = installed_manifest(&state, id);
            let source = installed_path.clone().or_else(|| repo_manifest(id));
            let Some(manifest) = source.as_deref().and_then(manifest_value) else {
                continue;
            };
            let mut value = entry_json(
                id,
                &manifest,
                &plugin_state(&state, id),
                installed_path.is_some(),
                bundled,
            );
            if let (Some(available), Some(object)) = (entry.get("version"), value.as_object_mut()) {
                object.insert("available_version".to_string(), available.clone());
            }
            if installed_path.is_some() {
                if let Some(object) = value.as_object_mut() {
                    object.insert(
                        "installed_version".to_string(),
                        manifest.get("version").cloned().unwrap_or(json!("?")),
                    );
                }
            }
            seen.insert(id.to_string());
            entries.push(value);
        }
    }

    // Plugins locales instalados que no están en el índice.
    for id in installed {
        if seen.contains(&id) {
            continue;
        }
        let Some(manifest) = installed_manifest(&state, &id)
            .as_deref()
            .and_then(manifest_value)
        else {
            continue;
        };
        entries.push(entry_json(
            &id,
            &manifest,
            &plugin_state(&state, &id),
            true,
            false,
        ));
    }

    entries.sort_by(|left, right| {
        left.get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase()
            .cmp(
                &right
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase(),
            )
    });
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
    if !valid_plugin_id(plugin_id) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "invalid plugin id"})),
        ));
    }
    let source = repo_dir().join(plugin_id);
    let source_manifest = source.join("manifest.json");
    if !source_manifest.is_file() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("plugin not found in repo: {plugin_id}")})),
        ));
    }
    if !manifest_is_valid(&source_manifest) {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"detail": "invalid plugin manifest"})),
        ));
    }
    let source_value = manifest_value(&source_manifest).unwrap_or(json!({}));
    let target = plugins_dir(&state).join(plugin_id);
    let was_installed = target.join("manifest.json").is_file();
    copy_dir(&source, &target).map_err(|error| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"detail": error.to_string()})),
        )
    })?;

    let mut states = state_map(&state);
    let mut entry = states
        .remove(plugin_id)
        .unwrap_or_else(|| json!({"enabled": true, "origin": "repo"}));
    if let Some(object) = entry.as_object_mut() {
        object.insert("enabled".to_string(), json!(true));
        object.insert("origin".to_string(), json!("repo"));
        object.insert(
            "version".to_string(),
            source_value
                .get("version")
                .cloned()
                .unwrap_or(json!("0.0.0")),
        );
    }
    states.insert(plugin_id.to_string(), entry);
    if save_state(&state, states).await.is_err() {
        if !was_installed {
            let _ = std::fs::remove_dir_all(&target);
        }
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": "could not persist plugin state"})),
        ));
    }

    if state.manager.get(plugin_id).await.is_none() {
        if let Some(channel) = channel_from_manifest(&target.join("manifest.json"), &state.config) {
            if let Err(error) = state.manager.register(channel).await {
                tracing::warn!(plugin_id, %error, "plugins: no se pudo registrar el canal");
            }
        }
    }
    state
        .manager
        .set_order_overrides(order_overrides(&state))
        .await;
    state.manager.reorder().await;
    state
        .broker
        .publish(json!({"event": "plugins_changed", "id": plugin_id}));
    get(State(state), AxumPath(plugin_id.to_string())).await
}

pub async fn uninstall(
    State(state): State<ServerState>,
    AxumPath(plugin_id): AxumPath<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !valid_plugin_id(&plugin_id) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "invalid plugin id"})),
        ));
    }
    let target = plugins_dir(&state).join(&plugin_id);
    if !target.join("manifest.json").is_file() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("plugin not installed: {plugin_id}")})),
        ));
    }
    let index = repo_index();
    if entry_bundled(index.as_ref(), &state, &plugin_id) {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"detail": "bundled plugin cannot be uninstalled; disable it instead"})),
        ));
    }
    let was_current = state.manager.current().await.as_deref() == Some(plugin_id.as_str());
    std::fs::remove_dir_all(&target).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": error.to_string()})),
        )
    })?;
    let mut states = state_map(&state);
    states.remove(&plugin_id);
    let _ = save_state(&state, states).await;
    state.manager.unregister(&plugin_id).await;
    state
        .broker
        .publish(json!({"event": "plugins_changed", "id": plugin_id}));
    if was_current {
        state
            .broker
            .publish(json!({"event": "channel_changed", "channel_id": null}));
    }
    Ok(Json(json!({"ok": true, "id": plugin_id})))
}

pub async fn set_enabled(
    state: ServerState,
    plugin_id: String,
    enabled: bool,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let manifest = installed_manifest(&state, &plugin_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown plugin: {plugin_id}")})),
        )
    })?;
    let mut states = state_map(&state);
    let entry = states
        .entry(plugin_id.clone())
        .or_insert_with(|| json!({"enabled": true, "origin": "local"}));
    if let Some(object) = entry.as_object_mut() {
        object.insert("enabled".to_string(), json!(enabled));
    }
    let _ = save_state(&state, states).await;

    if enabled {
        if state.manager.get(&plugin_id).await.is_none() {
            if let Some(channel) = channel_from_manifest(&manifest, &state.config) {
                let _ = state.manager.register(channel).await;
            }
        }
        state
            .manager
            .set_order_overrides(order_overrides(&state))
            .await;
        state.manager.reorder().await;
    } else {
        let was_current = state.manager.current().await.as_deref() == Some(plugin_id.as_str());
        state.manager.unregister(&plugin_id).await;
        if was_current {
            state
                .broker
                .publish(json!({"event": "channel_changed", "channel_id": null}));
        }
    }
    state
        .broker
        .publish(json!({"event": "plugins_changed", "id": plugin_id}));
    Ok(Json(json!({"ok": true, "id": plugin_id})))
}

pub async fn set_order(
    State(state): State<ServerState>,
    AxumPath(plugin_id): AxumPath<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if installed_manifest(&state, &plugin_id).is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown plugin: {plugin_id}")})),
        ));
    }
    let order = match body.get("order") {
        None | Some(Value::Null) => None,
        Some(value) => Some(value.as_i64().ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"detail": "order must be an integer or null"})),
            )
        })?),
    };
    let mut states = state_map(&state);
    let entry = states
        .entry(plugin_id.clone())
        .or_insert_with(|| json!({"enabled": true, "origin": "local"}));
    if let Some(object) = entry.as_object_mut() {
        match order {
            Some(order) => {
                object.insert("order".to_string(), json!(order));
            }
            None => {
                object.remove("order");
            }
        }
    }
    let _ = save_state(&state, states).await;
    state.manager.set_order_override(&plugin_id, order).await;
    state.manager.reorder().await;
    state
        .broker
        .publish(json!({"event": "plugins_changed", "id": plugin_id}));
    Ok(Json(json!({"ok": true, "id": plugin_id, "order": order})))
}

#[cfg(test)]
mod tests {
    use super::{order_overrides, set_order, uninstall, valid_plugin_id};
    use crate::channels::channel_from_manifest;
    use crate::config::RuntimeConfig;
    use crate::events::EventBroker;
    use crate::manager::ChannelManager;
    use crate::ServerState;
    use axum::extract::{Path as AxumPath, State};
    use serde_json::Value;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn uninstalling_the_current_channel_publishes_events() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("catodo-plugins-{unique}"));
        let plugin_dir = dir.join("plugins").join("foo");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::write(
            plugin_dir.join("manifest.json"),
            r#"{"id":"foo","name":"Foo","version":"1.0.0","type":"web","url":"https://example.com","partition":"persist:foo"}"#,
        )
        .unwrap();

        let config = RuntimeConfig::new(dir.clone());
        let broker = EventBroker::new();
        let manager = Arc::new(ChannelManager::new(broker.clone(), dir));
        manager.init().await;
        let state = ServerState::new("test", config, broker.clone(), manager.clone());
        let channel =
            channel_from_manifest(&plugin_dir.join("manifest.json"), &state.config).unwrap();
        manager.register(channel).await.unwrap();
        manager.open("foo").await.unwrap();

        let mut events = broker.subscribe();
        let response = uninstall(State(state), AxumPath("foo".to_string()))
            .await
            .unwrap();
        assert_eq!(response.0["ok"], true);
        assert_eq!(manager.current().await, None);

        let mut seen: Vec<Value> = Vec::new();
        while seen.len() < 2 {
            let event = tokio::time::timeout(Duration::from_secs(1), events.recv())
                .await
                .expect("event")
                .expect("broker open");
            seen.push(event);
        }
        assert!(seen
            .iter()
            .any(|event| event.get("event").and_then(Value::as_str) == Some("plugins_changed")));
        assert!(seen.iter().any(|event| {
            event.get("event").and_then(Value::as_str) == Some("channel_changed")
                && event.get("channel_id") == Some(&Value::Null)
        }));
    }

    #[tokio::test]
    async fn plugin_order_persists_and_reapplies() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("catodo-order-{unique}"));
        for (id, order) in [("foo", 10), ("bar", 20)] {
            let plugin_dir = dir.join("plugins").join(id);
            std::fs::create_dir_all(&plugin_dir).unwrap();
            std::fs::write(
                plugin_dir.join("manifest.json"),
                format!(
                    r#"{{"id":"{id}","name":"{id}","version":"1.0.0","type":"web","url":"https://example.com","order":{order}}}"#
                ),
            )
            .unwrap();
        }
        let config = RuntimeConfig::new(dir.clone());
        let broker = EventBroker::new();
        let manager = Arc::new(ChannelManager::new(broker.clone(), dir.clone()));
        manager.init().await;
        let state = ServerState::new("test", config, broker, manager.clone());
        for id in ["foo", "bar"] {
            let channel = channel_from_manifest(
                &dir.join("plugins").join(id).join("manifest.json"),
                &state.config,
            )
            .unwrap();
            manager.register(channel).await.unwrap();
        }
        manager.reorder().await;
        assert_eq!(manager.list().await[0].id, "foo");

        let _ = set_order(
            State(state.clone()),
            AxumPath("bar".to_string()),
            axum::Json(serde_json::json!({"order": 1})),
        )
        .await
        .unwrap();
        assert_eq!(order_overrides(&state).get("bar"), Some(&1));
        assert_eq!(manager.list().await[0].id, "bar");

        // Simula un reinicio: otro manager aplica los overrides persistidos.
        let restarted = Arc::new(ChannelManager::new(EventBroker::new(), dir.clone()));
        restarted.init().await;
        for id in ["foo", "bar"] {
            let channel = channel_from_manifest(
                &dir.join("plugins").join(id).join("manifest.json"),
                &state.config,
            )
            .unwrap();
            restarted.register(channel).await.unwrap();
        }
        restarted.set_order_overrides(order_overrides(&state)).await;
        restarted.reorder().await;
        assert_eq!(restarted.list().await[0].id, "bar");
    }

    #[test]
    fn plugin_ids_are_slugs() {
        assert!(valid_plugin_id("youtube"));
        assert!(valid_plugin_id("hbo-max"));
        assert!(valid_plugin_id("tv2"));
        assert!(!valid_plugin_id(""));
        assert!(!valid_plugin_id("../evil"));
        assert!(!valid_plugin_id("a/b"));
        assert!(!valid_plugin_id("Upper"));
        assert!(!valid_plugin_id("with space"));
    }
}
