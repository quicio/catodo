## Purpose

Defines the domain event catalog pushed over the WebSocket, the publish guarantees, and the initial snapshot contract that lets clients render correctly without polling.

## ADDED Requirements

### Requirement: Event catalog

The broker SHALL carry these domain events, each a JSON object with an `event` key: `channel_changed`, `channel_closed`, `volume_changed`, `playing_changed`, `track_changed` (channel id + track metadata), `playback_status_changed` (channel id, status, position), `episode_changed` (channel id + episode), `wallpapers_changed` (total), `config_changed` (key, value).

#### Scenario: Event shape

- **WHEN** any domain event is published
- **THEN** every connected WebSocket client receives a JSON object containing at least `event` and the event's payload keys.

### Requirement: Snapshot on connect

A new WebSocket connection SHALL receive one `state_snapshot` event containing the full global state (current channel, playing, volume, channels with capabilities, plus current per-channel states) before any subsequent live event.

#### Scenario: Fresh client renders instantly

- **WHEN** a client connects to `/api/ws`
- **THEN** its first message is a `state_snapshot` sufficient to render the UI without any REST call.

### Requirement: Single backend watcher

External state that cannot push (Spotify via MPRIS) SHALL be observed by exactly one backend-side watch loop whose observations are published as domain events on change; per-request polling SHALL NOT be the source of truth for connected clients.

#### Scenario: One watcher regardless of clients

- **WHEN** zero, one, or five WebSocket clients are connected
- **THEN** at most one MPRIS watch loop runs in the backend.

#### Scenario: Change detection

- **WHEN** the watched track or playback status changes
- **THEN** the corresponding event is published within one watch interval (≤ 1s).

### Requirement: Last-write-wins authority

Server-published events are authoritative; clients SHALL reconcile optimistic local previews to the latest event.

#### Scenario: Optimistic switch corrected

- **WHEN** a client predicts a channel switch that fails server-side
- **THEN** the next authoritative event (or absence of change plus error response) restores the client to the real current channel.

### Requirement: Quiet idle

With no domain activity, the broker SHALL NOT publish keep-alive domain events; WebSocket protocol pings suffice.

#### Scenario: Idle silence

- **WHEN** nothing changes for a minute
- **THEN** no domain event is emitted in that window.
