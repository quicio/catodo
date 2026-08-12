# Frontend Kiosk

## ADDED Requirements

### Requirement: Fullscreen kiosk window

The Electron window SHALL be created in fullscreen kiosk mode (frameless, `frame: false`, `kiosk: true`) with `webviewTag: true` enabled for in-app webviews (YouTube, TV).

#### Scenario: App boot

- **WHEN** the app starts
- **THEN** the window SHALL be fullscreen, frameless, and cover the primary monitor.

### Requirement: Channel display

The UI SHALL show the current channel's view fullscreen via React components rendered inside the Electron shell.

#### Scenario: Channel switch

- **WHEN** the channel changes (via API or hotkey)
- **THEN** the UI SHALL switch to the new channel's view within 200ms.

### Requirement: Channel bar

The UI SHALL show a channel bar at the bottom listing all channels.

#### Scenario: Channel bar visibility

- **WHEN** the mouse has not moved for 8 seconds
- **THEN** the channel bar SHALL auto-hide.

- **WHEN** the mouse moves, clicks, types, or touches
- **THEN** the channel bar SHALL show.

### Requirement: Hotkeys

The Electron app SHALL bind keyboard shortcuts `1`–`6` for switching channels. Hotkeys that exceed the registered channel count SHALL have no effect. Webview key events SHALL be forwarded to the main window so shortcuts work while webviews are focused.

#### Scenario: Hotkey switch

- **WHEN** the user presses `2` while the app is focused (including inside a webview)
- **THEN** the system opens channel 2 (YouTube) and the UI reflects the change.

### Requirement: Fullscreen toggle

The app SHALL respond to `F11` to toggle fullscreen/windowed mode.

#### Scenario: F11 toggle

- **WHEN** the user presses `F11`
- **THEN** the window toggles between fullscreen and windowed mode.

### Requirement: Esc exits fullscreen and returns to Home

The app SHALL respond to `Esc` to exit fullscreen and return to the Home view.

#### Scenario: Esc behavior

- **WHEN** the user presses `Esc` while fullscreen
- **THEN** the window exits fullscreen and the current channel is deselected (Home view).

### Requirement: HTTP client

The frontend SHALL communicate with the backend via HTTP on the configured backend URL (default `http://127.0.0.1:8765`).

#### Scenario: API call

- **WHEN** the user selects channel 2
- **THEN** the frontend calls `POST /api/channels/youtube/open` and updates the UI on the response.

### Requirement: WebSocket subscriber

The frontend SHALL subscribe to `ws://<host>/api/ws` for live events.

#### Scenario: External state change

- **WHEN** another client changes the channel via the API
- **THEN** the frontend receives the `channel_changed` event and updates its UI.
