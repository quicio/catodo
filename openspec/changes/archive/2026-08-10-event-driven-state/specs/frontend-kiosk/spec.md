## ADDED Requirements

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
