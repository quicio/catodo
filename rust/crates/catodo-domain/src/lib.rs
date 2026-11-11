//! Pure domain types for the Cátodo Rust backend.
//!
//! This crate deliberately has no HTTP, async runtime, or OS dependencies.

use serde::{Deserialize, Serialize};

/// Response body for `GET /api/health`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Health {
    pub status: String,
}

impl Default for Health {
    fn default() -> Self {
        Self {
            status: "ok".to_string(),
        }
    }
}

/// Response body for `GET /api/version`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionInfo {
    pub version: String,
}

impl VersionInfo {
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            version: version.into(),
        }
    }
}

/// Public channel descriptor returned by `GET /api/channels`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_keys: Option<serde_json::Value>,
}

impl ChannelInfo {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        channel_type: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            icon: String::new(),
            channel_type: channel_type.into(),
            capabilities: Vec::new(),
            order: None,
            color: None,
            partition: None,
            user_agent: None,
            search_url: None,
            media_keys: None,
        }
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = icon.into();
        self
    }

    pub fn with_order(mut self, order: i64) -> Self {
        self.order = Some(order);
        self
    }

    pub fn with_capabilities(mut self, capabilities: impl IntoIterator<Item = String>) -> Self {
        self.capabilities = capabilities.into_iter().collect();
        self
    }
}

/// Global state returned by `GET /api/state` and the WebSocket snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppState {
    pub current_channel_id: Option<String>,
    pub playing: bool,
    pub volume: u8,
    pub available_channels: Vec<ChannelInfo>,
    pub history: Vec<String>,
    pub last_channel_id: Option<String>,
    pub uptime_seconds: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_serializes_to_contract_shape() {
        assert_eq!(
            serde_json::to_string(&Health::default()).unwrap(),
            r#"{"status":"ok"}"#
        );
    }

    #[test]
    fn version_serializes_to_contract_shape() {
        assert_eq!(
            serde_json::to_string(&VersionInfo::new("0.2.0")).unwrap(),
            r#"{"version":"0.2.0"}"#
        );
    }

    #[test]
    fn channel_info_uses_type_key() {
        let info = ChannelInfo::new("youtube", "YouTube", "web").with_order(1);
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["type"], "web");
        assert_eq!(json["order"], 1);
        assert!(json.get("channel_type").is_none());
    }
}
