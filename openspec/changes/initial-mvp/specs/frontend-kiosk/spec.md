# Frontend Kiosk

## ADDED Requirements

### Requirement: Fullscreen kiosk window

The Tauri window SHALL be created in fullscreen mode without decorations.

#### Scenario: App boot

- **WHEN** the app starts
- **THEN** the window SHALL be fullscreen, frameless, and cover the primary monitor.

### Requirement: Channel display

The UI SHALL show the current channel's view fullscreen.

#### Scenario: Channel switch

- **WHEN** the channel changes (via API or hotkey)
- **THEN** the UI SHALL switch to the new channel's view within 200ms.

### Requirement: Channel bar

The UI SHALL show a channel bar at the bottom listing all channels.

#### Scenario: Channel bar visibility

- **WHEN** the mouse has not moved for 3 seconds
- **THEN** the channel bar SHALL auto-hide.

- **WHEN** the mouse moves
- **THEN** the channel bar SHALL show.

### Requirement: Hotkeys

The Tauri app SHALL register global hotkeys `1`-`6` for switching channels.

#### Scenario: Hotkey switch

- **WHEN** the user presses `2` while the app is focused
- **THEN** the system opens channel 2 (YouTube) and emits a `channel_changed` event.

### Requirement: Fullscreen toggle

The app SHALL respond to `F11` to toggle fullscreen/windowed mode.

#### Scenario: F11 toggle

- **WHEN** the user presses `F11`
- **THEN** the window toggles between fullscreen and a 1024x768 windowed mode.

### Requirement: Esc exits fullscreen

The app SHALL respond to `Esc` to exit fullscreen (windowed mode).

#### Scenario: Esc behavior

- **WHEN** the user presses `Esc` while fullscreen
- **THEN** the window exits fullscreen.

### Requirement: HTTP client

The frontend SHALL communicate with the backend via HTTP on `127.0.0.1:8765`.

#### Scenario: API call

- **WHEN** the user selects channel 2
- **THEN** the frontend calls `POST /api/channels/youtube/open` and updates the UI on the response.

### Requirement: WebSocket subscriber

The frontend SHALL subscribe to `ws://127.0.0.1:8765/api/ws` for live events.

#### Scenario: External state change

- **WHEN** another client changes the channel via the API
- **THEN** the frontend receives the `channel_changed` event and updates its UI.
