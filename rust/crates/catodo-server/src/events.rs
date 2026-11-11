//! Async event fan-out for WebSocket clients.

use serde_json::Value;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct EventBroker {
    sender: broadcast::Sender<Value>,
}

impl EventBroker {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(128);
        Self { sender }
    }

    pub fn publish(&self, event: Value) {
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.sender.subscribe()
    }
}

impl Default for EventBroker {
    fn default() -> Self {
        Self::new()
    }
}
