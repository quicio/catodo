# anime-channel Specification

## Purpose
Documents the Anime channel as built: it scans a local video directory, exposes episodes grouped by series, and streams the selected episode file over HTTP.
## Requirements
### Requirement: Library scan

The channel SHALL recursively scan the configured anime directory (runtime key `anime_dir`, default `~/Anime`) for files with video extensions (`.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`). Each episode SHALL record its absolute path, display name, series (top-level directory or "Sin serie"), season (second-level directory when present), and path relative to the base.

#### Scenario: Episodes grouped by series

- **WHEN** `GET /api/channels/anime/state` is called with a populated anime directory
- **THEN** the response includes `count` and `series`, a map of series name to its episodes.

#### Scenario: Empty library

- **WHEN** the anime directory does not exist or has no video files
- **THEN** state reports `count: 0` and `current: null` without error.

### Requirement: Current episode selection

The channel SHALL track a current episode (defaulting to the first scanned) and accept `set_episode` (by relative or absolute path), `next`, and `prev` commands. Next/previous SHALL wrap around cyclically.

#### Scenario: Wrap-around navigation

- **WHEN** the `next` command is issued on the last episode
- **THEN** the first episode becomes current.

### Requirement: Playing flag

The channel SHALL maintain a `playing` flag toggled by `open`/`close` and the `play`/`pause`/`set_episode`/`next`/`prev` commands, and expose it in state.

#### Scenario: Play command sets flag

- **WHEN** a `play` command is issued
- **THEN** subsequent state calls report `playing: true`.

### Requirement: Cached library scan

The channel SHALL cache scan results and rescan at most once per TTL (default 60s) or when explicitly refreshed, and SHALL run the filesystem walk off the event loop thread.

#### Scenario: Repeated state polls

- **WHEN** state is requested twice within the TTL
- **THEN** the second response is served from cache without walking the filesystem again.

#### Scenario: Manual refresh

- **WHEN** a `refresh` command is issued
- **THEN** the next state reflects the current directory contents.

### Requirement: Range-enabled streaming

The stream endpoint SHALL honor HTTP `Range` headers with `206 Partial Content`, `Content-Range`, and `Accept-Ranges: bytes`, and SHALL return `416` for unsatisfiable ranges.

#### Scenario: Seek request

- **WHEN** a request arrives with `Range: bytes=1000000-`
- **THEN** the response is 206 starting at byte 1000000 with correct `Content-Range`.

#### Scenario: Full request

- **WHEN** no Range header is present
- **THEN** the response is 200 with the full file and an `Accept-Ranges: bytes` header.

### Requirement: Episode selection via command only

Episode selection SHALL happen exclusively through the `set_episode` command; the stream endpoint SHALL NOT mutate channel state.

#### Scenario: GET is side-effect free

- **WHEN** the stream endpoint is called repeatedly with any query parameters
- **THEN** the current episode remains unchanged.

### Requirement: Episode events

The channel SHALL publish `episode_changed` (with the episode record) whenever the current episode changes through any path (`set_episode`, `next`, `prev`).

#### Scenario: Next episode pushes event

- **WHEN** a `next` command advances the episode
- **THEN** connected clients receive `episode_changed` with the new episode before their next render.

### Requirement: Progress reporting and seek-on-load

The channel state and episode records SHALL include saved position and watched flag. The channel SHALL accept a `seek` command carrying the current position for periodic saves.

#### Scenario: Episode records carry progress

- **WHEN** `GET /api/channels/anime/state` is called
- **THEN** each episode record includes `position_seconds` and `watched`.

#### Scenario: Save position

- **WHEN** a `{"command": "seek", "position": 754}` command arrives for the current episode
- **THEN** the position is persisted for that episode.

### Requirement: Resume in the player

The frontend SHALL seek to the saved position when an episode with saved progress starts playing, and SHALL show a watched/resume indicator in the episode list.

#### Scenario: Resume indicator

- **WHEN** the episode list renders an episode with saved progress below the watched threshold
- **THEN** it shows a resume indicator; watched episodes show a watched indicator.

