# frontend-kiosk Specification

## Purpose
TBD - created by archiving change initial-mvp. Update Purpose after archive.
## Requirements
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

### Requirement: Single event-fed store

The frontend SHALL keep application state in one central store fed by the WebSocket (snapshot + events). Components SHALL read state from the store rather than owning parallel polling loops.

#### Scenario: No polling loops

- **WHEN** the UI is idle on any screen
- **THEN** no `setInterval`-driven fetch of `/api/state` or channel state runs (clocks and pure-UI timers excepted).

#### Scenario: Cross-component consistency

- **WHEN** a `track_changed` event arrives
- **THEN** every visible component reflecting the track (Home background, Now Playing) updates from the same store value.

### Requirement: Resilient WebSocket

The frontend SHALL reconnect the WebSocket automatically after disconnects, re-rendering from the fresh snapshot on reconnect.

#### Scenario: Backend restart

- **WHEN** the backend restarts while the UI is open
- **THEN** the UI reconnects within seconds and shows current state without a manual reload.

### Requirement: Local position interpolation

Playback position for lyrics/progress SHALL be interpolated locally from the last event's position and wall-clock, resynchronizing on each `playback_status_changed`/`track_changed` event.

#### Scenario: Lyrics stay in sync

- **WHEN** a track plays for 30 seconds without new events
- **THEN** the highlighted lyric line still advances in time.

### Requirement: Command responses update via events

After sending a command, the UI SHALL wait for the resulting event rather than immediately re-fetching state.

#### Scenario: Pause reflects via push

- **WHEN** the user hits pause
- **THEN** the paused UI appears when the `playback_status_changed`/`playing_changed` event arrives, without a state GET.

### Requirement: Theme selector in UI

The frontend SHALL expose a theme selector in the Home view listing the available themes (predefined + custom). Selecting a theme SHALL persist it via `POST /api/config` and apply it immediately.

#### Scenario: Select theme

- **WHEN** the user picks a theme in the selector
- **THEN** the UI applies the theme tokens at once and the backend stores the choice.

#### Scenario: Theme list includes custom themes

- **WHEN** custom themes are defined in config.json
- **THEN** they appear in the selector alongside the predefined ones.

### Requirement: Apply theme from config

The frontend SHALL read the active theme at boot (from `/api/config` or the `config_changed` event) and apply its tokens to `:root`. A `config_changed` event with key `theme`, `themes`, or `theme_crt_enabled` SHALL re-apply the theme without a reload.

#### Scenario: Boot applies theme

- **WHEN** the app loads and the config reports a non-default theme
- **THEN** the UI renders with that theme's tokens.

#### Scenario: Config change re-applies

- **WHEN** a `config_changed` event for `theme` arrives
- **THEN** the UI switches tokens live.

### Requirement: CRT effects follow config

The frontend SHALL toggle the CRT scanlines/vignette based on `theme_crt_enabled` (default on), even if the theme itself does not override it.

#### Scenario: CRT disabled via config

- **WHEN** `theme_crt_enabled` is set to `false`
- **THEN** no scanlines or vignette render on any channel.

#### Scenario: CRT enabled via config

- **WHEN** `theme_crt_enabled` is `true`
- **THEN** scanlines and vignette render on all channels except screen cast.

### Requirement: Home renders from a HomeLayout

The Home view SHALL be composed from a `HomeLayout` (list of `HomeComponentConfig`s) resolved by a slot registry, rather than from a single hardcoded JSX tree. The default layout SHALL reproduce the existing Home composition (clock, brand, channel grid, ratings column, mini now-playing when Spotify plays, appearance-settings popover, pair modal, wallpaper background) without changing observable behavior.

#### Scenario: Default layout matches current Home

- **WHEN** the app boots with no explicit layout passed to Home
- **THEN** the default layout renders all current sections in the current positions (reloj top-left, brand centered, channel grid below, ratings + settings column right, pair modal via AppearanceSettings button)

#### Scenario: Layout change reflects in Home

- **WHEN** a different HomeLayout is passed to the Home component
- **THEN** only the components listed in that layout are rendered, in the order given

#### Scenario: Unknown component id does not crash Home

- **WHEN** a layout contains an id that the registry does not know
- **THEN** that entry is skipped or shows a silent fallback; the rest of Home renders normally

