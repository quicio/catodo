# backend-api Specification

## Purpose
TBD - created by archiving change initial-mvp. Update Purpose after archive.
## Requirements
### Requirement: HTTP server

The system SHALL run a FastAPI HTTP server on `127.0.0.1:8765`.

#### Scenario: Health endpoint

- **WHEN** `GET /api/health` is called
- **THEN** the server SHALL respond with `200 OK` and JSON `{"status": "ok"}` within 100ms.

### Requirement: Channel listing endpoint

The system SHALL expose `GET /api/channels` returning the registered channels.

#### Scenario: Channel list response

- **WHEN** `GET /api/channels` is called
- **THEN** the response SHALL be a JSON array of `{id, name, type, icon}`.

### Requirement: Channel focus endpoint

The system SHALL expose `POST /api/channels/{id}/open` to switch to a channel.

#### Scenario: Valid channel

- **WHEN** `POST /api/channels/spotify/open` is called and `spotify` is registered
- **THEN** the channel switches and a `channel_changed` event is emitted.

#### Scenario: Invalid channel

- **WHEN** `POST /api/channels/foo/open` is called and `foo` is not registered
- **THEN** the server responds with `404 Not Found`.

### Requirement: Channel navigation endpoint

The system SHALL expose `POST /api/channels/next` and `POST /api/channels/previous`.

#### Scenario: Next channel

- **WHEN** `POST /api/channels/next` is called
- **THEN** the system moves to the next channel.

### Requirement: Channel command endpoint

The system SHALL expose `POST /api/channels/{id}/command` to send typed commands (play/pause/next/prev/volume).

#### Scenario: Play command

- **WHEN** `POST /api/channels/spotify/command` is called with body `{"command": "play"}`
- **THEN** Spotify starts playing.

### Requirement: Volume endpoint

The system SHALL expose `POST /api/volume` with `?level=N` (0..100) or `+`/`-` to adjust.

#### Scenario: Set volume

- **WHEN** `POST /api/volume?level=80` is called
- **THEN** the system volume is set to 80%.

### Requirement: WebSocket events

The system SHALL expose `WS /api/ws` emitting events.

#### Scenario: Channel changed event

- **WHEN** a channel switch occurs
- **THEN** the WebSocket emits `{"event": "channel_changed", "channel_id": "..."}` to all connected clients.

#### Scenario: Volume changed event

- **WHEN** volume is changed
- **THEN** the WebSocket emits `{"event": "volume_changed", "volume": N}`.

### Requirement: System state endpoint

The system SHALL expose `GET /api/state` returning the global state.

#### Scenario: State response

- **WHEN** `GET /api/state` is called
- **THEN** the response SHALL include `current_channel_id`, `playing`, `volume`, `uptime_seconds`.

### Requirement: Channel close endpoint

The system SHALL expose `POST /api/channels/{id}/close` which closes the channel and emits a `channel_closed` event. Closing the current channel SHALL leave the system with no current channel.

#### Scenario: Close current channel

- **WHEN** the current channel is closed via the API
- **THEN** global state reports `current_channel_id: null`.

#### Scenario: Unknown channel

- **WHEN** close is called for an unregistered id
- **THEN** the response is 404.

### Requirement: Per-channel state endpoint

The system SHALL expose `GET /api/channels/{id}/state` returning the channel-specific state object, or 404 for unknown ids.

#### Scenario: Spotify state shape

- **WHEN** `GET /api/channels/spotify/state` is called
- **THEN** the response contains at least `id` and `available`.

### Requirement: Channel capability endpoints

The system SHALL expose `GET /api/channels/{id}/episodes` and `GET /api/channels/{id}/history`. Channels without those capabilities SHALL return empty collections rather than an error.

#### Scenario: Channel without episodes

- **WHEN** episodes are requested for a channel with no episode support
- **THEN** the response is `{"id": <id>, "episodes": []}` with status 200.

### Requirement: Channel stream endpoint

The system SHALL expose `GET /api/channels/{id}/stream` for channels with a current streamable item, returning the underlying file. Channels without streaming support, or with no current item, SHALL return 404.

#### Scenario: No stream support

- **WHEN** a stream is requested for a channel without streaming
- **THEN** the response is 404 with detail "channel has no stream".

### Requirement: Volume endpoint parsing

`POST /api/volume?level=...` SHALL accept an integer 0–100 or the relative tokens `+`/`-` (±5 steps). The `+` token SHALL be parsed from the raw query string so it is not decoded as a space. Missing or invalid levels SHALL return 400.

#### Scenario: Relative plus

- **WHEN** `POST /api/volume?level=+` is called at volume 50
- **THEN** the response reports volume 55.

#### Scenario: Missing level

- **WHEN** the level parameter is absent
- **THEN** the response is 400.

### Requirement: Config endpoints

The system SHALL expose `GET /api/config` (full effective config) and `POST /api/config` (persist supported keys only) as specified in the runtime-config capability.

#### Scenario: Round trip

- **WHEN** a supported key is POSTed and then GET is called
- **THEN** the GET response includes the new value.

### Requirement: Global state shape

`GET /api/state` SHALL return `current_channel_id`, `playing`, `volume`, `available_channels`, `history` (last channel ids, capped at 16), and `uptime_seconds`.

#### Scenario: Uptime increases

- **WHEN** state is requested twice with a delay
- **THEN** the second `uptime_seconds` is greater than or equal to the first.

### Requirement: Graceful WebSocket shutdown

On server shutdown the system SHALL terminate every WebSocket subscriber loop, including subscribers whose event queue is full. No generator task SHALL be left awaiting a queue that will never be fed.

#### Scenario: Shutdown with idle client

- **WHEN** the server shuts down while a WebSocket client is connected
- **THEN** the client's connection closes and the server task finishes within the shutdown timeout.

#### Scenario: Shutdown with saturated client

- **WHEN** the server shuts down while a subscriber's queue is at capacity
- **THEN** the subscriber is still terminated (its queue may be drained/dropped) rather than hanging forever.

### Requirement: No synthetic domain events

Internal broker control messages SHALL NOT be delivered to WebSocket clients as if they were domain events.

#### Scenario: Client never sees control frames

- **WHEN** a client is connected during shutdown
- **THEN** it never receives a parseable domain event that was not published by the domain (e.g. no `{"event": "_closed"}`).

### Requirement: Event-loop responsiveness

API handlers SHALL NOT perform blocking I/O on the event loop thread; filesystem walks and external HTTP are offloaded or awaited asynchronously.

#### Scenario: Health under load

- **WHEN** a library scan and wallpaper downloads are in progress
- **THEN** `GET /api/health` still responds within 100ms.

### Requirement: Range support on stream endpoint

`GET /api/channels/{id}/stream` SHALL support single-range `Range` requests (`206`, `Content-Range`, `Accept-Ranges: bytes`) and return `416` for unsatisfiable ranges.

#### Scenario: Partial content

- **WHEN** the request carries `Range: bytes=0-999`
- **THEN** the response is 206 with exactly 1000 bytes and a matching `Content-Range` header.

### Requirement: WebSocket initial snapshot

`WS /api/ws` SHALL send a `state_snapshot` event as the first message on every connection, containing the global state plus the current state of each registered channel.

#### Scenario: Snapshot precedes events

- **WHEN** a client connects while events are being published
- **THEN** the client receives the complete `state_snapshot` before any live event on that connection.

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

