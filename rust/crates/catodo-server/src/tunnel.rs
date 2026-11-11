//! Tunnel manager: cloudflared and Tailscale Funnel process supervision.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::config::RuntimeConfig;
use crate::store::Store;
use crate::ServerState;

const STATE_FILE: &str = "tunnel_state";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatus {
    pub state: String,
    pub provider: String,
    pub pid: Option<u32>,
    pub started_at: Option<u64>,
    pub last_error: Option<String>,
}

impl Default for TunnelStatus {
    fn default() -> Self {
        Self {
            state: "stopped".to_string(),
            provider: String::new(),
            pid: None,
            started_at: None,
            last_error: None,
        }
    }
}

pub struct TunnelManager {
    config: RuntimeConfig,
    store: Store,
    status: Mutex<TunnelStatus>,
    lock: Mutex<()>,
}

impl TunnelManager {
    pub fn new(config: RuntimeConfig, data_dir: impl Into<PathBuf>) -> Arc<Self> {
        let store = Store::new(data_dir);
        let value = store.load(STATE_FILE, json!({}));
        let status = serde_json::from_value(value).unwrap_or_default();
        Arc::new(Self {
            config,
            store,
            status: Mutex::new(status),
            lock: Mutex::new(()),
        })
    }

    async fn save(&self, status: &TunnelStatus) {
        let _ = self.store.save(STATE_FILE, &json!(status)).await;
    }

    pub async fn status(&self) -> Value {
        let mut status = self.status.lock().await.clone();
        if status.state == "running" && !self.is_running(&status).await {
            status.state = "stopped".to_string();
            status.pid = None;
            self.save(&status).await;
        }
        json!(status)
    }

    pub async fn providers(&self) -> Value {
        let domain = self
            .config
            .get_string("public_domain")
            .await
            .unwrap_or_default();
        let token = self
            .config
            .get_string("tunnel_token_path")
            .await
            .unwrap_or_default();
        let cloudflared = self.cloudflared_binary().await;
        let tailscale = which("tailscale");
        json!([
            {
                "name": "cloudflare",
                "configured": cloudflared.is_some() && !token.is_empty() && !domain.is_empty(),
            },
            {
                "name": "tailscale-funnel",
                "configured": tailscale.is_some(),
            },
        ])
    }

    async fn cloudflared_binary(&self) -> Option<PathBuf> {
        let local = self
            .config
            .store()
            .data_dir()
            .join("bin")
            .join("cloudflared");
        if local.is_file() {
            return Some(local);
        }
        which("cloudflared")
    }

    async fn is_running(&self, status: &TunnelStatus) -> bool {
        if status.provider == "tailscale-funnel" {
            return tailscale_funnel_running(self.port().await).await;
        }
        let Some(pid) = status.pid else {
            return false;
        };
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .await
            .map(|status| status.success())
            .unwrap_or(false)
    }

