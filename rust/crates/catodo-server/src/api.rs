//! HTTP API for the Cátodo Rust backend.

use std::path::Path as FilePath;

use axum::body::Body;
use axum::extract::{Path, Query, RawQuery, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{any, delete, get, patch, post};
use axum::{Json, Router};
use catodo_domain::{Health, VersionInfo};
use serde_json::{json, Map, Value};
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use crate::config::KEYS;
use crate::ServerState;
use crate::{cast, libraries, lyrics, modes, mouse, pair, plugins, tunnel, voice, wallpapers, ws};

type ApiError = (StatusCode, Json<Value>);
type ApiResult = Result<Json<Value>, ApiError>;

fn not_found(detail: impl Into<String>) -> ApiError {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "detail": detail.into() })),
    )
}

fn bad_request(detail: impl Into<String>) -> ApiError {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "detail": detail.into() })),
    )
}

pub fn router(state: ServerState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/version", get(version))
        .route("/api/state", get(state_handler))
        .route("/api/activity", post(activity))
        .route("/api/channels", get(list_channels))
        .route("/api/channels/next", post(next_channel))
        .route("/api/channels/previous", post(previous_channel))
        .route("/api/channels/{channel_id}/open", post(open_channel))
        .route("/api/channels/{channel_id}/close", post(close_channel))
        .route("/api/channels/{channel_id}/state", get(channel_state))
        .route("/api/channels/{channel_id}/command", post(channel_command))
        .route("/api/channels/{channel_id}/episodes", get(channel_episodes))
        .route("/api/channels/{channel_id}/history", get(channel_history))
        .route("/api/channels/{channel_id}/stream", get(channel_stream))
        .route("/api/channels/{channel_id}/audio", get(channel_audio))
        .route("/api/channels/{channel_id}/boxart", get(channel_boxart))
        .route("/api/volume", post(volume))
        .route("/api/config", get(get_config).post(set_config))
        .route("/api/lyrics", get(lyrics::lyrics))
        .route("/api/pair/info", get(pair::info))
        .route("/api/pair/qr", get(pair::qr))
        .route("/api/modes", get(modes::list).post(modes::create))
        .route(
            "/api/modes/{preset_id}",
            patch(modes::update).delete(modes::delete),
        )
        .route("/api/modes/{preset_id}/apply", post(modes::apply))
        .route("/api/plugins", get(plugins::list))
        .route("/api/plugins/install", post(plugins::install))
        .route("/api/plugins/{plugin_id}", get(plugins::get))
        .route("/api/plugins/{plugin_id}/enable", post(enable_plugin))
        .route("/api/plugins/{plugin_id}/disable", post(disable_plugin))
        .route("/api/libraries", get(libraries::list).post(libraries::add))
        .route("/api/libraries/{library_id}", delete(libraries::remove))
        .route("/api/tunnel/providers", get(tunnel::providers))
        .route("/api/tunnel/status", get(tunnel::status))
        .route("/api/tunnel/health", get(tunnel::health))
        .route("/api/tunnel/start", post(tunnel::start))
        .route("/api/tunnel/stop", post(tunnel::stop))
        .route("/api/wallpapers/count", get(wallpapers::count))
        .route("/api/wallpapers/list", get(wallpapers::list))
        .route("/api/wallpapers/files/{filename}", get(wallpapers::file))
        .route("/api/wallpapers/artist", get(wallpapers::artist))
        .route("/api/wallpapers/fetch", post(wallpapers::fetch))
        .route("/api/wallpapers/cover", get(wallpapers::cover))
        .route(
            "/api/wallpapers/ratings",
            get(wallpapers::ratings).post(wallpapers::set_rating),
        )
        .route("/api/voice", post(voice::voice))
        .route("/api/mouse/move", post(mouse::move_mouse))
        .route("/api/mouse/click", post(mouse::click_mouse))
        .route("/api/mouse/scroll", post(mouse::scroll_mouse))
        .route("/api/mouse/key", post(mouse::key_press))
        .route("/api/mouse/type", post(mouse::type_text_handler))
        .route("/api/cast", get(cast::state))
        .route("/api/cast/stop", post(cast::stop))
        .route("/api/cast/ws", get(cast::ws_handler))
        .route("/api/ws", get(ws::ws_handler))
        .route("/api/{*rest}", any(api_not_found))
        .layer(TraceLayer::new_for_http())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            touch_idle,
        ))
        .with_state(state)
        .fallback_service(
            ServeDir::new(catodo_platform::static_dir()).append_index_html_on_directories(true),
        )
}

