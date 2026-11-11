use axum::body::Body;
use axum::http::{Request, StatusCode};
use catodo_server::config::RuntimeConfig;
use catodo_server::events::EventBroker;
use catodo_server::manager::ChannelManager;
use catodo_server::{router, ServerState};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;

async fn app() -> axum::Router {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("catodo-rs-contract-{unique}"));
    let config = RuntimeConfig::new(dir.clone());
    let broker = EventBroker::new();
    let manager = Arc::new(ChannelManager::new(broker.clone(), dir));
    manager.init().await;
    router(ServerState::new("0.2.0", config, broker, manager))
}

async fn body_string(response: axum::response::Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

#[tokio::test]
async fn health_matches_contract_fixture() {
    let response = app()
        .await
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "application/json");
    assert_eq!(
        body_string(response).await,
        include_str!("../../../contract/health.json").trim()
    );
}

#[tokio::test]
async fn version_matches_contract_fixture() {
    let response = app()
        .await
        .oneshot(
            Request::builder()
                .uri("/api/version")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "application/json");
    assert_eq!(
        body_string(response).await,
        include_str!("../../../contract/version.json").trim()
    );
}

#[tokio::test]
async fn unknown_route_returns_fastapi_shaped_404() {
    let response = app()
        .await
        .oneshot(
            Request::builder()
                .uri("/api/nope")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(body_string(response).await, r#"{"detail":"Not Found"}"#);
}
