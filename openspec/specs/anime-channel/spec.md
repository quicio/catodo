# anime-channel Specification

## Purpose
Documents the local media channels as built (legacy Anime and configured `libraries`): they scan a video directory, group episodes by series, collection or movies, and stream the selected file over HTTP.
## Requirements
### Requirement: Library scan

The channel SHALL recursively scan the configured media directory (runtime key `anime_dir` for the legacy Anime channel, or each `libraries` entry) for files with video extensions (`.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`). Each episode SHALL record its absolute path, display name, `collection`, `series`, `season`, and path relative to the base.

#### Scenario: Episodes grouped by series

- **WHEN** `GET /api/channels/<id>/state` is called for a `series` library with a populated directory
- **THEN** the response includes `count` and `series`, a map of series name to its episodes.

#### Scenario: Empty library

- **WHEN** the directory does not exist or has no video files
- **THEN** state reports `count: 0` and `current: null` without error.

### Requirement: Emission library kinds

The scan layout SHALL depend on the library `kind`: `series` groups by top-level series and season, `movies` is a flat list with `series: "Películas"`, and `collections` groups by collection, then series, then season. Legacy `videos` SHALL be an alias of `movies`, and unknown kinds SHALL fall back to `series`.

#### Scenario: Kind layouts

- **WHEN** a library scans `<base>/<Serie>/<Temporada?>/<episodio>`
- **THEN** `series` records the first directory and `season` the second one when present, and `collection` is empty.
- **WHEN** a library scans `<base>/<Colección>/<Serie>/<Temporada?>/<episodio>`
- **THEN** `collection` records the first directory, `series` the second, and `season` the third when present.

#### Scenario: Movies are a flat list

- **WHEN** a `movies` library scans a directory with nested subfolders
- **THEN** every video appears as an independent movie with `series: "Películas"` and no collection or season.

#### Scenario: Collections keep the hierarchy

- **WHEN** a `collections` library scans `<base>/Anime/Saint Seiya/Season 1/Ep 1.mp4`
- **THEN** the episode records `collection: "Anime"`, `series: "Saint Seiya"` and `season: "Season 1"`.

#### Scenario: Loose episodes inside a collection

- **WHEN** a `collections` library scans `<base>/Anime/Saint Seiya/Ep 2.mkv`
- **THEN** the episode records `collection: "Anime"`, `series: "Saint Seiya"` and an empty `season`.

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

### Requirement: Normalización de contenedor

The channel SHALL remux local files in non-native containers (`.mkv`, `.avi`, `.mov`) to a cached MP4 under `<data_dir>/media-cache/`, copying H.264 8-bit video and AAC audio and transcoding when needed. The cache SHALL be keyed by source path, mtime and size, prepared atomically, and reused while the source is unchanged. If preparation fails, the original file SHALL be served.

#### Scenario: MKV with AC3 audio

- **WHEN** an episode is an `.mkv` with H.264 video and AC3 audio
- **THEN** the stream endpoint serves a cached MP4 with copied H.264 video and AAC audio, and seek/resume keep working.

#### Scenario: Prefer a compatible audio track

- **WHEN** the first audio track is AC3 but the file has another AAC track
- **THEN** the remux copies the AAC track instead of transcoding, so the first playback starts in seconds.

#### Scenario: Native containers are untouched

- **WHEN** an episode is `.mp4` or `.webm`
- **THEN** the original file is served directly, without invoking ffmpeg.

#### Scenario: Cache reuse

- **WHEN** the same episode is requested again and the source did not change
- **THEN** the existing cached MP4 is served without re-running ffmpeg.

#### Scenario: Source changed

- **WHEN** the source file's mtime or size changes
- **THEN** a new cache entry is produced instead of reusing the stale one.

#### Scenario: Remux failure

- **WHEN** ffmpeg cannot prepare the file
- **THEN** the channel logs the error and falls back to the original file.

### Requirement: Emission view by kind

The frontend SHALL render the content list according to the library `kind`: a flat list for `movies`, collection → series → season for `collections`, and series → season for `series`. Seasons and loose episodes SHALL coexist, and the current episode SHALL stay highlighted.

#### Scenario: Movies list has no groupings

- **WHEN** a `movies` library is open and the list is shown
- **THEN** all movies appear in a single flat list with no series or season headers.

#### Scenario: Collections show three levels

- **WHEN** a `collections` library is open and the list is shown
- **THEN** episodes are grouped under collection headers, then series headers, then season headers when present.

#### Scenario: Loose episodes sit beside seasons

- **WHEN** a series has both `Season 1/` and loose episode files
- **THEN** the loose episodes appear under the series without a season header and the season episodes under their season header.