async fn health() -> Json<Health> {
    Json(Health::default())
}

async fn version(State(state): State<ServerState>) -> Json<VersionInfo> {
    Json(VersionInfo::new(state.version))
}

async fn state_handler(State(state): State<ServerState>) -> Json<Value> {
    Json(serde_json::to_value(state.manager.state().await).unwrap_or(Value::Null))
}

async fn activity() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn list_channels(State(state): State<ServerState>) -> Json<Value> {
    Json(serde_json::to_value(state.manager.list().await).unwrap_or(Value::Null))
}

async fn open_channel(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> ApiResult {
    state
        .manager
        .open(&channel_id)
        .await
        .map_err(|_| not_found(format!("unknown channel: {channel_id}")))?;
    Ok(Json(json!({ "ok": true, "current": channel_id })))
}

async fn close_channel(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> ApiResult {
    state
        .manager
        .close(&channel_id)
        .await
        .map_err(|_| not_found(format!("unknown channel: {channel_id}")))?;
    Ok(Json(json!({ "ok": true })))
}

async fn next_channel(State(state): State<ServerState>) -> ApiResult {
    let target = state
        .manager
        .next()
        .await
        .map_err(|_| bad_request("no channels registered"))?;
    Ok(Json(json!({ "ok": true, "current": target })))
}

async fn previous_channel(State(state): State<ServerState>) -> ApiResult {
    let target = state
        .manager
        .previous()
        .await
        .map_err(|_| bad_request("no channels registered"))?;
    Ok(Json(json!({ "ok": true, "current": target })))
}

async fn channel_state(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> ApiResult {
    let channel = state
        .manager
        .get(&channel_id)
        .await
        .ok_or_else(|| not_found(format!("unknown channel: {channel_id}")))?;
    let value = channel
        .state()
        .await
        .map_err(|_| bad_request("channel state failed"))?;
    Ok(Json(value))
}

async fn channel_command(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
    Json(payload): Json<Value>,
) -> ApiResult {
    let object = payload
        .as_object()
        .ok_or_else(|| bad_request("invalid JSON body"))?;
    let command = object
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| bad_request("missing 'command'"))?;
    let args: Map<String, Value> = object
        .iter()
        .filter(|(key, _)| key.as_str() != "command")
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    state
        .manager
        .command(&channel_id, command, args)
        .await
        .map_err(|_| not_found(format!("unknown channel: {channel_id}")))?;
    Ok(Json(json!({ "ok": true })))
}

async fn channel_episodes(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> ApiResult {
    let channel = state
        .manager
        .get(&channel_id)
        .await
        .ok_or_else(|| not_found(format!("unknown channel: {channel_id}")))?;
    Ok(Json(json!({
        "id": channel_id,
        "episodes": channel.episodes().await,
    })))
}

async fn channel_history(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> ApiResult {
    let channel = state
        .manager
        .get(&channel_id)
        .await
        .ok_or_else(|| not_found(format!("unknown channel: {channel_id}")))?;
    Ok(Json(channel.history_state().await))
}

async fn channel_stream(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(channel) = state.manager.get(&channel_id).await else {
        return not_found(format!("unknown channel: {channel_id}")).into_response();
    };
    let Some(path) = channel.current_stream().await else {
        // Canales con fuente en vivo (IPTV): el body lee el stdout de ffmpeg.
        if let Some(live) = channel.live_stream().await {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, live.content_type)
                .header(header::CACHE_CONTROL, "no-store")
                .body(Body::from_stream(ReaderStream::new(live.stdout)))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
        return not_found("channel has no stream").into_response();
    };
    match serve_file(&path, &headers).await {
        Ok(response) => response,
        Err(error) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": error.to_string() })),
        )
            .into_response(),
    }
}

async fn channel_audio(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> Response {
    let Some(channel) = state.manager.get(&channel_id).await else {
        return not_found(format!("unknown channel: {channel_id}")).into_response();
    };
    let Some(live) = channel.audio_stream().await else {
        return not_found("channel has no audio").into_response();
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, live.content_type)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from_stream(ReaderStream::new(live.stdout)))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn serve_file(path: &FilePath, headers: &HeaderMap) -> anyhow::Result<Response> {
    let metadata = tokio::fs::metadata(path).await?;
    let size = metadata.len();
    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    let Some(range) = range else {
        let file = tokio::fs::File::open(path).await?;
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .header(header::CONTENT_LENGTH, size)
            .header(header::ACCEPT_RANGES, "bytes")
            .body(Body::from_stream(ReaderStream::new(file)))?);
    };

    let Some((start, end)) = parse_range(range, size) else {
        return Ok(Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{size}"))
            .body(Body::empty())?);
    };
    let length = end - start + 1;
    let mut file = tokio::fs::File::open(path).await?;
    file.seek(SeekFrom::Start(start)).await?;
    let stream = ReaderStream::new(file.take(length));
    Ok(Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, length)
        .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from_stream(stream))?)
}

fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None;
    }
    let (start, end) = spec.split_once('-')?;
    if start.is_empty() {
        let length: u64 = end.parse().ok()?;
        if length == 0 || size == 0 {
            return None;
        }
        let start = size.saturating_sub(length);
        return Some((start, size - 1));
    }
    let start: u64 = start.parse().ok()?;
    let end = if end.is_empty() {
        size.checked_sub(1)?
    } else {
        end.parse().ok()?
    };
    if start >= size || end >= size || start > end {
        return None;
    }
    Some((start, end))
}

