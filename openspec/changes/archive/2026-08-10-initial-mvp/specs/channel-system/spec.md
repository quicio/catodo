# Channel System

## ADDED Requirements

### Requirement: Channel abstraction

The system SHALL provide a `Channel` interface that all channels implement.

#### Scenario: Channel interface contract

- **WHEN** a new plugin is created in `backend/catodo/channels/`
- **THEN** it MUST subclass `Channel` and implement `id`, `name`, `icon`, `type`, `open()`, `close()`, `state()`, and `command()`.

### Requirement: Channel registration

The system SHALL register channels at startup via a static list in `backend/catodo/channels/__init__.py`.

#### Scenario: Adding a new channel

- **WHEN** a developer adds a new file `backend/catodo/channels/foo.py` and registers it in `__init__.py`
- **THEN** the channel becomes available via `GET /api/channels` without changes to other modules.

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
