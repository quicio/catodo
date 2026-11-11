//! Mode presets: named bundles of runtime_config keys.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Map, Value};

use crate::ServerState;

const STORE_NAME: &str = "modes";
const ALLOWED_KEYS: &[&str] = &["theme", "home_layout_id", "ui_scale", "favorite_channels"];

fn load_presets(state: &ServerState) -> Vec<Value> {
    let data = state
        .config
        .store()
        .load(STORE_NAME, json!({"version": 1, "presets": []}));
    data.get("presets")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

async fn save_presets(state: &ServerState, presets: Vec<Value>) -> anyhow::Result<()> {
    state
        .config
        .store()
        .save(STORE_NAME, &json!({"version": 1, "presets": presets}))
        .await
}

fn validate_payload(payload: &Value) -> Result<Map<String, Value>, String> {
    let object = payload
        .as_object()
        .ok_or_else(|| "payload must be an object".to_string())?;
    for key in object.keys() {
        if !ALLOWED_KEYS.contains(&key.as_str()) {
            return Err(format!("key not allowed: {key}"));
        }
    }
    Ok(object.clone())
}

pub async fn list(State(state): State<ServerState>) -> Json<Value> {
    Json(json!({ "presets": load_presets(&state) }))
}

pub async fn create(
    State(state): State<ServerState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let name = body
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "name required"})),
        ));
    }
    let payload = body.get("payload").cloned().unwrap_or_else(|| json!({}));
    let payload = validate_payload(&payload)
        .map_err(|detail| (StatusCode::BAD_REQUEST, Json(json!({"detail": detail}))))?;
    let id = uuid::Uuid::new_v4().simple().to_string()[..8].to_string();
    let preset = json!({"id": id, "name": name, "payload": payload});
    let mut presets = load_presets(&state);
    presets.push(preset.clone());
    save_presets(&state, presets).await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": "could not save preset"})),
        )
    })?;
    Ok(Json(preset))
}

pub async fn update(
    State(state): State<ServerState>,
    Path(preset_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut presets = load_presets(&state);
    let Some(index) = presets
        .iter()
        .position(|preset| preset.get("id").and_then(Value::as_str) == Some(preset_id.as_str()))
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown preset: {preset_id}")})),
        ));
    };
    if let Some(name) = body.get("name").and_then(Value::as_str) {
        presets[index]["name"] = json!(name.trim());
    }
    if let Some(payload) = body.get("payload") {
        let payload = validate_payload(payload)
            .map_err(|detail| (StatusCode::BAD_REQUEST, Json(json!({"detail": detail}))))?;
        presets[index]["payload"] = Value::Object(payload);
    }
    save_presets(&state, presets.clone()).await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": "could not save preset"})),
        )
    })?;
    Ok(Json(presets[index].clone()))
}

pub async fn delete(
    State(state): State<ServerState>,
    Path(preset_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let presets = load_presets(&state);
    let kept: Vec<Value> = presets
        .iter()
        .filter(|preset| preset.get("id").and_then(Value::as_str) != Some(preset_id.as_str()))
        .cloned()
        .collect();
    if kept.len() == presets.len() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown preset: {preset_id}")})),
        ));
    }
    save_presets(&state, kept).await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"detail": "could not save preset"})),
        )
    })?;
    Ok(Json(json!({"deleted": preset_id})))
}

pub async fn apply(
    State(state): State<ServerState>,
    Path(preset_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let presets = load_presets(&state);
    let Some(preset) = presets
        .iter()
        .find(|preset| preset.get("id").and_then(Value::as_str) == Some(preset_id.as_str()))
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown preset: {preset_id}")})),
        ));
    };
    let payload = preset
        .get("payload")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for (key, value) in &payload {
        let _ = state.config.set(key, value.clone()).await;
        state.broker.publish(json!({
            "event": "config_changed",
            "key": key,
            "value": value,
        }));
    }
    Ok(Json(json!({
        "ok": true,
        "preset_id": preset_id,
        "config": Value::Object(state.config.all().await),
    })))
}
