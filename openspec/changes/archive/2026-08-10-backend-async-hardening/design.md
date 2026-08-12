# Design

## Context

See proposal.md — Why. One event loop serves everything; three subsystems abuse it (sync wallpaper HTTP, per-poll library scans, whole-file streaming). This design keeps the architecture identical and only changes *where* work runs and *how* streaming answers.

## Goals / Non-Goals

**Goals**
- p99 of `/api/health` stays under 100ms during any wallpaper/scan activity.
- Video seek works in Chromium/Electron against the stream endpoint.
- No new runtime dependencies (`httpx` is already used by `lyrics`).

**Non-Goals**
- No job queue / worker processes.
- No frontend state refactor (that is `event-driven-state`).

## Decisions

### Decision 1: `httpx.AsyncClient` everywhere, shared per request

`wallpapers.py` drops `urllib.request` entirely and uses the same `httpx` pattern as `lyrics.py`. Downloads stream to disk (`client.stream`) with a per-file timeout, inside `asyncio` tasks. A module-level `asyncio.Semaphore(4)` caps concurrency.

### Decision 2: Fire-and-acknowledge for downloads

`fetch` and `artist` create background tasks via `asyncio.create_task` and return immediately with an `accepted`/`in_progress` style payload (exact shape below; the frontend only needs to know work started). An in-memory `set` of in-flight keys (`artist:<slug>`, `fetch`) provides dedupe; entries are removed in `finally`. Tasks are tracked on `app.state` so lifespan shutdown can cancel them.

Response shapes:
- `POST /fetch` → `{"accepted": true, "in_progress": true}` (was: blocking `{"downloaded", "total"}`; the count endpoint already exists for progress).
- `GET /artist` → cached files immediately if present; otherwise `{"in_progress": true, "wallpapers": []}` and the frontend retries after a delay (Home already re-fetches on track change and on an interval; add a small retry there).

### Decision 3: Range requests implemented manually over `StreamingResponse`

Starlette's `FileResponse` does not negotiate ranges. We parse a single `bytes=start-end` header ourselves, `aio` stream file slices in chunks (plain `asyncio.to_thread` reads are fine — files are local), and emit `206`/`Content-Range`/`Accept-Ranges`. Invalid or multi-range requests → `416` with `Content-Range: bytes */size`. No new dependency (no `aiofiles`: `to_thread` + os.read keeps it stdlib).

### Decision 4: Scan cache with TTL inside the channel

`AnimeChannel` keeps `_episodes`, `_scanned_at`, and a `_scan_lock`. `state()` refreshes only when `now - _scanned_at > TTL` (60s, overridable via runtime config key `anime_scan_ttl` if ever needed) and runs `_scan` via `asyncio.to_thread`. A `refresh` command forces a rescan. `set_episode`/`next`/`prev` operate on the cached list.

### Decision 5: Capabilities as class-level sets + Protocol classes

- `channel.py` gains `capabilities: frozenset[str] = frozenset()` on the base class; `to_dict()` serializes it sorted.
- Optional behaviors get `typing.Protocol` definitions (`SupportsStream`, `SupportsEpisodes`, `SupportsHistory`) used by `api.py` with `isinstance` checks. Protocols are structural, so existing channel classes only need to declare the capability string — no inheritance churn.
- Frontend `ChannelView` reads `capabilities` to decide whether to mount episode/history UI.

### Decision 6: Content-hash dedupe

After download, compute SHA-256 (streamed) and store files as `<hash>.<ext>` for general wallpapers; keep the existing `_artist_/_reddit_/_lastfm_` naming for artist assets but check a lightweight hash index file (`wallpapers/.hashes.json`) before writing. Simpler than content-addressing everything and preserves the "artist assets excluded from listings" convention.

### Dependency note

Depends on `sync-specs-reality` being archived first (this change's REMOVED targets a requirement it introduces) and coordinates with `fix-critical-bugs` (both touch `api.py`/`anime.py`; apply `fix-critical-bugs` first to keep diffs small).
