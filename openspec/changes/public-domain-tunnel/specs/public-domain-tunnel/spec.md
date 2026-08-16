## Purpose

Lets a Cátodo installation expose its backend through a public HTTPS URL backed by a user-owned domain and a pluggable tunnel provider, replacing LAN-only access and self-signed certificates with a stable, phone-friendly URL that works from any network — without coupling the system to any specific provider.

## ADDED Requirements

### Requirement: Pluggable tunnel provider

The system SHALL expose a `TunnelProvider` interface used by every other component (manager, API, events), so that adding, removing or swapping providers does not change external behavior. The interface MUST define at least: `name` (stable identifier), `start()`, `stop()`, `is_running()`, `health()` and `validate_config()`.

#### Scenario: Interface is the only coupling
- **WHEN** the manager, the HTTP API and the event broker interact with the tunnel
- **THEN** they depend on `TunnelProvider` and never on a concrete provider class

#### Scenario: Unknown provider reported
- **WHEN** `tunnel_provider` is set to a value no provider implements
- **THEN** `get_provider(name)` returns `None`, `GET /api/tunnel/providers` does not list it and `POST /api/tunnel/start` returns `400` with `{"detail": "unknown provider"}`

#### Scenario: Multiple providers can coexist
- **WHEN** two providers are registered (e.g. `cloudflare` and a future `tailscale-funnel`)
- **THEN** they appear independently in `GET /api/tunnel/providers` and the user can switch by setting `tunnel_provider`; only one runs at a time

### Requirement: Tunnel lifecycle control

The system SHALL manage the active tunnel through the `TunnelProvider` as a child process of the backend, accepting start, stop and status commands through an HTTP API and reporting state changes through the existing event broker.

#### Scenario: Start tunnel
- **WHEN** `POST /api/tunnel/start` is called and the active provider's `validate_config()` returns no errors
- **THEN** the manager calls `provider.start()`, records the resulting PID and state, and returns `{"state": "starting", "provider": "<name>"}`

#### Scenario: Start tunnel with invalid config
- **WHEN** `POST /api/tunnel/start` is called and `validate_config()` reports a missing binary, unreadable token file, missing `public_domain`, or any other precondition
- **THEN** the API responds `409` with `{"detail": "<provider-specific message>"}` and no process is started

#### Scenario: Start tunnel twice
- **WHEN** `POST /api/tunnel/start` is called while a tunnel is already running
- **THEN** the API responds `409` with `{"detail": "already running", "pid": <n>, "provider": "<name>"}`

#### Scenario: Stop tunnel
- **WHEN** `POST /api/tunnel/stop` is called while a tunnel is running
- **THEN** the manager calls `provider.stop()` (which performs the provider-defined graceful shutdown, e.g. SIGTERM→SIGKILL with timeout) and returns `{"state": "stopped"}`

#### Scenario: Stop when idle
- **WHEN** `POST /api/tunnel/stop` is called and no tunnel is running
- **THEN** the API responds `200` with `{"state": "stopped"}` and no error

#### Scenario: Status reflects process state
- **WHEN** `GET /api/tunnel/status` is called
- **THEN** the response includes `state` (`stopped | starting | running | failed`), `provider` (current provider name), `pid` when running, `started_at` when running and `last_error` when failed

#### Scenario: Tunnel dies unexpectedly
- **WHEN** the provider's child exits non-zero while the backend is up
- **THEN** the manager records `last_error`, publishes `tunnel_state` with `state: "failed"` and exposes the state on `/api/tunnel/status`

#### Scenario: Backend shutdown stops child
- **WHEN** the FastAPI lifespan ends and the tunnel is running
- **THEN** the manager calls `provider.stop()` before the lifespan closes, so systemd does not see a leaked process

#### Scenario: Provider switch stops current
- **WHEN** `tunnel_provider` is changed while a tunnel is running
- **THEN** on the next lifecycle event (config change, manual stop, restart) the manager stops the previous provider before starting the new one

### Requirement: Tunnel health probe

The system SHALL ask the active provider for health through its `health()` method, surface reachability and latency through the API, and publish state transitions when health degrades.

#### Scenario: Probe success
- **WHEN** the tunnel is `running` and `provider.health()` returns `{"reachable": true, "latency_ms": <n>}`
- **THEN** `GET /api/tunnel/health` returns the same payload plus `last_ok` (ISO 8601 of last successful probe)

