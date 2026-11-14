# remote-control Specification

## Purpose
Defines the phone-friendly remote control served by the backend at `/remote`: what it can control and how it stays in sync with the TV.
## Requirements
### Requirement: Served remote client

The backend SHALL serve a self-contained remote-control page at `/remote` (static assets, no build step, no external CDN dependencies).

#### Scenario: Open from a phone

- **WHEN** a device on the network opens `http://<host>:8765/remote`
- **THEN** a usable remote UI loads without installing anything.

### Requirement: Single-use pairing

The remote SHALL pair using a short-lived, single-use code that is exchanged for a device token. The code SHALL become invalid after one successful redemption or when it expires. Requests from outside loopback to `/api/*` and the WebSockets SHALL require a valid device token (or the `CATODO_TOKEN` master token), except `/api/health`, `/api/pair/info` and `/api/pair/redeem`. `/api/pair/info` SHALL NOT expose the pairing code or any token to non-loopback clients. The kiosk on loopback SHALL remain token-free.

#### Scenario: Pair a phone

- **WHEN** the user scans the QR or types the code shown on the TV
- **THEN** the remote exchanges it once for a device token and uses that token for API and WebSocket calls

#### Scenario: Code replay

- **WHEN** the same pairing code is redeemed a second time
- **THEN** the backend rejects it with 401 and does not issue another token

#### Scenario: Unauthenticated LAN request

- **WHEN** a client outside loopback calls `/api/state` or a WebSocket without a valid token
- **THEN** the backend responds 401 and does not execute the request

#### Scenario: Kiosk on loopback

- **WHEN** the Electron kiosk calls the local API from 127.0.0.1 without a token
- **THEN** the request is allowed

### Requirement: Limited administration

A paired remote SHALL control playback, channels, volume, theme, layout, UI scale and idle timers, but SHALL NOT change local-only administration: filesystem paths, arcade emulator commands, libraries, tunnel/MQTT credentials, channel URLs or pairing state. Those requests SHALL return 403 even with a valid device token.

#### Scenario: Remote tries to change an emulator

- **WHEN** the remote posts `arcade_default_emulator` to `/api/config`
- **THEN** the backend responds 403 and the TV keeps its previous configuration

#### Scenario: Remote adds a library

- **WHEN** the remote posts to `/api/libraries`
- **THEN** the backend responds 403

#### Scenario: Remote changes the theme

- **WHEN** the remote posts `theme` to `/api/config`
- **THEN** the backend accepts it and the TV updates

### Requirement: Channel control

The remote SHALL list available channels, show the current one, and switch channels on tap (via the existing open endpoint).

#### Scenario: Tap switches TV

- **WHEN** the user taps a channel in the remote
- **THEN** the TV switches to that channel and the remote highlights it as current.

### Requirement: Transport and volume control

The remote SHALL provide play/pause (toggle), next, previous for the current media channel, and a volume control mapped to the global volume endpoint (0–100), plus a mute shortcut that restores the previous level.

#### Scenario: Volume drag

- **WHEN** the user drags the volume slider to 30
- **THEN** the TV's output volume becomes 30 and the HUD-level state reflects it.

### Requirement: Live sync

The remote SHALL subscribe to `/api/ws` and reflect channel, playback, volume, and now-playing changes within a second, including changes made on the TV itself.

#### Scenario: Two-way reflection

- **WHEN** someone pauses Spotify on the TV
- **THEN** the remote shows the paused state without manual refresh.

### Requirement: Now playing display

When the current media channel reports track metadata, the remote SHALL show title, artist, and artwork.

#### Scenario: Track visible

- **WHEN** Spotify is playing and the remote is open
- **THEN** the current track's title, artist, and art are visible.

### Requirement: Failure feedback

Unreachable-backend and command-failure states SHALL be visible (connection banner, command error toast) rather than silently stale.

#### Scenario: Backend down

- **WHEN** the backend stops while the remote is open
- **THEN** a disconnected indicator appears and controls are disabled until reconnect.

### Requirement: Remote adopts active theme

The remote SHALL fetch the resolved active theme and personalization overrides from `/api/config` on load and apply the color palette and corner radius as CSS variables on its own `:root`, replacing its fixed palette. A `config_changed` event for `theme`, `themes`, or `theme_overrides` SHALL re-apply the appearance without a reload.

#### Scenario: Remote matches TV

- **WHEN** the remote is opened while a non-default theme is active
- **THEN** the remote renders with that theme's palette and radius.

#### Scenario: Live theme update

- **WHEN** the theme is changed on the TV while the remote is open
- **THEN** the remote re-renders with the new palette within a second.

#### Scenario: Config unreachable at load

- **WHEN** the remote cannot fetch the config
- **THEN** it falls back to the built-in default theme and keeps working.

