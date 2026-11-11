//! Lyrics lookup via LRCLIB (no auth required).

use axum::extract::Query;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

const LRCLIB_GET: &str = "https://lrclib.net/api/get";
const LRCLIB_SEARCH: &str = "https://lrclib.net/api/search";

#[derive(Debug, Deserialize)]
pub struct LyricsQuery {
    artist: String,
    track: String,
    duration: Option<i64>,
}

pub async fn lyrics(
    Query(query): Query<LyricsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let artist = query.artist.trim();
    let track = query.track.trim();
    if artist.is_empty() || track.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "artist and track are required"})),
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("catodo/0.1 (https://github.com/quicio/catodo)")
        .build()
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"detail": "http client unavailable"})),
            )
        })?;

    let mut exact: Option<Value> = None;
    let mut params = vec![
        ("artist_name", artist.to_string()),
        ("track_name", track.to_string()),
    ];
    if let Some(duration) = query.duration {
        params.push(("duration", duration.to_string()));
    }
    if let Ok(response) = client.get(LRCLIB_GET).query(&params).send().await {
        if response.status().is_success() {
            if let Ok(data) = response.json::<Value>().await {
                if data
                    .get("syncedLyrics")
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty())
                {
                    return Ok(Json(format(data)));
                }
                exact = Some(data);
            }
        }
    }

    let search_params = [
        ("artist_name", artist.to_string()),
        ("track_name", track.to_string()),
    ];
    if let Ok(response) = client.get(LRCLIB_SEARCH).query(&search_params).send().await {
        if response.status().is_success() {
            if let Ok(results) = response.json::<Vec<Value>>().await {
                if let Some(best) = pick_best(&results, query.duration) {
                    if best
                        .get("syncedLyrics")
                        .and_then(Value::as_str)
                        .is_some_and(|value| !value.is_empty())
                    {
                        return Ok(Json(format(best)));
                    }
                    if let Some(exact) = exact.as_ref() {
                        if exact
                            .get("plainLyrics")
                            .and_then(Value::as_str)
                            .is_some_and(|value| !value.is_empty())
                        {
                            return Ok(Json(format(exact.clone())));
                        }
                    }
                    return Ok(Json(format(best)));
                }
            }
        }
    }

    if let Some(exact) = exact {
        if exact
            .get("plainLyrics")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty())
        {
            return Ok(Json(format(exact)));
        }
    }
    Err((
        StatusCode::NOT_FOUND,
        Json(json!({"detail": "lyrics not found"})),
    ))
}

fn pick_best(results: &[Value], duration: Option<i64>) -> Option<Value> {
    let synced: Vec<&Value> = results
        .iter()
        .filter(|item| {
            item.get("syncedLyrics")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.is_empty())
        })
        .collect();
    let candidates: Vec<&Value> = if synced.is_empty() {
        results.iter().collect()
    } else {
        synced
    };
    if candidates.is_empty() {
        return None;
    }
    let Some(duration) = duration else {
        return candidates.first().map(|value| (*value).clone());
    };
    candidates
        .iter()
        .filter_map(|item| {
            let candidate = item.get("duration").and_then(Value::as_f64)?;
            Some(((candidate - f64::from(duration as i32)).abs(), *item))
        })
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, value)| value.clone())
        .or_else(|| candidates.first().map(|value| (*value).clone()))
}

fn format(data: Value) -> Value {
    let plain = data
        .get("plainLyrics")
        .and_then(Value::as_str)
        .unwrap_or("");
    let synced = data
        .get("syncedLyrics")
        .and_then(Value::as_str)
        .unwrap_or("");
    let mut lines = Vec::new();
    for line in synced.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Some(end) = line.find(']') else {
            continue;
        };
        let timestamp = line[1..end].trim();
        let text = line[end + 1..].trim();
        let Some((minutes, seconds)) = timestamp.split_once(':') else {
            continue;
        };
        let (Ok(minutes), Ok(seconds)) = (minutes.parse::<u64>(), seconds.parse::<f64>()) else {
            continue;
        };
        lines.push(json!({
            "t": minutes as f64 * 60.0 + seconds,
            "text": text,
        }));
    }
    json!({
        "track": data.get("trackName").cloned().unwrap_or(Value::Null),
        "artist": data.get("artistName").cloned().unwrap_or(Value::Null),
        "album": data.get("albumName").cloned().unwrap_or(Value::Null),
        "duration": data.get("duration").cloned().unwrap_or(Value::Null),
        "synced": !lines.is_empty(),
        "lines": lines,
        "plain": plain,
        "source": "lrclib",
        "id": data.get("id").cloned().unwrap_or(Value::Null),
    })
}
