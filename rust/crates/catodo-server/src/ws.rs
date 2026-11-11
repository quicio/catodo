//! WebSocket endpoint: initial state snapshot plus live events.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use serde_json::{json, Value};
use tokio::sync::broadcast::error::RecvError;

use crate::ServerState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn snapshot(state: &ServerState) -> Value {
    let app_state = state.manager.state().await;
    let mut value = serde_json::to_value(app_state).unwrap_or_else(|_| json!({}));
    if let Some(object) = value.as_object_mut() {
        object.insert("event".to_string(), json!("state_snapshot"));
        object.insert(
            "channels".to_string(),
            Value::Object(state.manager.channel_states().await),
        );
    }
    value
}

async fn handle_socket(mut socket: WebSocket, state: ServerState) {
    let mut events = state.broker.subscribe();
    let initial = snapshot(&state).await;
    if socket
        .send(Message::Text(initial.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            event = events.recv() => {
                match event {
                    Ok(value) => {
                        if socket.send(Message::Text(value.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    Err(RecvError::Lagged(_)) => continue,
                    Err(RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
