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
    for channel in
        build_default_channels(&config, &catodo_platform::plugins_repo(), &dir, &broker).await
    {
        manager.register(channel).await.unwrap();
    }
    manager.reorder().await;
    let state = ServerState::new("0.2.0", config, broker, manager.clone());
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
