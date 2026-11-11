//! Wallpaper listing, file serving and ratings.

use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::extract::{Path as AxumPath, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio_util::io::ReaderStream;

use crate::ServerState;

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp"];

fn wallpaper_dir(state: &ServerState) -> PathBuf {
    state.config.store().data_dir().join("wallpapers")
}

fn image_files(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let extension = entry
                .path()
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_lowercase();
            (IMAGE_EXTS.contains(&extension.as_str()) && !name.starts_with('_')).then_some(name)
        })
        .collect();
    files.sort();
    files
}

pub async fn count(State(state): State<ServerState>) -> Json<Value> {
    Json(json!({ "total": image_files(&wallpaper_dir(&state)).len() }))
}

pub async fn list(State(state): State<ServerState>) -> Json<Value> {
    let files = image_files(&wallpaper_dir(&state));
    Json(json!({
        "wallpapers": files
            .iter()
            .map(|name| format!("/api/wallpapers/files/{name}"))
            .collect::<Vec<_>>()
    }))
}

pub async fn file(
    State(state): State<ServerState>,
    AxumPath(filename): AxumPath<String>,
) -> Response {
    let safe = Path::new(&filename)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let path = wallpaper_dir(&state).join(safe);
    if !path.is_file() {
        return (StatusCode::NOT_FOUND, Json(json!({"detail": "not found"}))).into_response();
    }
    match tokio::fs::File::open(&path).await {
        Ok(file) => {
            let mime = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .to_string();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .body(Body::from_stream(ReaderStream::new(file)))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct ArtistQuery {
    name: String,
}

pub async fn artist(
    State(state): State<ServerState>,
    Query(query): Query<ArtistQuery>,
) -> Json<Value> {
    let slug = query.name.trim().to_lowercase().replace([' ', '/'], "_");
    let dir = wallpaper_dir(&state);
    let mut files: Vec<String> = image_files(&dir)
        .into_iter()
        .filter(|name| {
            name.starts_with(&format!("_artist_{slug}_"))
                || name.starts_with(&format!("_reddit_{slug}_"))
                || name.starts_with(&format!("_lastfm_{slug}_"))
        })
        .collect();
    files.sort();
    Json(json!({
        "artist": query.name,
        "wallpapers": files
            .iter()
            .map(|name| format!("/api/wallpapers/files/{name}"))
            .collect::<Vec<_>>()
    }))
}

#[derive(Debug, Deserialize)]
pub struct FetchQuery {
    n: Option<usize>,
}

pub async fn fetch(
    State(state): State<ServerState>,
    Query(query): Query<FetchQuery>,
) -> Json<Value> {
    let count = query.n.unwrap_or(4).clamp(1, 12);
    let dir = wallpaper_dir(&state);
    let broker = state.broker.clone();
    tokio::spawn(async move {
        let _ = std::fs::create_dir_all(&dir);
        let client = reqwest::Client::new();
        let queries = [
            "dark+neon",
            "minimalist+dark",
            "cyberpunk",
            "dark+technology",
            "space+dark",
        ];
        let mut got = 0;
        for query in queries {
            if got >= count {
                break;
            }
            let url = format!(
                "https://wallhaven.cc/api/v1/search?q={query}&categories=010&purity=100&atleast=1920x1080&sorting=random"
            );
            let Ok(response) = client.get(url).send().await else {
                continue;
            };
            let Ok(data) = response.json::<Value>().await else {
                continue;
            };
            let Some(entries) = data.get("data").and_then(Value::as_array) else {
                continue;
            };
            for entry in entries {
                if got >= count {
                    break;
                }
                let Some(path) = entry.get("path").and_then(Value::as_str) else {
                    continue;
                };
                let Some(filename) = path.rsplit('/').next() else {
                    continue;
                };
                let Ok(image) = client.get(path).send().await else {
                    continue;
                };
                let Ok(bytes) = image.bytes().await else {
                    continue;
                };
                let target = dir.join(filename);
                if target.is_file() {
                    continue;
                }
                if std::fs::write(&target, &bytes).is_ok() {
                    got += 1;
                }
            }
        }
        if got > 0 {
            broker.publish(json!({"event": "wallpapers_changed"}));
        }
    });
    Json(json!({ "accepted": true, "in_progress": true }))
}

#[derive(Debug, Deserialize)]
pub struct CoverQuery {
    artist: Option<String>,
    track: Option<String>,
}

pub async fn cover(
    Query(query): Query<CoverQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let artist = query.artist.unwrap_or_default();
    let track = query.track.unwrap_or_default();
    let term = format!("{artist} {track}").trim().to_string();
    if term.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "artist or track required"})),
        ));
    }
    let encoded: String = url::form_urlencoded::byte_serialize(term.as_bytes()).collect();
    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "https://itunes.apple.com/search?term={encoded}&media=music&limit=6"
        ))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"detail": "itunes unavailable"})),
            )
        })?;
    let data: Value = response.json().await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({"detail": "itunes unavailable"})),
        )
    })?;
    let Some(result) = data
        .get("results")
        .and_then(Value::as_array)
        .and_then(|results| {
            results
                .iter()
                .find(|result| result.get("artworkUrl100").is_some())
        })
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": "no cover found"})),
        ));
    };
    let art = result
        .get("artworkUrl100")
        .and_then(Value::as_str)
        .unwrap_or("")
        .replace("100x100bb", "1000x1000bb")
        .replace("100x100", "1000x1000");
    Ok(Json(json!({
        "url": art,
        "title": result.get("trackName").or_else(|| result.get("collectionName")),
        "artist": artist,
    })))
}

pub async fn ratings(State(state): State<ServerState>) -> Json<Value> {
    let data = state
        .config
        .store()
        .load("wallpaper_ratings", json!({"version": 1, "items": {}}));
    Json(json!({"ratings": data.get("items").cloned().unwrap_or(json!({}))}))
}

pub async fn set_rating(
    State(state): State<ServerState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let id = payload.get("id").and_then(Value::as_str).unwrap_or("");
    let rating = payload.get("rating").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() || !matches!(rating, "up" | "down" | "none") {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "id and rating (up|down|none) required"})),
        ));
    }
    let mut data = state
        .config
        .store()
        .load("wallpaper_ratings", json!({"version": 1, "items": {}}));
    if !data.get("items").is_some_and(Value::is_object) {
        data["items"] = json!({});
    }
    if let Some(items) = data.get_mut("items").and_then(Value::as_object_mut) {
        if rating == "none" {
            items.remove(id);
        } else {
            items.insert(id.to_string(), json!(rating));
        }
    }
    let _ = state.config.store().save("wallpaper_ratings", &data).await;
    Ok(Json(json!({"id": id, "rating": rating})))
}
