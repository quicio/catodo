//! Pairing single-use codes, device tokens and QR for the remote PWA.

use std::net::{SocketAddr, UdpSocket};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::extract::{Extension, Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
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

/// Origen de la request, insertado por el middleware de auth.
///
/// Lo consumen los handlers que distinguen entre kiosko local y remote
/// (configuración sensible, bibliotecas, túnel).
#[derive(Clone, Copy, Debug, Default)]
pub struct RequestOrigin {
    pub external: bool,
}

impl RequestOrigin {
    pub fn is_external(self) -> bool {
        self.external
    }
}

/// `true` si la request viene de la LAN o del túnel, no del kiosko local.
///
/// Sin `ConnectInfo` no se puede probar que sea loopback, así que se trata como
/// externa (fail-closed).
pub fn is_external(addr: Option<SocketAddr>, headers: &HeaderMap) -> bool {
    let forwarded = headers.contains_key("cf-connecting-ip")
        || headers.contains_key("x-forwarded-for")
        || headers.contains_key("x-forwarded-host");
    if forwarded {
        return true;
    }
    match addr {
        Some(address) => !address.ip().is_loopback(),
        None => true,
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

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// Un dispositivo sin `expires` es legacy y no vence; con `expires: null` tampoco.
fn is_expired(device: &Value, now: u64) -> bool {
    device
        .get("expires")
        .and_then(Value::as_u64)
        .is_some_and(|expires| expires <= now)
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
    let created = now_secs();
    let ttl_days = state
        .config
        .get("pair_token_ttl_days")
        .await
        .as_u64()
        .unwrap_or(30);
    let expires = if ttl_days == 0 {
        Value::Null
    } else {
        json!(created + ttl_days.saturating_mul(86_400))
    };
    let mut devices = state
        .config
        .get("paired_devices")
        .await
        .as_array()
        .cloned()
        .unwrap_or_default();
    devices.retain(|device| !is_expired(device, created));
    devices.push(json!({
        "token": token,
        "name": name.chars().take(60).collect::<String>(),
        "created": created,
        "expires": expires,
    }));
    let _ = state
        .config
        .set("paired_devices", Value::Array(devices))
        .await;
    Ok(token)
}

/// Identificador estable de un dispositivo sin exponer el token.
fn token_id(token: &str) -> String {
    let digest = format!("{:x}", Sha256::digest(token.as_bytes()));
    digest[..12].to_string()
}

pub async fn list_devices(state: &ServerState) -> Vec<Value> {
    let now = now_secs();
    let devices = state
        .config
        .get("paired_devices")
        .await
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut kept = Vec::with_capacity(devices.len());
    let mut removed = false;
    for device in devices {
        if is_expired(&device, now) {
            removed = true;
            continue;
        }
        kept.push(device);
    }
    if removed {
        let _ = state
            .config
            .set("paired_devices", Value::Array(kept.clone()))
            .await;
    }
    kept.into_iter()
        .filter_map(|device| {
            let token = device.get("token").and_then(Value::as_str)?;
            Some(json!({
                "id": token_id(token),
                "name": device.get("name").and_then(Value::as_str).unwrap_or("remote"),
                "created": device.get("created").cloned().unwrap_or(Value::Null),
                "expires": device.get("expires").cloned().unwrap_or(Value::Null),
            }))
        })
        .collect()
}

pub async fn devices(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "paired devices are local-only"})),
        ));
    }
    Ok(Json(json!({ "devices": list_devices(&state).await })))
}

pub async fn revoke(
    State(state): State<ServerState>,
    Extension(origin): Extension<RequestOrigin>,
    AxumPath(device_id): AxumPath<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if origin.is_external() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"detail": "paired devices are local-only"})),
        ));
    }
    let devices = state
        .config
        .get("paired_devices")
        .await
        .as_array()
        .cloned()
        .unwrap_or_default();
    let kept: Vec<Value> = devices
        .iter()
        .filter(|device| {
            device
                .get("token")
                .and_then(Value::as_str)
                .map(token_id)
                .as_deref()
                != Some(device_id.as_str())
        })
        .cloned()
        .collect();
    if kept.len() == devices.len() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"detail": format!("unknown device: {device_id}")})),
        ));
    }
    state
        .config
        .set("paired_devices", Value::Array(kept))
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"detail": "could not save devices"})),
            )
        })?;
    Ok(Json(json!({ "ok": true })))
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
    let now = now_secs();
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
                    && !is_expired(device, now)
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
    Extension(origin): Extension<RequestOrigin>,
) -> Json<Value> {
    let external = origin.is_external();
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
    fn missing_address_is_external() {
        assert!(is_external(None, &HeaderMap::new()));
    }

    #[test]
    fn device_expiration_is_opt_in() {
        let now = 1_000;
        assert!(!is_expired(&json!({}), now));
        assert!(!is_expired(&json!({"expires": null}), now));
        assert!(is_expired(&json!({"expires": 999}), now));
        assert!(is_expired(&json!({"expires": 1_000}), now));
        assert!(!is_expired(&json!({"expires": 1_001}), now));
    }

    #[test]
    fn public_paths_are_limited() {
        assert!(is_public_path("/api/health"));
        assert!(is_public_path("/api/pair/info"));
        assert!(is_public_path("/api/pair/redeem"));
        assert!(!is_public_path("/api/state"));
    }
}
