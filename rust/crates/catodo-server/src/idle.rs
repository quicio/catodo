//! Idle/screensaver clock. Publishes idle events over the event broker.

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::json;
use tokio::sync::Mutex;

use crate::config::RuntimeConfig;
use crate::events::EventBroker;

pub struct IdleManager {
    broker: EventBroker,
    config: RuntimeConfig,
    last_activity: Mutex<Instant>,
    state: Mutex<String>,
}

impl IdleManager {
    pub fn new(config: RuntimeConfig, broker: EventBroker) -> Arc<Self> {
        Arc::new(Self {
            broker,
            config,
            last_activity: Mutex::new(Instant::now()),
            state: Mutex::new("active".to_string()),
        })
    }

    pub fn start(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(1)).await;
                this.evaluate().await;
            }
        });
    }

    pub async fn touch(&self) {
        *self.last_activity.lock().await = Instant::now();
    }

    async fn seconds(&self, key: &str, default: u64) -> u64 {
        self.config.get(key).await.as_u64().unwrap_or(default)
    }

    async fn evaluate(&self) {
        let screensaver = self.seconds("idle_screensaver_seconds", 240).await;
        let sleep = self.seconds("idle_sleep_seconds", 0).await;
        let elapsed = self.last_activity.lock().await.elapsed().as_secs();
        let target = if elapsed < screensaver {
            "active"
        } else if sleep > 0 && elapsed >= screensaver + sleep {
            "sleep"
        } else {
            "screensaver"
        };
        let mut state = self.state.lock().await;
        if state.as_str() == target {
            return;
        }
        *state = target.to_string();
        drop(state);
        let event = match target {
            "sleep" => "idle_sleep_on",
            "screensaver" => "idle_screensaver_on",
            _ => "idle_off",
        };
        self.broker.publish(json!({"event": event}));
    }
}
