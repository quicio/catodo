//! Optional MQTT bridge: subscribe to `<prefix>/cmd/#`, publish `<prefix>/state`.

use std::time::Duration;

use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde_json::{json, Value};

use crate::ServerState;

pub async fn start(state: &ServerState) {
    let host = state
        .config
        .get_string("mqtt_host")
        .await
        .unwrap_or_default();
    if host.is_empty() {
        return;
    }
    let config = state.config.clone();
    let manager = state.manager.clone();
    let broker = state.broker.clone();
    tokio::spawn(async move {
        loop {
            let port = config.get("mqtt_port").await.as_u64().unwrap_or(1883) as u16;
            let prefix = config
                .get_string("mqtt_topic_prefix")
                .await
                .unwrap_or_else(|| "catodo".to_string());
            let mut options = MqttOptions::new("catodo", host.clone(), port);
            options.set_keep_alive(Duration::from_secs(30));
            let user = config.get_string("mqtt_user").await.unwrap_or_default();
            if !user.is_empty() {
                let password = config.get_string("mqtt_pass").await.unwrap_or_default();
                options.set_credentials(user, password);
            }
            let (client, mut eventloop) = AsyncClient::new(options, 16);
            if client
                .subscribe(format!("{prefix}/cmd/#"), QoS::AtMostOnce)
                .await
                .is_err()
            {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
            let mut events = broker.subscribe();
            let _ = publish_state(&client, &manager, &prefix).await;
            loop {
                tokio::select! {
                    event = eventloop.poll() => {
                        match event {
                            Ok(Event::Incoming(Packet::Publish(message))) => {
                                let payload = String::from_utf8_lossy(&message.payload).trim().to_string();
                                let topic = message.topic.clone();
                                let name = topic.strip_prefix(&format!("{prefix}/cmd/")).unwrap_or(&topic);
                                handle(&manager, &broker, name, &payload).await;
                            }
                            Ok(_) => {}
                            Err(error) => {
                                tracing::warn!("mqtt loop error: {error}");
                                break;
                            }
                        }
                    }
                    event = events.recv() => {
                        if let Ok(value) = event {
                            if matches!(
                                value.get("event").and_then(Value::as_str),
                                Some("channel_changed" | "volume_changed" | "playing_changed")
                            ) {
                                let _ = publish_state(&client, &manager, &prefix).await;
                            }
                        }
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn publish_state(
    client: &AsyncClient,
    manager: &std::sync::Arc<crate::manager::ChannelManager>,
    prefix: &str,
) -> anyhow::Result<()> {
    let state = manager.state().await;
    let payload = json!({
        "channel": state.current_channel_id,
        "volume": state.volume,
        "playing": state.playing,
    });
    client
        .publish(
            format!("{prefix}/state"),
            QoS::AtLeastOnce,
            true,
            payload.to_string(),
        )
        .await?;
    Ok(())
}

async fn handle(
    manager: &std::sync::Arc<crate::manager::ChannelManager>,
    broker: &crate::events::EventBroker,
    name: &str,
    payload: &str,
) {
    match name {
        "channel" if !payload.is_empty() => {
            let _ = manager.open(payload).await;
        }
        "next" => {
            let _ = manager.next().await;
        }
        "prev" => {
            let _ = manager.previous().await;
        }
        "volume" => {
            let value = payload.trim().to_lowercase();
            match value.as_str() {
                "+" | "up" | "subir" => {
                    manager.adjust_volume(5).await;
                }
                "-" | "down" | "bajar" => {
                    manager.adjust_volume(-5).await;
                }
                other => {
                    if let Ok(level) = other.parse::<i64>() {
                        manager.set_volume(level).await;
                    }
                }
            }
        }
        "play" | "pause" => {
            if let Some(current) = manager.current().await {
                let _ = manager
                    .command(&current, name, serde_json::Map::new())
                    .await;
            }
        }
        "home" => {
            broker.publish(json!({"event": "channel_changed", "channel_id": null}));
        }
        _ => {}
    }
}
