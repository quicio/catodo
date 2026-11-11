//! Remote mouse/keyboard injection.

use std::process::Stdio;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};
use tokio::process::Command;

use crate::ServerState;

const MEDIA_KEYS: &[&str] = &[
    "playpause",
    "prev",
    "next",
    "stop",
    "rewind",
    "forward",
    "back",
    "homepage",
    "voldown",
    "volup",
    "mute",
];

async fn run(binary: &str, args: &[&str]) -> bool {
    Command::new(binary)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn which(binary: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths)
                .map(|dir| dir.join(binary))
                .any(|candidate| candidate.is_file())
        })
        .unwrap_or(false)
}

async fn move_relative(dx: i64, dy: i64) -> bool {
    #[cfg(target_os = "macos")]
    {
        return run("cliclick", &[&format!("m:{dx},{dy}")]).await;
    }
    #[cfg(target_os = "linux")]
    {
        return run(
            "xdotool",
            &["mousemove_relative", "--", &dx.to_string(), &dy.to_string()],
        )
        .await;
    }
    #[allow(unreachable_code)]
    false
}

async fn click(button: i64) -> bool {
    #[cfg(target_os = "macos")]
    {
        let spec = if button == 2 { "rc:," } else { "c:," };
        return run("cliclick", &[spec]).await;
    }
    #[cfg(target_os = "linux")]
    {
        return run("xdotool", &["click", &button.to_string()]).await;
    }
    #[allow(unreachable_code)]
    false
}

async fn scroll(dy: i64) -> bool {
    #[cfg(target_os = "macos")]
    {
        return run("cliclick", &[&format!("scroll:0,0,{}", dy.clamp(-10, 10))]).await;
    }
    #[cfg(target_os = "linux")]
    {
        let button = if dy > 0 { "4" } else { "5" };
        let mut ok = true;
        for _ in 0..dy.unsigned_abs().min(10) {
            ok &= run("xdotool", &["click", button]).await;
        }
        return ok;
    }
    #[allow(unreachable_code)]
    false
}

async fn key(name: &str, shift: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        let key = match name {
            "esc" => "kp:esc",
            "enter" => "kp:return",
            "backspace" => "kp:delete",
            "tab" => "kp:tab",
            "space" => "kp:space",
            "up" => "kp:arrow-up",
            "down" => "kp:arrow-down",
            "left" => "kp:arrow-left",
            "right" => "kp:arrow-right",
            "del" => "kp:forward-delete",
            "home" => "kp:home",
            "end" => "kp:end",
            _ => return false,
        };
        if shift {
            run("cliclick", &["shift+down"]).await;
        }
        let ok = run("cliclick", &[key]).await;
        if shift {
            run("cliclick", &["shift+up"]).await;
        }
        return ok;
    }
    #[cfg(target_os = "linux")]
    {
        let mut args = Vec::new();
        if shift {
            args.push("shift+");
        }
        args.push(name);
        return run("xdotool", &["key", &args.join("")]).await;
    }
    #[allow(unreachable_code)]
    false
}

async fn type_text(text: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        if which("cliclick") {
            return run("cliclick", &["type", text]).await;
        }
        let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
        return run(
            "osascript",
            &[
                "-e",
                &format!("tell application \"System Events\" to keystroke \"{escaped}\""),
            ],
        )
        .await;
    }
    #[cfg(target_os = "linux")]
    {
        return run("xdotool", &["type", "--", text]).await;
    }
    #[allow(unreachable_code)]
    false
}

fn body_i64(body: &Value, key: &str, default: i64) -> i64 {
    body.get(key).and_then(Value::as_i64).unwrap_or(default)
}

pub async fn move_mouse(Json(body): Json<Value>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let dx = body_i64(&body, "dx", 0);
    let dy = body_i64(&body, "dy", 0);
    if !move_relative(dx, dy).await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"detail": "input injector not available"})),
        ));
    }
    Ok(Json(json!({"dx": dx, "dy": dy})))
}

pub async fn click_mouse(
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let button = body_i64(&body, "button", 1);
    if !click(button).await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"detail": "input injector not available"})),
        ));
    }
    Ok(Json(json!({"button": button})))
}

pub async fn scroll_mouse(
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let dy = body_i64(&body, "dy", 0);
    if dy != 0 && !scroll(dy).await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"detail": "input injector not available"})),
        ));
    }
    Ok(Json(json!({"dy": dy})))
}

pub async fn key_press(
    State(state): State<ServerState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let name = body
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    let shift = body.get("shift").and_then(Value::as_bool).unwrap_or(false);
    if MEDIA_KEYS.contains(&name.as_str()) {
        state
            .broker
            .publish(json!({"event": "media_key", "key": name}));
        return Ok(Json(json!({"key": name, "shift": shift, "media": true})));
    }
    if !key(&name, shift).await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"detail": "input injector not available"})),
        ));
    }
    Ok(Json(json!({"key": name, "shift": shift, "media": false})))
}

pub async fn type_text_handler(
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let text = body.get("text").and_then(Value::as_str).unwrap_or("");
    if text.is_empty() {
        return Ok(Json(json!({"text": ""})));
    }
    if !type_text(text).await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"detail": "input injector not available"})),
        ));
    }
    Ok(Json(json!({"text": text})))
}
