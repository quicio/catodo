## ADDED Requirements

### Requirement: LAN binding opt-in

The server SHALL bind `127.0.0.1` unless explicitly configured otherwise (`CATODO_HOST` or the runtime `host` key, applied on restart). Binding beyond loopback SHALL be logged as a warning at startup.

#### Scenario: Default is loopback

- **WHEN** the backend starts with no host configuration
- **THEN** it listens on 127.0.0.1 only.

#### Scenario: Explicit LAN bind

- **WHEN** `CATODO_HOST=0.0.0.0` is set
- **THEN** the server binds all interfaces and logs a warning that the API is network-exposed.

### Requirement: Optional shared access token

When an access token is configured (`CATODO_TOKEN` env or `token` runtime key), all `/api/*` requests SHALL require it via `X-Catodo-Token` header or `?token=` query parameter (the latter needed for WebSocket clients), returning 401 otherwise. When no token is configured, the API stays open. Static assets and `/remote` itself remain reachable so the page can prompt for the token.

#### Scenario: Rejected without token

- **WHEN** a token is configured and `GET /api/state` arrives without it
- **THEN** the response is 401.

#### Scenario: Accepted with token

- **WHEN** the request carries the configured token
- **THEN** the API responds normally.

### Requirement: Scoped CORS on LAN

When binding beyond loopback, CORS allowed origins SHALL be limited to the configured host(s) instead of `*`.

#### Scenario: No wildcard on LAN

- **WHEN** the server binds `0.0.0.0`
- **THEN** responses do not include `Access-Control-Allow-Origin: *`.
