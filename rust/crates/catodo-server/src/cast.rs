//! Screen casting signaling relay (WebRTC offer/answer/ICE).

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{mpsc, Mutex};

use crate::events::EventBroker;
use crate::ServerState;

const READY: &str = "__catodo_ready";
const STOP: &str = "__catodo_stop";
const RECEIVER_READY: &str = "__catodo_receiver_ready";

#[derive(Default)]
struct CastState {
    state: String,
    source: Option<mpsc::UnboundedSender<String>>,
    receiver: Option<mpsc::UnboundedSender<String>>,
    source_label: Option<String>,
    token: Option<String>,
    started_at: Option<u64>,
}

pub struct CastManager {
    broker: EventBroker,
    state: Mutex<CastState>,
}

impl CastManager {
    pub fn new(broker: EventBroker) -> Arc<Self> {
        Arc::new(Self {
            broker,
            state: Mutex::new(CastState {
                state: "idle".to_string(),
                ..CastState::default()
            }),
        })
    }

    pub async fn info(&self) -> Value {
        let state = self.state.lock().await;
        json!({
            "state": state.state,
            "token": state.token,
            "source": state.source_label,
            "started_at": state.started_at,
        })
    }

    async fn set_state(&self, state: &str) {
        let mut current = self.state.lock().await;
        if current.state == state {
            return;
        }
        current.state = state.to_string();
        drop(current);
        if state == "active" {
            let current = self.state.lock().await;
            self.broker.publish(json!({
                "event": "cast_session_started",
                "source": current.source_label,
                "token": current.token,
            }));
        } else if state == "idle" {
            self.broker.publish(json!({"event": "cast_session_ended"}));
        }
    }

    pub async fn stop(&self) {
        let (source, receiver) = {
            let mut state = self.state.lock().await;
            let source = state.source.take();
            let receiver = state.receiver.take();
            state.state = "idle".to_string();
            state.token = None;
            state.source_label = None;
            state.started_at = None;
            (source, receiver)
        };
        if let Some(source) = source {
            let _ = source.send(STOP.to_string());
        }
        if let Some(receiver) = receiver {
            let _ = receiver.send(STOP.to_string());
        }
        self.broker.publish(json!({"event": "cast_session_ended"}));
    }

    async fn register(
        &self,
        role: &str,
        label: Option<String>,
        sender: mpsc::UnboundedSender<String>,
    ) {
        let mut state = self.state.lock().await;
        if role == "source" {
            state.source = Some(sender);
            state.source_label = label;
            state.token = Some(uuid::Uuid::new_v4().simple().to_string()[..8].to_string());
            state.started_at = Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_secs())
                    .unwrap_or(0),
            );
            state.state = "signaling".to_string();
            if let Some(receiver) = &state.receiver {
                let _ = receiver.send(RECEIVER_READY.to_string());
            }
        } else {
            state.receiver = Some(sender);
            if let Some(source) = &state.source {
                let _ = source.send(RECEIVER_READY.to_string());
            }
        }
    }

    async fn unregister(&self, role: &str) {
        let mut state = self.state.lock().await;
        if role == "source" {
            state.source = None;
        } else {
            state.receiver = None;
        }
        let both_gone = state.source.is_none() && state.receiver.is_none();
        drop(state);
        if both_gone {
            self.set_state("idle").await;
        }
    }

    async fn relay(&self, role: &str, message: String) {
        if message == READY {
            self.set_state("active").await;
            return;
        }
        if message == STOP {
            self.stop().await;
            return;
        }
        let state = self.state.lock().await;
        let target = if role == "source" {
            state.receiver.as_ref()
        } else {
            state.source.as_ref()
        };
        if let Some(target) = target {
            let _ = target.send(message);
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CastQuery {
    role: Option<String>,
    label: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
    Query(query): Query<CastQuery>,
) -> Response {
    let role = query.role.unwrap_or_else(|| "source".to_string());
    let cast = state.cast.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, cast, role, query.label))
        .into_response()
}

async fn handle_socket(
    socket: WebSocket,
    cast: Arc<CastManager>,
    role: String,
    label: Option<String>,
) {
    let (mut sink, mut stream) = socket.split();
    let (sender, mut receiver) = mpsc::unbounded_channel::<String>();
    cast.register(&role, label, sender).await;

    let send_task = tokio::spawn(async move {
        while let Some(message) = receiver.recv().await {
            if sink.send(Message::Text(message.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = stream.next().await {
        match message {
            Message::Text(text) => cast.relay(&role, text.to_string()).await,
            Message::Close(_) => break,
            _ => {}
        }
    }

    cast.unregister(&role).await;
    send_task.abort();
}

pub async fn state(State(state): State<ServerState>) -> Json<Value> {
    Json(state.cast.info().await)
}

pub async fn stop(State(state): State<ServerState>) -> Json<Value> {
    state.cast.stop().await;
    Json(json!({"ok": true}))
}

pub async fn not_available() -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({"detail": "cast not available"})),
    )
}
