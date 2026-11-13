# remote-control Specification

## Purpose
Defines the phone-friendly remote control served by the backend at `/remote`: what it can control and how it stays in sync with the TV.
## Requirements
### Requirement: Served remote client

The backend SHALL serve a self-contained remote-control page at `/remote` (static assets, no build step, no external CDN dependencies).

#### Scenario: Open from a phone

- **WHEN** a device on the network opens `http://<host>:8765/remote`
- **THEN** a usable remote UI loads without installing anything.

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

