//! Pairing single-use codes, device tokens and QR for the remote PWA.

use std::net::{SocketAddr, UdpSocket};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::extract::{ConnectInfo, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::ServerState;

const CODE_TTL: Duration = Duration::from_secs(300);
const MAX_ATTEMPTS: usize = 8;
const ATTEMPT_WINDOW: Duration = Duration::from_secs(60);

/// Código efímero de un solo uso y rate-limit para canjearlo.
#[derive(Clone, Default)]
pub struct PairingState {
    inner: Arc<PairingInner>,
}

#[derive(Default)]
struct PairingInner {
    code: Mutex<Option<PairingCode>>,
    attempts: Mutex<Vec<Instant>>,
}

struct PairingCode {
    value: String,
    expires: Instant,
}

#[derive(Debug, Deserialize)]
pub struct QrQuery {
    which: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RedeemRequest {
    pub code: String,
    pub name: Option<String>,
}

fn new_code() -> String {
    let raw = uuid::Uuid::new_v4().simple().to_string();
    raw[..8].to_ascii_uppercase()
}

fn secure_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.bytes()
        .zip(right.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

/// `true` si la request viene de la LAN o del túnel, no del kiosko local.
pub fn is_external(addr: Option<SocketAddr>, headers: &HeaderMap) -> bool {
    let forwarded = headers.contains_key("cf-connecting-ip")
        || headers.contains_key("x-forwarded-for")
        || headers.contains_key("x-forwarded-host");
    if forwarded {
        return true;
    }
    match addr {
        Some(address) => !address.ip().is_loopback(),
        // Sin ConnectInfo (tests o server mal montado) se asume local.
        None => false,
    }
}

pub fn is_public_path(path: &str) -> bool {
    matches!(path, "/api/health" | "/api/pair/info" | "/api/pair/redeem")
}

/// Código vigente; se reutiliza hasta que se canjea o expira.
pub async fn current_code(state: &ServerState) -> String {
    let mut slot = state.pairing.inner.code.lock().await;
    if let Some(code) = slot.as_ref() {
        if code.expires > Instant::now() {
            return code.value.clone();
        }
    }
    let value = new_code();
    *slot = Some(PairingCode {
        value: value.clone(),
        expires: Instant::now() + CODE_TTL,
    });
    value
}

/// Canjea un código de un solo uso y devuelve el token del dispositivo.
pub async fn redeem(state: &ServerState, code: &str, name: &str) -> Result<String, &'static str> {
    let mut attempts = state.pairing.inner.attempts.lock().await;
    attempts.retain(|at| at.elapsed() < ATTEMPT_WINDOW);
    if attempts.len() >= MAX_ATTEMPTS {
        return Err("too many attempts");
    }
    attempts.push(Instant::now());
    drop(attempts);

    let mut slot = state.pairing.inner.code.lock().await;
    let Some(current) = slot.take() else {
        return Err("no pairing code");
    };
    let normalized = code.trim().to_ascii_uppercase();
    if current.expires <= Instant::now() || !secure_eq(&current.value, &normalized) {
        *slot = Some(current);
        return Err("invalid or expired code");
    }
    drop(slot);

    let token = uuid::Uuid::new_v4().simple().to_string();
    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut devices = state
        .config
        .get("paired_devices")
        .await
        .as_array()
        .cloned()
        .unwrap_or_default();
    devices.push(json!({
        "token": token,
        "name": name.chars().take(60).collect::<String>(),
        "created": created,
    }));
    let _ = state
        .config
        .set("paired_devices", Value::Array(devices))
        .await;
    Ok(token)
}

/// Acepta `CATODO_TOKEN`, el `pair_token` legacy o un token de dispositivo.
pub async fn validate_token(state: &ServerState, provided: &str) -> bool {
    if provided.is_empty() {
        return false;
    }
    if let Ok(master) = std::env::var("CATODO_TOKEN") {
        if !master.is_empty() && secure_eq(&master, provided) {
            return true;
        }
    }
    let legacy = state
        .config
        .get_string("pair_token")
        .await
        .unwrap_or_default();
    if !legacy.is_empty() && secure_eq(&legacy, provided) {
        return true;
    }
    state
        .config
        .get("paired_devices")
        .await
        .as_array()
        .map(|devices| {
            devices.iter().any(|device| {
                device
                    .get("token")
                    .and_then(Value::as_str)
                    .is_some_and(|token| secure_eq(token, provided))
            })
        })
        .unwrap_or(false)
}

fn lan_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map(|address| address.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn port() -> u16 {
    std::env::var("CATODO_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .or_else(|| {
            std::env::var("CATODO_RS_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
        })
        .unwrap_or(8769)
}

pub async fn info(
    State(state): State<ServerState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Json<Value> {
    let external = is_external(Some(address), &headers);
    let host = lan_ip();
    let port = port();
    let code = current_code(&state).await;
    let suffix = if external {
        String::new()
    } else {
        format!("?code={code}")
    };
    let lan = format!("http://{host}:{port}/remote{suffix}");
    let public = state
        .tunnel
        .public_url()
        .await
        .map(|url| format!("{}/remote{suffix}", url.trim_end_matches('/')));
    Json(json!({
        "url": lan,
        "lan": lan,
        "public": public,
        "primary": if public.is_some() { "public" } else { "lan" },
        "code": if external { Value::Null } else { json!(code) },
        "host": host,
        "port": port,
        "pairing_required": external,
    }))
}

pub async fn qr(State(state): State<ServerState>, Query(query): Query<QrQuery>) -> Response {
    let host = lan_ip();
    let port = port();
    let code = current_code(&state).await;
    let suffix = format!("?code={code}");
    let public = state
        .tunnel
        .public_url()
        .await
        .map(|url| format!("{}/remote{suffix}", url.trim_end_matches('/')));
    let target = if query.which.as_deref() == Some("lan") {
        format!("http://{host}:{port}/remote{suffix}")
    } else {
        public.unwrap_or_else(|| format!("http://{host}:{port}/remote{suffix}"))
    };
    let Ok(qr) = qrcode::QrCode::new(target.as_bytes()) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let svg = qr
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(240, 240)
        .build();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/svg+xml")
        .body(svg.into())
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

pub async fn redeem_handler(
    State(state): State<ServerState>,
    Json(body): Json<RedeemRequest>,
) -> Response {
    let name = body.name.unwrap_or_else(|| "remote".to_string());
    match redeem(&state, &body.code, &name).await {
        Ok(token) => Json(json!({ "token": token })).into_response(),
        Err(error) => (StatusCode::UNAUTHORIZED, Json(json!({ "detail": error }))).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_is_short_and_single_use_shape() {
        let code = new_code();
        assert_eq!(code.len(), 8);
        assert!(code.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn secure_eq_matches_exactly() {
        assert!(secure_eq("ABCD1234", "ABCD1234"));
        assert!(!secure_eq("ABCD1234", "ABCD1235"));
        assert!(!secure_eq("ABCD", "ABCD1234"));
    }

    #[test]
    fn external_detection_prefers_loopback_and_forwarded_headers() {
        let addr: SocketAddr = "192.168.1.20:5555".parse().unwrap();
        assert!(is_external(Some(addr), &HeaderMap::new()));
        let local: SocketAddr = "127.0.0.1:5555".parse().unwrap();
        assert!(!is_external(Some(local), &HeaderMap::new()));
        let mut headers = HeaderMap::new();
        headers.insert("cf-connecting-ip", "1.2.3.4".parse().unwrap());
        assert!(is_external(Some(local), &headers));
    }

    #[test]
    fn public_paths_are_limited() {
        assert!(is_public_path("/api/health"));
        assert!(is_public_path("/api/pair/info"));
        assert!(is_public_path("/api/pair/redeem"));
        assert!(!is_public_path("/api/state"));
    }
}
