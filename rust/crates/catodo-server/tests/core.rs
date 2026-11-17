use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use catodo_server::channels::build_default_channels;
use catodo_server::config::RuntimeConfig;
use catodo_server::events::EventBroker;
use catodo_server::manager::ChannelManager;
use catodo_server::{router, ServerState};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

static APP_COUNTER: AtomicU64 = AtomicU64::new(0);

async fn app() -> (axum::Router, Arc<ChannelManager>) {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        ^ u128::from(APP_COUNTER.fetch_add(1, Ordering::SeqCst));
    let dir = std::env::temp_dir().join(format!("catodo-rs-core-{unique}"));
    let config = RuntimeConfig::new(dir.clone());
    let broker = EventBroker::new();
    let manager = Arc::new(ChannelManager::new(broker.clone(), dir.clone()));
    manager.init().await;
    let state = ServerState::new("0.2.0", config, broker, manager.clone());
    catodo_server::plugins::seed_bundled(&state).await;
    let enabled = catodo_server::plugins::enabled_ids(&state);
    for channel in build_default_channels(&state.config, &dir, &state.broker, &enabled).await {
        manager.register(channel).await.unwrap();
    }
    manager
        .set_order_overrides(catodo_server::plugins::order_overrides(&state))
        .await;
    manager.reorder().await;
    (router(state), manager)
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn get(router: axum::Router, uri: &str) -> axum::response::Response {
    router
        .oneshot(with_client(
            Request::builder().uri(uri).body(Body::empty()).unwrap(),
            "127.0.0.1:5000",
        ))
        .await
        .unwrap()
}

async fn post_json(router: axum::Router, uri: &str, body: &str) -> axum::response::Response {
    post_json_addr(router, uri, body, "127.0.0.1:5000", None).await
}

async fn delete(router: axum::Router, uri: &str) -> axum::response::Response {
    router
        .oneshot(with_client(
            Request::builder()
                .method("DELETE")
                .uri(uri)
                .body(Body::empty())
                .unwrap(),
            "127.0.0.1:5000",
        ))
        .await
        .unwrap()
}

async fn post_json_addr(
    router: axum::Router,
    uri: &str,
    body: &str,
    addr: &str,
    token: Option<&str>,
) -> axum::response::Response {
    let mut builder = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(token) = token {
        builder = builder.header("x-catodo-token", token);
    }
    router
        .oneshot(with_client(
            builder.body(Body::from(body.to_string())).unwrap(),
            addr,
        ))
        .await
        .unwrap()
}

fn with_client(mut request: Request<Body>, addr: &str) -> Request<Body> {
    request
        .extensions_mut()
        .insert(ConnectInfo(addr.parse::<SocketAddr>().unwrap()));
    request
}

async fn get_addr(router: axum::Router, uri: &str, addr: &str) -> axum::response::Response {
    router
        .oneshot(with_client(
            Request::builder().uri(uri).body(Body::empty()).unwrap(),
            addr,
        ))
        .await
        .unwrap()
}

async fn channel_ids(app: &axum::Router) -> Vec<String> {
    let value = body_json(get(app.clone(), "/api/channels").await).await;
    value
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|channel| {
            channel
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
}

fn position(ids: &[String], id: &str) -> usize {
    ids.iter().position(|candidate| candidate == id).unwrap()
}

async fn pair_token(app: &axum::Router) -> String {
    let info = body_json(get_addr(app.clone(), "/api/pair/info", "127.0.0.1:5000").await).await;
    let code = info["code"].as_str().expect("pairing code").to_string();
    let response = post_json(
        app.clone(),
        "/api/pair/redeem",
        &format!(r#"{{"code":"{code}","name":"test-remote"}}"#),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    body_json(response).await["token"]
        .as_str()
        .expect("device token")
        .to_string()
}

#[tokio::test]
async fn state_has_global_shape() {
    let (app, _) = app().await;
    let response = get(app, "/api/state").await;
    assert_eq!(response.status(), StatusCode::OK);
    let value = body_json(response).await;
    assert!(value.get("current_channel_id").is_some());
    assert!(value.get("playing").is_some());
    assert!(value.get("volume").is_some());
    assert!(value.get("available_channels").unwrap().is_array());
    assert!(value.get("history").unwrap().is_array());
    assert!(value.get("uptime_seconds").unwrap().is_u64());
}

#[tokio::test]
async fn channels_include_builtins_and_plugins() {
    let (app, _) = app().await;
    let response = get(app, "/api/channels").await;
    assert_eq!(response.status(), StatusCode::OK);
    let value = body_json(response).await;
    let channels = value.as_array().unwrap();
    let ids: Vec<&str> = channels
        .iter()
        .filter_map(|channel| channel.get("id").and_then(Value::as_str))
        .collect();
    assert!(ids.contains(&"anime"));
    assert!(ids.contains(&"youtube"));
    assert!(ids.contains(&"tv"));
    let youtube = channels
        .iter()
        .find(|channel| channel.get("id").and_then(Value::as_str) == Some("youtube"))
        .unwrap();
    assert_eq!(youtube.get("type").and_then(Value::as_str), Some("web"));
    assert_eq!(
        youtube.get("partition").and_then(Value::as_str),
        Some("persist:youtube")
    );
}

#[tokio::test]
async fn config_round_trip_and_unknown_key_filtered() {
    let (app, _) = app().await;
    let response = post_json(
        app.clone(),
        "/api/config",
        r#"{"tv_url":"http://test.example"}"#,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let value = body_json(response).await;
    assert_eq!(value["tv_url"], "http://test.example");

    let response = post_json(app.clone(), "/api/config", r#"{"bogus":1}"#).await;
    let value = body_json(response).await;
    assert!(value.get("bogus").is_none());

    let response = get(app, "/api/config").await;
    let value = body_json(response).await;
    assert_eq!(value["tv_url"], "http://test.example");
}

#[tokio::test]
async fn volume_absolute_and_relative() {
    let (app, _) = app().await;
    let response = post_json(app.clone(), "/api/volume?level=42", "").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_json(response).await["volume"], 42);

    let response = post_json(app.clone(), "/api/volume?level=+", "").await;
    assert_eq!(body_json(response).await["volume"], 47);

    let response = post_json(app, "/api/volume", "").await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn open_close_and_next_channel() {
    let (app, manager) = app().await;
    let response = post_json(app.clone(), "/api/channels/youtube/open", "").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(manager.current().await.as_deref(), Some("youtube"));

    let response = post_json(app.clone(), "/api/channels/next", "").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(manager.current().await.as_deref(), Some("anime"));

    let response = post_json(app.clone(), "/api/channels/anime/close", "").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(manager.current().await, None);

    let response = post_json(app, "/api/channels/nope/open", "").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn unknown_route_returns_json_404() {
    let (app, _) = app().await;
    let response = get(app, "/api/nope").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        body_json(response).await,
        serde_json::json!({"detail": "Not Found"})
    );
}

#[tokio::test]
async fn pairing_code_is_single_use_and_external_api_requires_token() {
    let (app, _) = app().await;

    let local_info =
        body_json(get_addr(app.clone(), "/api/pair/info", "127.0.0.1:5000").await).await;
    let code = local_info["code"]
        .as_str()
        .expect("local pair code")
        .to_string();
    assert_eq!(code.len(), 8);

    let external_info =
        body_json(get_addr(app.clone(), "/api/pair/info", "192.168.1.20:5000").await).await;
    assert!(external_info["code"].is_null());
    assert_eq!(external_info["pairing_required"], true);

    let unauthenticated = get_addr(app.clone(), "/api/state", "192.168.1.20:5000").await;
    assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

    let redeemed = post_json(
        app.clone(),
        "/api/pair/redeem",
        &format!(r#"{{"code":"{code}","name":"test-phone"}}"#),
    )
    .await;
    assert_eq!(redeemed.status(), StatusCode::OK);
    let token = body_json(redeemed).await["token"]
        .as_str()
        .expect("device token")
        .to_string();

    let replayed = post_json(
        app.clone(),
        "/api/pair/redeem",
        &format!(r#"{{"code":"{code}"}}"#),
    )
    .await;
    assert_eq!(replayed.status(), StatusCode::UNAUTHORIZED);

    let authenticated = app
        .oneshot(with_client(
            Request::builder()
                .uri("/api/state")
                .header("x-catodo-token", token)
                .body(Body::empty())
                .unwrap(),
            "192.168.1.20:5000",
        ))
        .await
        .unwrap();
    assert_eq!(authenticated.status(), StatusCode::OK);
}

#[tokio::test]
async fn missing_connect_info_is_treated_as_external() {
    let (app, _) = app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/state")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn external_cannot_change_dangerous_config() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;

    for body in [
        r#"{"arcade_default_emulator":"sh -c 'id'"}"#,
        r#"{"arcade_emulators":{"nes":"/bin/sh -c id"}}"#,
        r#"{"anime_dir":"/"}"#,
        r#"{"libraries":[{"id":"evil","path":"/","kind":"series"}]}"#,
        r#"{"paired_devices":[]}"#,
    ] {
        let response = post_json_addr(
            app.clone(),
            "/api/config",
            body,
            "192.168.1.20:5000",
            Some(&token),
        )
        .await;
        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "debió rechazar {body}"
        );
    }

    let allowed = post_json_addr(
        app.clone(),
        "/api/config",
        r#"{"ui_scale":1.1}"#,
        "192.168.1.20:5000",
        Some(&token),
    )
    .await;
    assert_eq!(allowed.status(), StatusCode::OK);

    let local = post_json_addr(
        app,
        "/api/config",
        r#"{"arcade_default_emulator":"retroarch {rom}"}"#,
        "127.0.0.1:5000",
        None,
    )
    .await;
    assert_eq!(local.status(), StatusCode::OK);
}

#[tokio::test]
async fn external_cannot_mutate_libraries() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;

    let denied = post_json_addr(
        app.clone(),
        "/api/libraries",
        r#"{"id":"evil","path":"/","kind":"series"}"#,
        "192.168.1.20:5000",
        Some(&token),
    )
    .await;
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);

    let local = post_json_addr(
        app,
        "/api/libraries",
        r#"{"id":"local-media","path":"/tmp","kind":"series"}"#,
        "127.0.0.1:5000",
        None,
    )
    .await;
    assert_eq!(local.status(), StatusCode::OK);
}

#[tokio::test]
async fn catalog_separates_available_from_installed() {
    let (app, _) = app().await;

    let ids = channel_ids(&app).await;
    assert!(ids.contains(&"youtube".to_string()));
    assert!(!ids.contains(&"netflix".to_string()));

    let catalog = body_json(get(app, "/api/plugins/catalog").await).await;
    let entries = catalog.as_array().unwrap();
    let netflix = entries
        .iter()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some("netflix"))
        .expect("netflix in catalog");
    assert_eq!(netflix["installed"], false);
    assert_eq!(netflix["bundled"], false);
    assert_eq!(netflix["drm"], true);
    assert_eq!(netflix["url"], "https://www.netflix.com");

    let youtube = entries
        .iter()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some("youtube"))
        .expect("youtube in catalog");
    assert_eq!(youtube["installed"], true);
    assert_eq!(youtube["bundled"], true);
    assert_eq!(youtube["enabled"], true);
}

#[tokio::test]
async fn install_registers_uninstalls_and_orders_channels() {
    let (app, manager) = app().await;

    let response = post_json(app.clone(), "/api/plugins/install", r#"{"id":"netflix"}"#).await;
    assert_eq!(response.status(), StatusCode::OK);
    let installed = body_json(response).await;
    assert_eq!(installed["id"], "netflix");
    assert_eq!(installed["enabled"], true);
    assert_eq!(installed["drm"], true);

    let ids = channel_ids(&app).await;
    assert!(ids.contains(&"netflix".to_string()));
    assert!(manager.get("netflix").await.is_some());

    let config = body_json(get(app.clone(), "/api/config").await).await;
    assert_eq!(config["channel_netflix_url"], "https://www.netflix.com");

    let response = post_json(
        app.clone(),
        "/api/config",
        r#"{"channel_netflix_url":"https://example.com/regional"}"#,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let state = body_json(get(app.clone(), "/api/channels/netflix/state").await).await;
    assert_eq!(state["configured_url"], "https://example.com/regional");

    let response = post_json(
        app.clone(),
        "/api/config",
        r#"{"channel_netflix_url":"javascript:alert(1)"}"#,
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let config = body_json(get(app.clone(), "/api/config").await).await;
    assert_eq!(
        config["channel_netflix_url"],
        "https://example.com/regional"
    );

    let response = post_json(app.clone(), "/api/plugins/install", r#"{"id":"pluto"}"#).await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = post_json(app.clone(), "/api/plugins/pluto/order", r#"{"order":1}"#).await;
    assert_eq!(response.status(), StatusCode::OK);
    let ids = channel_ids(&app).await;
    assert!(position(&ids, "pluto") < position(&ids, "netflix"));

    let response = post_json(app.clone(), "/api/plugins/pluto/order", r#"{"order":null}"#).await;
    assert_eq!(response.status(), StatusCode::OK);
    let ids = channel_ids(&app).await;
    assert!(position(&ids, "netflix") < position(&ids, "pluto"));

    let response = post_json(app.clone(), "/api/channels/netflix/open", "").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(manager.current().await.as_deref(), Some("netflix"));
    let response = delete(app.clone(), "/api/plugins/netflix").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(manager.current().await, None);
    assert!(!channel_ids(&app).await.contains(&"netflix".to_string()));

    let response = delete(app.clone(), "/api/plugins/youtube").await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let response = delete(app, "/api/plugins/nope").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn channel_url_config_is_local_only_and_validated() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;
    let response = post_json(app.clone(), "/api/plugins/install", r#"{"id":"netflix"}"#).await;
    assert_eq!(response.status(), StatusCode::OK);

    let response = post_json_addr(
        app.clone(),
        "/api/config",
        r#"{"channel_netflix_url":"https://evil.example"}"#,
        "192.168.1.20:5000",
        Some(&token),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = post_json(
        app.clone(),
        "/api/config",
        r#"{"channel_Upper_url":"https://example.com"}"#,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let config = body_json(response).await;
    assert!(config.get("channel_Upper_url").is_none());
    assert_eq!(config["channel_netflix_url"], "https://www.netflix.com");
}

#[tokio::test]
async fn upload_and_serve_custom_arcade_frame() {
    let (app, _) = app().await;
    let png = include_bytes!("fixtures/tiny.png");
    let request = Request::builder()
        .method("POST")
        .uri("/api/arcade/frame")
        .header("content-type", "image/png")
        .body(Body::from(png.to_vec()))
        .unwrap();
    let response = app
        .clone()
        .oneshot(with_client(request, "127.0.0.1:5000"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let value = body_json(response).await;
    assert_eq!(value["mode"], "image");
    assert!(value["url"]
        .as_str()
        .unwrap()
        .starts_with("/api/arcade/frame"));

    let response = get(app.clone(), "/api/arcade/frame").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "image/png");
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..], png);

    let config = body_json(get(app.clone(), "/api/config").await).await;
    assert_eq!(config["arcade_monitor_mode"], "image");
    assert!(config["arcade_monitor_image"]
        .as_str()
        .unwrap()
        .starts_with("/api/arcade/frame"));

    let response = delete(app.clone(), "/api/arcade/frame").await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = get(app.clone(), "/api/arcade/frame").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let config = body_json(get(app, "/api/config").await).await;
    assert_eq!(config["arcade_monitor_mode"], "css");
}

#[tokio::test]
async fn external_cannot_upload_arcade_frame() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;
    let png = include_bytes!("fixtures/tiny.png");
    let request = Request::builder()
        .method("POST")
        .uri("/api/arcade/frame")
        .header("content-type", "image/png")
        .header("x-catodo-token", token)
        .body(Body::from(png.to_vec()))
        .unwrap();
    let response = app
        .oneshot(with_client(request, "192.168.1.20:5000"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn plugin_install_rejects_path_traversal_id() {
    let (app, _) = app().await;
    let response = post_json(app, "/api/plugins/install", r#"{"id":"../evil"}"#).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn local_can_list_and_revoke_paired_devices() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;

    let response = get(app.clone(), "/api/pair/devices").await;
    assert_eq!(response.status(), StatusCode::OK);
    let devices = body_json(response).await;
    let devices = devices["devices"].as_array().expect("devices array");
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0]["name"], "test-remote");
    assert!(devices[0].get("token").is_none());
    let id = devices[0]["id"].as_str().expect("device id").to_string();

    let response = delete(app.clone(), &format!("/api/pair/devices/{id}")).await;
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .oneshot(with_client(
            Request::builder()
                .uri("/api/state")
                .header("x-catodo-token", token)
                .body(Body::empty())
                .unwrap(),
            "192.168.1.20:5000",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn paired_device_has_expiration() {
    let (app, _) = app().await;
    let _token = pair_token(&app).await;

    let devices = body_json(get(app, "/api/pair/devices").await).await;
    let device = &devices["devices"][0];
    let created = device["created"].as_u64().expect("created");
    let expires = device["expires"].as_u64().expect("expires");
    assert!(expires > created);
}

#[tokio::test]
async fn zero_ttl_disables_expiration() {
    let (app, _) = app().await;
    let response = post_json(app.clone(), "/api/config", r#"{"pair_token_ttl_days":0}"#).await;
    assert_eq!(response.status(), StatusCode::OK);

    let _token = pair_token(&app).await;
    let devices = body_json(get(app, "/api/pair/devices").await).await;
    assert!(devices["devices"][0]["expires"].is_null());
}

#[tokio::test]
async fn expired_device_token_is_rejected() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;

    let body = format!(
        r#"{{"paired_devices":[{{"token":"{token}","name":"expired","created":1,"expires":1}}]}}"#
    );
    let response = post_json(app.clone(), "/api/config", &body).await;
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .oneshot(with_client(
            Request::builder()
                .uri("/api/state")
                .header("x-catodo-token", token)
                .body(Body::empty())
                .unwrap(),
            "192.168.1.20:5000",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn external_cannot_list_or_revoke_devices() {
    let (app, _) = app().await;
    let token = pair_token(&app).await;

    let response = app
        .clone()
        .oneshot(with_client(
            Request::builder()
                .uri("/api/pair/devices")
                .header("x-catodo-token", &token)
                .body(Body::empty())
                .unwrap(),
            "192.168.1.20:5000",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = app
        .oneshot(with_client(
            Request::builder()
                .method("DELETE")
                .uri("/api/pair/devices/whatever")
                .header("x-catodo-token", token)
                .body(Body::empty())
                .unwrap(),
            "192.168.1.20:5000",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
