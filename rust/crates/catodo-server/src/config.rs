//! Runtime configuration backed by `config.json`.

use std::sync::{Arc, OnceLock};

use serde_json::{json, Map, Value};
use tokio::sync::{Mutex, RwLock};

use crate::store::Store;

const BUILTIN_THEMES_JSON: &str = include_str!("themes.json");

fn builtin_themes() -> &'static Value {
    static THEMES: OnceLock<Value> = OnceLock::new();
    THEMES.get_or_init(|| serde_json::from_str(BUILTIN_THEMES_JSON).unwrap_or_else(|_| json!([])))
}

fn theme_ids() -> Vec<String> {
    builtin_themes()
        .as_array()
        .map(|themes| {
            themes
                .iter()
                .filter_map(|theme| theme.get("id").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

pub const KEYS: &[&str] = &[
    "anime_dir",
    "arcade_dir",
    "arcade_emulators",
    "arcade_default_emulator",
    "arcade_boxart_enabled",
    "resume_last_channel",
    "spotify_minimize_on_launch",
    "per_channel_volume_enabled",
    "per_channel_volume_default",
    "channel_audio_sinks",
    "mqtt_host",
    "mqtt_port",
    "mqtt_user",
    "mqtt_pass",
    "mqtt_topic_prefix",
    "tv_url",
    "youtube_url",
    "crunchyroll_url",
    "spotify_embed_url",
    "host",
    "port",
    "plugin_repo",
    "libraries",
    "idle_screensaver_seconds",
    "idle_sleep_seconds",
    "theme",
    "themes",
    "theme_crt_enabled",
    "theme_overrides",
    "home_layout_id",
    "ui_scale",
    "public_domain",
    "tunnel_enabled",
    "tunnel_provider",
    "tunnel_token_path",
    "tunnel_require_token",
    "pair_token",
];

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

pub fn default_value(key: &str) -> Option<Value> {
    let value = match key {
        "anime_dir" => Value::String(env_or("CATODO_ANIME_DIR", &format!("{}/Anime", home()))),
        "arcade_dir" => Value::String(env_or("CATODO_ARCADE_DIR", &format!("{}/Arcade", home()))),
        "arcade_emulators" => json!({}),
        "arcade_default_emulator" => json!(""),
        "arcade_boxart_enabled" => json!(true),
        "resume_last_channel" => json!(true),
        "spotify_minimize_on_launch" => json!(true),
        "per_channel_volume_enabled" => json!(true),
        "per_channel_volume_default" => json!(50),
        "channel_audio_sinks" => json!({}),
        "mqtt_host" => json!(""),
        "mqtt_port" => json!(1883),
        "mqtt_user" => json!(""),
        "mqtt_pass" => json!(""),
        "mqtt_topic_prefix" => json!("catodo"),
        "tv_url" => Value::String(env_or("CATODO_TV_URL", "https://www.movistartv.cl")),
        "youtube_url" => Value::String(env_or("CATODO_YOUTUBE_URL", "https://www.youtube.com/tv")),
        "crunchyroll_url" => Value::String(env_or(
            "CATODO_CRUNCHYROLL_URL",
            "https://www.crunchyroll.com",
        )),
        "spotify_embed_url" => Value::String(env_or(
            "CATODO_SPOTIFY_EMBED_URL",
            "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
        )),
        "host" => Value::String(env_or("CATODO_HOST", "127.0.0.1")),
        "port" => json!(env_or("CATODO_PORT", "8765").parse::<u16>().unwrap_or(8765)),
        "plugin_repo" => json!(""),
        "libraries" => json!([]),
        "idle_screensaver_seconds" => json!(240),
        "idle_sleep_seconds" => json!(0),
        "theme" => json!("spotify-dark"),
        "themes" => json!([]),
        "theme_crt_enabled" => json!(true),
        "theme_overrides" => json!({}),
        "home_layout_id" => json!("default"),
        "ui_scale" => json!(1.0),
        "public_domain" => json!(""),
        "tunnel_enabled" => json!(false),
        "tunnel_provider" => json!("cloudflare"),
        "tunnel_token_path" => json!(""),
        "tunnel_require_token" => json!(true),
        "pair_token" => json!(""),
        _ => return None,
    };
    Some(value)
}

#[derive(Clone)]
pub struct RuntimeConfig {
    store: Store,
    cache: Arc<RwLock<Option<Map<String, Value>>>>,
    lock: Arc<Mutex<()>>,
}

impl RuntimeConfig {
    pub fn new(data_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            store: Store::new(data_dir),
            cache: Arc::new(RwLock::new(None)),
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    fn migrate_crt_alias(raw: &mut Map<String, Value>) {
        if let Some(legacy) = raw.remove("theme_crt_enabled") {
            if let Some(enabled) = legacy.as_bool() {
                let overrides = raw
                    .entry("theme_overrides")
                    .or_insert_with(|| json!({}))
                    .as_object_mut();
                if let Some(overrides) = overrides {
                    overrides.entry("crt").or_insert(json!(enabled));
                }
            }
        }
    }

    async fn raw(&self) -> Map<String, Value> {
        if let Some(cache) = self.cache.read().await.clone() {
            return cache;
        }
        let value = self.store.load("config", json!({}));
        let mut raw = value.as_object().cloned().unwrap_or_default();
        Self::migrate_crt_alias(&mut raw);
        *self.cache.write().await = Some(raw.clone());
        raw
    }

    pub async fn get(&self, key: &str) -> Value {
        let raw = self.raw().await;
        match key {
            "themes" => builtin_themes().clone(),
            "theme" => {
                let chosen = raw
                    .get("theme")
                    .and_then(Value::as_str)
                    .unwrap_or("spotify-dark");
                if theme_ids().iter().any(|id| id == chosen) {
                    json!(chosen)
                } else {
                    json!("spotify-dark")
                }
            }
            "theme_overrides" => raw
                .get("theme_overrides")
                .filter(|value| value.is_object())
                .cloned()
                .unwrap_or_else(|| json!({})),
            "theme_crt_enabled" => {
                if let Some(value) = raw
                    .get("theme_overrides")
                    .and_then(Value::as_object)
                    .and_then(|overrides| overrides.get("crt"))
                    .and_then(Value::as_bool)
                {
                    return json!(value);
                }
                let chosen = raw
                    .get("theme")
                    .and_then(Value::as_str)
                    .unwrap_or("spotify-dark");
                let value = builtin_themes()
                    .as_array()
                    .and_then(|themes| {
                        themes
                            .iter()
                            .find(|theme| theme.get("id").and_then(Value::as_str) == Some(chosen))
                    })
                    .and_then(|theme| theme.get("effects"))
                    .and_then(|effects| effects.get("crt"))
                    .and_then(Value::as_bool)
                    .unwrap_or(true);
                json!(value)
            }
            _ => raw
                .get(key)
                .cloned()
                .or_else(|| default_value(key))
                .unwrap_or(Value::Null),
        }
    }

    pub async fn get_string(&self, key: &str) -> Option<String> {
        self.get(key).await.as_str().map(str::to_string)
    }

    pub async fn all(&self) -> Map<String, Value> {
        let mut out = Map::new();
        for key in KEYS {
            out.insert((*key).to_string(), self.get(key).await);
        }
        out
    }

    pub async fn set(&self, key: &str, value: Value) -> anyhow::Result<()> {
        let _guard = self.lock.lock().await;
        let mut raw = self.raw().await;
        raw.insert(key.to_string(), value);
        self.store
            .save("config", &Value::Object(raw.clone()))
            .await?;
        *self.cache.write().await = Some(raw);
        Ok(())
    }

    pub async fn set_many(&self, values: Map<String, Value>) -> anyhow::Result<()> {
        let _guard = self.lock.lock().await;
        let mut raw = self.raw().await;
        for (key, value) in values {
            raw.insert(key, value);
        }
        self.store
            .save("config", &Value::Object(raw.clone()))
            .await?;
        *self.cache.write().await = Some(raw);
        Ok(())
    }

    pub async fn fold_crt_alias(&self, value: bool) -> anyhow::Result<Map<String, Value>> {
        let _guard = self.lock.lock().await;
        let mut raw = self.raw().await;
        let mut overrides = raw
            .get("theme_overrides")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        overrides.insert("crt".to_string(), json!(value));
        raw.insert(
            "theme_overrides".to_string(),
            Value::Object(overrides.clone()),
        );
        raw.remove("theme_crt_enabled");
        self.store
            .save("config", &Value::Object(raw.clone()))
            .await?;
        *self.cache.write().await = Some(raw);
        Ok(overrides)
    }

    pub fn normalize_public_domain(value: &str) -> String {
        let mut v = value.trim();
        if v.is_empty() {
            return String::new();
        }
        if let Some((_, rest)) = v.split_once("://") {
            v = rest;
        }
        v = v.split('/').next().unwrap_or("");
        if let Some((host, _)) = v.rsplit_once(':') {
            if !host.starts_with('[') {
                v = host;
            }
        }
        v.trim().trim_end_matches('.').to_lowercase()
    }

    pub fn validate_public_domain(value: &str) -> bool {
        let raw = value.trim();
        if raw.is_empty() || raw.contains("://") || raw.contains('/') || raw.contains(' ') {
            return false;
        }
        let host = raw.to_lowercase();
        let host = host.trim_end_matches('.');
        !host.is_empty()
            && host
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.')
            && !host.starts_with('-')
            && !host.ends_with('-')
    }

    pub fn validate_tunnel_provider(value: &str) -> bool {
        matches!(value, "cloudflare" | "tailscale")
    }
}
