# channel-system Specification

## Purpose
TBD - created by archiving change initial-mvp. Update Purpose after archive.
## Requirements
### Requirement: Channel abstraction

The system SHALL provide a `Channel` interface that all channels implement.

#### Scenario: Channel interface contract

- **WHEN** a new plugin is created in `backend/catodo/channels/`
- **THEN** it MUST subclass `Channel` and implement `id`, `name`, `icon`, `type`, `open()`, `close()`, `state()`, and `command()`.

### Requirement: Channel registration

The system SHALL register channels at startup from the static built-in list plus any installed, enabled plugins. Plugins SHALL NOT require code changes to the core or a rebuild.

#### Scenario: Adding a new channel

- **WHEN** a plugin with a supported `type` is installed and enabled
- **THEN** the channel becomes available via `GET /api/channels` without changes to other modules

#### Scenario: Built-in channels

- **WHEN** the system starts with no plugins installed
- **THEN** the built-in channels (Spotify, YouTube, Anime, TV) are still registered as today

#### Scenario: Invalid plugin does not block startup

- **WHEN** a plugin has an invalid manifest or a duplicated id
- **THEN** it is skipped, logged, and the rest of the channels (built-ins and valid plugins) still load

#### Scenario: Disabled plugin

- **WHEN** a plugin is disabled
- **THEN** its channel is not registered and does not appear in `GET /api/channels`

### Requirement: Channel manager

The system SHALL provide a `ChannelManager` that owns the registry, the current channel, and the history.

#### Scenario: Opening a channel

- **WHEN** `manager.open(channel_id)` is called
- **THEN** the previous channel is closed, the new channel is opened, and the current channel id is updated.

#### Scenario: Switching to next channel

- **WHEN** `manager.next()` is called
- **THEN** the manager SHALL move to the next channel in the registry order, cyclically.

#### Scenario: Switching to previous channel

- **WHEN** `manager.previous()` is called
- **THEN** the manager SHALL move to the previous channel in the registry order, cyclically.

#### Scenario: Channel history

- **WHEN** a channel is opened
- **THEN** its id is appended to the history list, capped at 16 entries.

### Requirement: Channel state

The system SHALL expose the current channel state via `manager.state()`.

#### Scenario: State shape

- **WHEN** `manager.state()` is called
- **THEN** it SHALL return a JSON object with: `current_channel_id`, `playing`, `volume`, `available_channels`.

### Requirement: Reference channel plugins

The system SHALL ship with four reference channels: `Spotify`, `YouTube`, `Anime`, and `TV`.

#### Scenario: Spotify channel

- **WHEN** the Spotify channel is opened
- **THEN** it SHALL send Play over MPRIS/DBus and expose now-playing state including track metadata and playback position.

#### Scenario: YouTube channel

- **WHEN** the YouTube channel is opened
- **THEN** it SHALL render an in-app `<webview>` pointing to a runtime-configurable YouTube TV URL (default: `https://www.youtube.com/tv`), with an Android TV user agent. No external Chromium process is launched.

#### Scenario: Anime channel

- **WHEN** the Anime channel is opened
- **THEN** it SHALL scan the configured anime directory and expose a grouped episode list, with a `<video>` player streaming the selected episode.

#### Scenario: TV channel

- **WHEN** the TV channel is opened
- **THEN** it SHALL render an in-app `<webview>` pointing to a runtime-configurable TV provider URL (default: Movistar TV). DRM playback requires an Electron build with Widevine (castLabs Electron in dev environments).

### Requirement: Accurate playing state

The manager SHALL derive the global `playing` flag from the current channel's reported status after a transport command, not from the command name. A `toggle` command SHALL NOT be assumed to mean "now playing".

#### Scenario: Toggle while paused

- **WHEN** `toggle` is sent while the channel reports Paused
- **THEN** the manager queries the channel state and reports `playing: true` only if the channel confirms playback.

#### Scenario: Command on unavailable channel

- **WHEN** a transport command targets a channel that cannot report state
- **THEN** `playing` remains unchanged rather than being guessed.

### Requirement: Channel close failure isolation

A failing `close()` on the outgoing channel SHALL NOT prevent opening the next channel, and the failure SHALL be logged.

#### Scenario: Close raises during switch

- **WHEN** switching channels and the outgoing channel's `close()` raises
- **THEN** the new channel still opens, the switch completes, and a warning is logged.

