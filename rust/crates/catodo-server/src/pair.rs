//! Pairing info and QR code for the remote PWA.

use std::net::UdpSocket;

use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::ServerState;

#[derive(Debug, Deserialize)]
pub struct QrQuery {
    which: Option<String>,
}

pub async fn token(state: &ServerState) -> String {
    if let Ok(token) = std::env::var("CATODO_TOKEN") {
        if !token.is_empty() {
            return token;
        }
    }
    let existing = state
        .config
        .get_string("pair_token")
        .await
        .unwrap_or_default();
    if !existing.is_empty() {
        return existing;
    }
    if !state
        .config
        .get("tunnel_require_token")
        .await
        .as_bool()
        .unwrap_or(true)
    {
        return String::new();
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    let _ = state.config.set("pair_token", json!(token)).await;
    token
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

pub async fn info(State(state): State<ServerState>) -> Json<Value> {
    let token = token(&state).await;
    let host = lan_ip();
    let port = port();
    let code = if token.is_empty() {
        String::new()
    } else {
        format!("?code={token}")
    };
    let lan = format!("http://{host}:{port}/remote/{code}");
    let public = state
        .tunnel
        .public_url()
        .await
        .map(|url| format!("{}/remote/{code}", url.trim_end_matches('/')));
    Json(json!({
        "url": lan,
        "lan": lan,
        "public": public,
        "primary": if public.is_some() { "public" } else { "lan" },
        "code": token,
        "host": host,
        "port": port,
    }))
}

pub async fn qr(State(state): State<ServerState>, Query(query): Query<QrQuery>) -> Response {
    let token = token(&state).await;
    let host = lan_ip();
    let port = port();
    let code = if token.is_empty() {
        String::new()
    } else {
        format!("?code={token}")
    };
    let public = state
        .tunnel
        .public_url()
        .await
        .map(|url| format!("{}/remote/{code}", url.trim_end_matches('/')));
    let target = if query.which.as_deref() == Some("lan") {
        format!("http://{host}:{port}/remote/{code}")
    } else {
        public.unwrap_or_else(|| format!("http://{host}:{port}/remote/{code}"))
    };
    let Ok(code) = qrcode::QrCode::new(target.as_bytes()) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let svg = code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(240, 240)
        .build();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/svg+xml")
        .body(svg.into())
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}
