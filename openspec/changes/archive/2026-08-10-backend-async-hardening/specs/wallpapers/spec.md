## ADDED Requirements

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