async fn channel_boxart(
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
    Query(query): Query<std::collections::HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let Some(channel) = state.manager.get(&channel_id).await else {
        return not_found(format!("unknown channel: {channel_id}")).into_response();
    };
    let rel = query.get("path").map(String::as_str).unwrap_or("");
    if rel.is_empty() {
        return not_found("missing 'path'").into_response();
    }
    let Some(path) = channel.boxart(rel).await else {
        return not_found("boxart not found").into_response();
    };
    match serve_file(&path, &headers).await {
        Ok(response) => response,
        Err(error) => not_found(error.to_string()).into_response(),
    }
}

async fn volume(State(state): State<ServerState>, RawQuery(query): RawQuery) -> ApiResult {
    let raw = query.unwrap_or_default();
    let level = raw
        .split('&')
        .find_map(|pair| pair.split_once('=').filter(|(key, _)| *key == "level"))
        .map(|(_, value)| value)
        .ok_or_else(|| bad_request("missing 'level'"))?;
    let level = match level {
        "+" => state.manager.adjust_volume(5).await,
        "-" => state.manager.adjust_volume(-5).await,
        value => {
            let parsed = value
                .parse::<i64>()
                .map_err(|_| bad_request("level must be int or +/-"))?;
            state.manager.set_volume(parsed).await
        }
    };
    Ok(Json(json!({ "ok": true, "volume": level })))
}

async fn get_config(State(state): State<ServerState>) -> Json<Value> {
    Json(Value::Object(state.config.all().await))
}

async fn set_config(State(state): State<ServerState>, Json(payload): Json<Value>) -> ApiResult {
    let object = payload
        .as_object()
        .ok_or_else(|| bad_request("invalid JSON body"))?;

    if let Some(value) = object.get("public_domain").and_then(Value::as_str) {
        if !value.is_empty() && !crate::config::RuntimeConfig::validate_public_domain(value) {
            return Err(bad_request("invalid public_domain"));
        }
    }
    if let Some(value) = object.get("tunnel_provider").and_then(Value::as_str) {
        if !crate::config::RuntimeConfig::validate_tunnel_provider(value) {
            return Err(bad_request("unknown provider"));
        }
    }

    for (key, value) in object {
        if key == "theme_crt_enabled" {
            let merged = state
                .config
                .fold_crt_alias(value.as_bool().unwrap_or(false))
                .await
                .map_err(|_| bad_request("config write failed"))?;
            state.broker.publish(json!({
                "event": "config_changed",
                "key": "theme_overrides",
                "value": merged,
            }));
            continue;
        }
        if KEYS.contains(&key.as_str()) {
            state
                .config
                .set(key, value.clone())
                .await
                .map_err(|_| bad_request("config write failed"))?;
            state.broker.publish(json!({
                "event": "config_changed",
                "key": key,
                "value": value,
            }));
        }
    }
    Ok(Json(Value::Object(state.config.all().await)))
}

async fn enable_plugin(
    State(state): State<ServerState>,
    Path(plugin_id): Path<String>,
) -> ApiResult {
    plugins::set_enabled(state, plugin_id, true).await
}

async fn disable_plugin(
    State(state): State<ServerState>,
    Path(plugin_id): Path<String>,
) -> ApiResult {
    plugins::set_enabled(state, plugin_id, false).await
}

async fn touch_idle(State(state): State<ServerState>, request: Request, next: Next) -> Response {
    if request.uri().path() != "/api/health" {
        state.idle.touch().await;
    }
    next.run(request).await
}

async fn api_not_found() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "detail": "Not Found" })),
    )
}
