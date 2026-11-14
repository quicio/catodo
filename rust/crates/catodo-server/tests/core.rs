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
        .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn post_json(router: axum::Router, uri: &str, body: &str) -> axum::response::Response {
    router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
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
async fn unknown_route_is_fastapi_shaped() {
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
