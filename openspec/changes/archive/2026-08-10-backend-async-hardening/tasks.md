# Tasks

## 1. Async wallpaper downloads

- [x] 1.1 Rewrite `wallpapers.py` fetch helpers (`_lastfm_image_urls`, `_reddit_image_urls`, `_download`, Wallhaven query, iTunes cover) on `httpx.AsyncClient` with the existing timeouts; no `urllib` remains.
- [x] 1.2 Add background task execution: `fetch`/`artist` schedule `asyncio.create_task`, dedupe in-flight keys in a module set, track tasks on `app.state`, cancel them in lifespan shutdown.
- [x] 1.3 Add a module-level `asyncio.Semaphore(4)` around downloads.
- [x] 1.4 Verify: during `POST /api/wallpapers/fetch?n=8`, `time curl -s /api/health` stays under 100ms; duplicate `artist` requests while in flight trigger only one batch.

## 2. Content-hash dedupe

- [x] 2.1 Compute SHA-256 while streaming downloads to disk; maintain `wallpapers/.hashes.json`; skip storing a file whose hash is already present.
- [x] 2.2 Verify: force the same image from two sources (mock or manual URL list) → a single file exists.

## 3. Range-enabled streaming

- [x] 3.1 Implement single-range parsing + `206` streaming responses in `api.py` (`Range: bytes=a-b`, `a-`, `-b`; `416` with `Content-Range: bytes */size` otherwise), reading file slices via `asyncio.to_thread`.
- [x] 3.2 Remove the `rel` query-param side effect from the stream endpoint.
- [x] 3.3 Frontend `Anime.tsx`: replace `?rel=` usage with a `set_episode` command followed by reloading the stream URL.
- [x] 3.4 Verify: `curl -H 'Range: bytes=0-999' .../stream` returns 206 with 1000 bytes; seeking a long MKV in the Anime channel jumps instantly.

## 4. Scan caching

- [x] 4.1 Add `_scanned_at`/`_scan_lock` to `AnimeChannel`; TTL 60s; scan via `asyncio.to_thread`; `refresh` command forces rescan.
- [x] 4.2 Verify: two `GET /api/channels/anime/state` calls 5s apart produce one directory walk (log or counter), and `{"command":"refresh"}` picks up a newly added file.

## 5. Typed capabilities

- [x] 5.1 Add `capabilities` to `Channel` base + `to_dict()`; declare capabilities in spotify (`history`), anime (`stream`, `episodes`); define `SupportsStream`/`SupportsEpisodes`/`SupportsHistory` protocols; switch `api.py` duck-typing to `isinstance` checks.
- [x] 5.2 Frontend: `ChannelView`/channel components read `capabilities` instead of hardcoded ids for episodes/history UI.
- [x] 5.3 Verify: `GET /api/channels` shows `capabilities` per channel; `GET /api/channels/tv/episodes` still returns an empty list; UI unchanged for existing channels.

## 6. Regression pass

- [x] 6.1 Run every scenario in this change's specs against a live backend; confirm no handler blocks the loop (health probe during load) and record results.
