//! WebSocket de frames crudos del arcade: video sin encoder ni MSE.
//!
//! Cada mensaje binario es `width u32 LE | height u32 LE | RGBA tight-packed`.
//! El `watch` sólo guarda el último frame: si el cliente no da abasto, se
//! saltean frames en vez de acumular latencia.

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use tokio::sync::watch;

use crate::channels::LiveFrame;
use crate::ServerState;

pub async fn frames_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
    Path(channel_id): Path<String>,
) -> Response {
    let Some(channel) = state.manager.get(&channel_id).await else {
        return (StatusCode::NOT_FOUND, "unknown channel").into_response();
    };
    let Some(frames) = channel.live_frames().await else {
        return (StatusCode::NOT_FOUND, "channel has no live frames").into_response();
    };
    ws.on_upgrade(move |socket| stream_frames(socket, frames))
        .into_response()
}

async fn stream_frames(mut socket: WebSocket, mut frames: watch::Receiver<Option<Arc<LiveFrame>>>) {
    loop {
        if frames.changed().await.is_err() {
            break;
        }
        let frame = { frames.borrow().clone() };
        let Some(frame) = frame else {
            continue;
        };
        let mut message = Vec::with_capacity(8 + frame.data.len());
        message.extend_from_slice(&frame.width.to_le_bytes());
        message.extend_from_slice(&frame.height.to_le_bytes());
        message.extend_from_slice(&frame.data);
        if socket.send(Message::Binary(message.into())).await.is_err() {
            break;
        }
    }
}