#### Scenario: Probe failure
- **WHEN** `provider.health()` returns `{"reachable": false, "last_error": "..."}`
- **THEN** `GET /api/tunnel/health` returns the payload plus `last_ok` (or `null`) and the manager publishes `tunnel_state` with `state: "degraded"`

#### Scenario: Probe disabled when stopped
- **WHEN** the tunnel state is not `running`
- **THEN** no probe is issued and `/api/tunnel/health` returns `{"reachable": false, "reason": "stopped"}`

### Requirement: List available providers

The system SHALL expose the set of registered providers and whether each one is configured (its `validate_config()` passes).

#### Scenario: List providers
- **WHEN** `GET /api/tunnel/providers` is called
- **THEN** the response is a list of `{"name": "<id>", "configured": true|false, "reason": "<optional missing-config message>"}` for every registered provider

### Requirement: Tunnel events

The system SHALL publish `tunnel_state` events on the existing event broker whenever the tunnel state transitions, with the new state, the provider name and a human-readable message.

#### Scenario: Event on start
- **WHEN** the tunnel transitions from `stopped` to `running`
- **THEN** the broker publishes `{"event": "tunnel_state", "state": "running", "provider": "<name>", "message": "Tunnel up"}` to all WebSocket subscribers

#### Scenario: Event on failure
- **WHEN** the tunnel transitions from `running` to `failed`
- **THEN** the broker publishes `{"event": "tunnel_state", "state": "failed", "provider": "<name>", "message": "<stderr tail>"}`

### Requirement: Tunnel-related runtime config keys

The runtime config SHALL support the keys `public_domain` (string, default empty), `tunnel_enabled` (bool, default false), `tunnel_provider` (string, default `cloudflare`), `tunnel_token_path` (string, default empty) and `tunnel_require_token` (bool, default true) with the same persistence, atomic write, serialization and `config_changed` semantics as existing keys.

#### Scenario: Default when unset
- **WHEN** none of the five keys is stored
- **THEN** reads return `""`, `false`, `"cloudflare"`, `""`, `true` respectively

#### Scenario: POST /api/config with tunnel keys
- **WHEN** `POST /api/config` includes `{"public_domain": "catodo.example.com", "tunnel_enabled": true, "tunnel_provider": "cloudflare", "tunnel_token_path": "/home/me/.cloudflared/abc.json"}`
- **THEN** the keys are persisted, `public_domain` is normalized (lowercase, no scheme, no trailing slash, no path) and the response reflects the effective values

#### Scenario: Invalid public_domain rejected
- **WHEN** `public_domain` does not look like a hostname (contains spaces, scheme, or path)
- **THEN** the POST returns `400` with `{"detail": "invalid public_domain"}` and no write is performed

#### Scenario: Unknown tunnel_provider rejected
- **WHEN** `tunnel_provider` does not match any registered provider
- **THEN** the POST returns `400` with `{"detail": "unknown provider"}` and no write is performed

#### Scenario: Config change event
- **WHEN** `tunnel_enabled` flips to true
- **THEN** the broker publishes `config_changed` with `{"key": "tunnel_enabled", "value": true}`

### Requirement: Token enforcement when tunnel is public

The system SHALL require a token for `/api/*` (except `/api/health`, `/api/pair/info`, `/api/tunnel/status` and `/api/tunnel/providers`) whenever `tunnel_enabled` is true and `tunnel_require_token` is true, even when the `CATODO_TOKEN` environment variable is empty. If `tunnel_enabled` is false, behavior matches today's env-var-driven middleware.

#### Scenario: Missing token when public
- **WHEN** `tunnel_enabled` is true, `tunnel_require_token` is true and a request to `/api/state` arrives without `X-Catodo-Token` header or `token` query parameter
- **THEN** the backend responds `401` with `{"detail": "unauthorized"}`

#### Scenario: Correct token accepted
- **WHEN** the request includes a token matching the configured `CATODO_TOKEN`
- **THEN** the request is processed normally

#### Scenario: Tunnel disabled keeps current behavior
- **WHEN** `tunnel_enabled` is false and `CATODO_TOKEN` is unset
- **THEN** `/api/*` requests are accepted without a token (current behavior preserved)

#### Scenario: Public exemption paths
- **WHEN** a request hits `/api/health`, `/api/pair/info`, `/api/tunnel/status` or `/api/tunnel/providers` while the tunnel is public
- **THEN** no token is required (these endpoints are needed for liveness and for the remote PWA bootstrap before the user has logged in)
