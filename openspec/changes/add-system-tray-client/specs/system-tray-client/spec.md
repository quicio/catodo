## Purpose

Multi-OS system tray application (macOS menu bar, Windows system tray, Linux status notifier) that pairs with the Cátodo backend, stays in sync via WebSocket, and exposes quick actions (mode presets, play/pause, volume) and a deep link to the full remote control.

## ADDED Requirements

### Requirement: Native tray icon across platforms

The system SHALL provide a tray client that registers a persistent icon on macOS (menu bar), Windows (system tray) and Linux (status notifier item), using a platform-native API per OS.

#### Scenario: First launch shows the icon

- **WHEN** the user installs and launches the tray client for the first time
- **THEN** an icon appears in the system tray / menu bar with a single left-click menu.

#### Scenario: Quit closes the icon cleanly

- **WHEN** the user picks "Quit" from the menu (or the platform-native close shortcut)
- **THEN** the icon disappears from the tray and no background process remains.

### Requirement: Pairing via existing flow

The tray client SHALL obtain credentials by reusing the backend's existing token-based auth (`CATODO_TOKEN` env or `token` runtime key): it SHALL fetch `GET /api/pair/info` to discover the backend host/port and the configured code, let the user enter or scan that code, and SHALL persist the resulting token locally so it survives restarts.

#### Scenario: First-run pairing with token configured

- **WHEN** the client launches with no stored credentials and the backend has `CATODO_TOKEN` (or runtime `token`) configured
- **THEN** it opens a pairing window showing the backend URL, the QR (from `GET /api/pair/qr`), and a text field to enter the code; once the user submits a code that the backend accepts, the client proceeds to connect.

#### Scenario: First-run pairing without token

- **WHEN** the client launches with no stored credentials and the backend has no token configured
- **THEN** it skips the pairing UI entirely and connects directly (the API stays open in this mode).

#### Scenario: Subsequent launches

- **WHEN** the client launches with valid stored credentials
- **THEN** no pairing UI is shown and the client proceeds to connect to the backend.

#### Scenario: Invalid or revoked token

- **WHEN** the stored token is rejected by the backend (401/403 on any API call)
- **THEN** the client discards the stored token and returns to the pairing window.

### Requirement: Live state over WebSocket

The tray client SHALL maintain a persistent WebSocket connection to `/api/ws` and SHALL reflect `config_changed`, `channel_changed`, `playback_status_changed`, `volume_changed`, and `track_changed` events in its menu within one second of emission.

#### Scenario: Spotify pause from the TV

- **WHEN** a user pauses Spotify on the TV
- **THEN** the tray menu's "Pause" item becomes "Play" within one second without manual refresh.

#### Scenario: Backend unreachable

- **WHEN** the WebSocket connection drops or the backend is unreachable
- **THEN** the menu shows a "Disconnected" indicator and command items are disabled until reconnect succeeds.

### Requirement: Quick actions

The tray menu SHALL expose, at minimum: an item that toggles play/pause of the current channel, a volume up / volume down pair, and a submenu of user-defined mode presets that applies a preset on click.

#### Scenario: Toggle play/pause

- **WHEN** the user clicks the play/pause item while a media channel is playing
- **THEN** the backend receives the equivalent of `POST /api/channels/<id>/command` with `{command: "toggle"}` and playback state changes.

#### Scenario: Apply a mode preset

- **WHEN** the user clicks a preset entry in the modes submenu
- **THEN** the backend applies the preset atomically and the kiosko reflects the new theme, layout, ui_scale and favorite channels without reload.

### Requirement: Deep link to full remote

The tray menu SHALL include an "Open remote control" item that opens the backend's existing `/remote` page in the user's default browser.

#### Scenario: Open the full remote

- **WHEN** the user clicks "Open remote control"
- **THEN** the default browser opens `http://<backend-host>:<backend-port>/remote` (or `https://` if the backend is configured for TLS).

### Requirement: Multi-OS distribution

The project SHALL provide build scripts that produce native installers for macOS (`.app` / `.dmg`), Windows (`.msi` / `.exe`) and Linux (`.deb` / `.AppImage`) without code forks per platform.

#### Scenario: Build on each host

- **WHEN** a developer runs the platform-specific build command on a given host OS
- **THEN** a native installer for that host is produced; cross-compilation to other OSes is not required.

## REMOVED Requirements

### Requirement: Native notifications (OS-level toasts)

**Reason**: Out of scope for this change. "Bidirectional notification" in the proposal refers only to client↔backend communication via the WebSocket; OS-level toast notifications are deferred to a future change.

**Migration**: Subscribe to the same WebSocket events from any client (e.g. the existing phone remote) to surface relevant notifications.