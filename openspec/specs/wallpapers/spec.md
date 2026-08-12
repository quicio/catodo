# wallpapers Specification

## Purpose
Documents the wallpaper subsystem as built: on-demand downloads from external sources into the user data dir, served back to the frontend, plus album-cover and artist-photo lookups.
## Requirements
### Requirement: Data-dir storage

Downloaded wallpapers SHALL live under `<data_dir>/wallpapers` (default `~/.local/share/catodo/wallpapers`). Files whose name starts with `_` are source-specific assets (artist photos) and SHALL be excluded from general listings and duplicate checks.

#### Scenario: List excludes artist assets

- **WHEN** `GET /api/wallpapers/list` is called and the directory mixes general and `_`-prefixed files
- **THEN** only general image files are returned, as `/api/wallpapers/files/<name>` URLs, sorted by name.

### Requirement: File serving

`GET /api/wallpapers/files/{filename}` SHALL serve an image from the wallpaper dir. The filename SHALL be sanitized to its basename; missing files SHALL return 404.

#### Scenario: Traversal attempt

- **WHEN** a filename containing path separators is requested
- **THEN** only the basename is resolved inside the wallpaper dir, and anything outside returns 404.

### Requirement: General fetch

`POST /api/wallpapers/fetch?n=N` SHALL download up to `n` new wallpapers from Wallhaven (dark-themed curated queries, minimum 1920x1080), skipping already-downloaded ids, and SHALL report `downloaded` and `total`.

#### Scenario: No duplicates

- **WHEN** fetch is called twice
- **THEN** the second call does not re-download ids already present in the wallpaper dir.

### Requirement: Artist wallpapers

`GET /api/wallpapers/artist?name=X&n=N` SHALL return up to `n` photos of the given artist sourced from Last.fm artist images and Reddit wallpaper communities, downloaded once and cached as `_artist_*`/`_reddit_*`/`_lastfm_*` files. Repeated calls with the same name SHALL return the cached files without re-downloading. When no source yields images the endpoint SHALL return 404; when downloads fail, 502.

#### Scenario: Cached artist

- **WHEN** artist wallpapers are requested twice for the same artist
- **THEN** the second response lists the previously downloaded files without new downloads.

### Requirement: Album cover lookup

`GET /api/wallpapers/cover?artist=X&track=Y` SHALL return a high-resolution (1000x1000) artwork URL via the iTunes Search API, 400 when neither artist nor track is given, 404 when no artwork exists, and 502 when iTunes is unavailable.

#### Scenario: High-res upgrade

- **WHEN** iTunes returns `artworkUrl100`
- **THEN** the response URL is rewritten to its 1000x1000 variant.

### Requirement: Count endpoint

`GET /api/wallpapers/count` SHALL return the number of general wallpapers on disk.

#### Scenario: Count

- **WHEN** count is requested
- **THEN** the response is `{"total": <number of general wallpapers>}`.

### Requirement: Non-blocking external I/O

All upstream HTTP calls and file downloads SHALL run without blocking the asyncio event loop: other API requests (health, WebSocket, streaming) SHALL NOT stall behind wallpaper downloads.

#### Scenario: Download storm does not freeze API

- **WHEN** an artist-wallpaper request triggers several downloads and `GET /api/health` is called concurrently
- **THEN** health still responds within 100ms.

### Requirement: Background download tasks

`POST /api/wallpapers/fetch` and `GET /api/wallpapers/artist` SHALL return promptly with the work accepted; downloads continue in background tasks and results become visible via `list`/`artist` on subsequent calls.

#### Scenario: Fetch returns immediately

- **WHEN** `POST /api/wallpapers/fetch?n=4` is called
- **THEN** the response arrives without waiting for all downloads to finish, and the wallpaper count grows as tasks complete.

#### Scenario: In-flight deduplication

- **WHEN** the same artist is requested twice while its downloads are still running
- **THEN** only one batch of downloads runs for that artist.

### Requirement: Content-hash deduplication

Downloaded files SHALL be deduplicated by content hash in addition to source id, so the same image from two sources is stored once.

#### Scenario: Same image, two sources

- **WHEN** Reddit and Last.fm yield the byte-identical image
- **THEN** only one file exists in the wallpaper dir.

### Requirement: Download concurrency cap

Concurrent downloads SHALL be capped (default 4) so a burst cannot saturate the connection or the upstream.

#### Scenario: Cap respected

- **WHEN** 10 downloads are queued
- **THEN** at most 4 run concurrently.

### Requirement: Wallpaper change events

When background downloads complete and the wallpaper set changes, the system SHALL publish `wallpapers_changed` with the new total so clients can refresh listings without polling.

#### Scenario: Download lands

- **WHEN** a background wallpaper download finishes writing a new file
- **THEN** a `wallpapers_changed` event is published with the updated total.

### Requirement: Ratings API

The system SHALL expose `GET /api/wallpapers/ratings` (all ratings) and `POST /api/wallpapers/ratings` (`{"id": <wallpaper id>, "rating": "up"|"down"|"none"}`), persisting them server-side. `none` SHALL remove the rating.

#### Scenario: Rate down

- **WHEN** POSTing `{"id": "abc123", "rating": "down"}`
- **THEN** subsequent GETs include the rating and rotation excludes `abc123`.

### Requirement: Frontend rating sync

The frontend SHALL read ratings from the backend and write through it, keeping a local mirror only as an offline/render cache.

#### Scenario: Two browsers agree

- **WHEN** a wallpaper is rated in one browser and another browser loads Home
- **THEN** both show the same rating state.

