//! Voice command matching (STT happens outside Cátodo).

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::ServerState;

fn normalize(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|character| match character {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            other => other,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn match_verb(text: &str) -> Option<&'static str> {
    let text = normalize(text);
    if text.contains("volumen") {
        if ["sub", "aument", "arriba", "mas volumen", "alto"]
            .iter()
            .any(|word| text.contains(word))
        {
            return Some("volume_up");
        }
        if ["baj", "disminu", "abajo", "menos", "bajo"]
            .iter()
            .any(|word| text.contains(word))
        {
            return Some("volume_down");
        }
    }
    if text.contains("siguiente") || text.contains("adelante") || text.contains("otro canal") {
        return Some("next");
    }
    if text.contains("anterior") || text.contains("atras") || text.contains("volver") {
        return Some("prev");
    }
    if text.contains("pausa") || text.contains("pause") {
        return Some("pause");
    }
    if text.contains("play") || text.contains("reproduc") || text.contains("segui") {
        return Some("play");
    }
    if text.contains("inicio") || text.contains("principal") || text.contains("home") {
        return Some("home");
    }
    if text.contains("pantalla") || text.contains("proyect") {
        return Some("screen");
    }
    None
}

fn match_channel<'a>(text: &str, channels: &'a [Value]) -> Option<&'a str> {
    let text = normalize(text);
    for (index, channel) in channels.iter().enumerate() {
        let name = normalize(channel.get("name").and_then(Value::as_str).unwrap_or(""));
        if !name.is_empty() && text.contains(&name) {
            return channel.get("id").and_then(Value::as_str).or(Some(
                ["spotify", "youtube", "anime", "arcade", "tv"][index.min(4)],
            ));
        }
    }
    let words = [
        ("uno", 0),
        ("dos", 1),
        ("tres", 2),
        ("cuatro", 3),
        ("cinco", 4),
        ("seis", 5),
    ];
    for (word, index) in words {
        if text.contains(&format!("canal {word}")) || text.contains(&format!("canal {index}")) {
            return channels
                .get(index)
                .and_then(|channel| channel.get("id"))
                .and_then(Value::as_str);
        }
    }
    None
}

pub async fn voice(
    State(state): State<ServerState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let text = payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if text.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"detail": "missing 'text'"})),
        ));
    }
    let channels = state.manager.list().await;
    let channels: Vec<Value> = channels
        .iter()
        .filter_map(|channel| serde_json::to_value(channel).ok())
        .collect();

    let mut recognized = false;
    let mut action: Option<String> = None;
    let mut channel: Option<String> = None;

    if let Some(verb) = match_verb(text) {
        recognized = true;
        action = Some(verb.to_string());
        match verb {
            "next" => {
                let _ = state.manager.next().await;
            }
            "prev" => {
                let _ = state.manager.previous().await;
            }
            "volume_up" => {
                state.manager.adjust_volume(5).await;
            }
            "volume_down" => {
                state.manager.adjust_volume(-5).await;
            }
            "play" | "pause" => {
                if let Some(current) = state.manager.current().await {
                    let mut args = serde_json::Map::new();
                    args.insert("command".to_string(), json!(verb));
                    let _ = state.manager.command(&current, verb, args).await;
                }
            }
            "screen" => {
                let _ = state.manager.open("screen-cast").await;
            }
            _ => {}
        }
    } else if let Some(id) = match_channel(text, &channels) {
        recognized = true;
        action = Some("open".to_string());
        channel = Some(id.to_string());
        let _ = state.manager.open(id).await;
    }

    state.broker.publish(json!({
        "event": "voice_command",
        "recognized": recognized,
        "action": action,
        "channel": channel,
        "text": text,
    }));
    Ok(Json(json!({
        "ok": true,
        "recognized": recognized,
        "action": action,
        "channel": channel,
    })))
}