    async fn port(&self) -> u16 {
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

    pub async fn start(&self) -> Result<Value, (StatusCode, Json<Value>)> {
        let _guard = self.lock.lock().await;
        let provider = self
            .config
            .get_string("tunnel_provider")
            .await
            .unwrap_or_else(|| "cloudflare".to_string());
        if provider == "cloudflare" {
            self.start_cloudflare().await
        } else if provider == "tailscale-funnel" {
            self.start_tailscale().await
        } else {
            Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"detail": format!("unknown provider: {provider}")})),
            ))
        }
    }

    async fn start_cloudflare(&self) -> Result<Value, (StatusCode, Json<Value>)> {
        let binary = self.cloudflared_binary().await.ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"detail": "cloudflared binary not found in PATH"})),
            )
        })?;
        let token = self
            .config
            .get_string("tunnel_token_path")
            .await
            .unwrap_or_default();
        if token.is_empty() || !std::path::Path::new(&token).is_file() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"detail": "tunnel_token_path is empty or unreadable"})),
            ));
        }
        let domain = self
            .config
            .get_string("public_domain")
            .await
            .unwrap_or_default();
        if domain.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"detail": "public_domain is empty"})),
            ));
        }
        let log_path = self.config.store().data_dir().join("tunnel.log");
        let log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .ok();
        let stderr = log
            .as_ref()
            .and_then(|file| file.try_clone().ok())
            .map(Stdio::from)
            .unwrap_or_else(Stdio::null);
        let stdout = log.map(Stdio::from).unwrap_or_else(Stdio::null);
        let child = Command::new(binary)
            .args(["tunnel", "--no-autoupdate", "run", "--token-file", &token])
            .stdin(Stdio::null())
            .stdout(stdout)
            .stderr(stderr)
            .spawn()
            .map_err(|error| {
                (
                    StatusCode::CONFLICT,
                    Json(json!({"detail": error.to_string()})),
                )
            })?;
        let pid = child.id();
        std::mem::drop(child);
        let status = TunnelStatus {
            state: "running".to_string(),
            provider: "cloudflare".to_string(),
            pid,
            started_at: Some(now()),
            last_error: None,
        };
        *self.status.lock().await = status.clone();
        self.save(&status).await;
        Ok(json!(status))
    }

    async fn start_tailscale(&self) -> Result<Value, (StatusCode, Json<Value>)> {
        let binary = which("tailscale").ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"detail": "tailscale binary not found in PATH"})),
            )
        })?;
        let port = self.port().await;
        let output = Command::new(binary)
            .args(["funnel", "--bg", &port.to_string()])
            .output()
            .await
            .map_err(|error| {
                (
                    StatusCode::CONFLICT,
                    Json(json!({"detail": error.to_string()})),
                )
            })?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"detail": format!("tailscale funnel failed: {detail}")})),
            ));
        }
        let status = TunnelStatus {
            state: "running".to_string(),
            provider: "tailscale-funnel".to_string(),
            pid: None,
            started_at: Some(now()),
            last_error: None,
        };
        *self.status.lock().await = status.clone();
        self.save(&status).await;
        Ok(json!(status))
    }

    pub async fn stop(&self) -> Value {
        let _guard = self.lock.lock().await;
        let status = self.status.lock().await.clone();
        if status.provider == "tailscale-funnel" {
            if let Some(binary) = which("tailscale") {
                let port = self.port().await;
                let _ = Command::new(binary)
                    .args(["funnel", &port.to_string(), "off"])
                    .status()
                    .await;
            }
        } else if let Some(pid) = status.pid {
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status()
                .await;
        }
        let stopped = TunnelStatus {
            state: "stopped".to_string(),
            provider: status.provider,
            pid: None,
            started_at: None,
            last_error: None,
        };
        *self.status.lock().await = stopped.clone();
        self.save(&stopped).await;
        json!(stopped)
    }

    pub async fn health(&self) -> Value {
        let status = self.status().await;
        if status.get("state").and_then(Value::as_str) != Some("running") {
            return json!({"reachable": false, "reason": "stopped"});
        }
        let Some(url) = self.public_url().await else {
            return json!({"reachable": false, "last_error": "public URL unavailable"});
        };
        let start = Instant::now();
        match reqwest::Client::new()
            .get(format!("{}/api/health", url.trim_end_matches('/')))
            .timeout(Duration::from_secs(3))
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => json!({
                "reachable": true,
                "latency_ms": start.elapsed().as_millis(),
            }),
            Ok(response) => json!({
                "reachable": false,
                "last_error": format!("HTTP {}", response.status()),
            }),
            Err(error) => json!({"reachable": false, "last_error": error.to_string()}),
        }
    }

    pub async fn public_url(&self) -> Option<String> {
        let status = self.status().await;
        if status.get("state").and_then(Value::as_str) != Some("running") {
            return None;
        }
        let provider = status.get("provider").and_then(Value::as_str).unwrap_or("");
        if provider == "cloudflare" {
            let domain = self
                .config
                .get_string("public_domain")
                .await
                .unwrap_or_default();
            return (!domain.is_empty()).then(|| format!("https://{domain}"));
        }
        let binary = which("tailscale")?;
        let output = Command::new(binary)
            .args(["status", "--json"])
            .output()
            .await
            .ok()?;
        let data: Value = serde_json::from_slice(&output.stdout).ok()?;
        let dns = data
            .get("Self")
            .and_then(|value| value.get("DNSName"))
            .and_then(Value::as_str)?
            .trim_end_matches('.');
        (!dns.is_empty()).then(|| format!("https://{dns}"))
    }
}

fn which(binary: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(binary))
            .find(|candidate| candidate.is_file())
    })
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

async fn tailscale_funnel_running(port: u16) -> bool {
    let Some(binary) = which("tailscale") else {
        return false;
    };
    Command::new(binary)
        .args(["funnel", "status"])
        .output()
        .await
        .map(|output| {
            output.status.success()
                && String::from_utf8_lossy(&output.stdout).contains(&format!(":{port}"))
        })
        .unwrap_or(false)
}

pub async fn providers(State(state): State<ServerState>) -> Json<Value> {
    Json(state.tunnel.providers().await)
}

pub async fn status(State(state): State<ServerState>) -> Json<Value> {
    Json(state.tunnel.status().await)
}

pub async fn health(State(state): State<ServerState>) -> Json<Value> {
    Json(state.tunnel.health().await)
}

pub async fn start(
    State(state): State<ServerState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    state.tunnel.start().await.map(Json)
}

pub async fn stop(State(state): State<ServerState>) -> Json<Value> {
    Json(state.tunnel.stop().await)
}
