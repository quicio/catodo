# Backend API

## ADDED Requirements

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
