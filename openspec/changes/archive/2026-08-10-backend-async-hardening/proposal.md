# Backend Async Hardening

## Why

The backend is an asyncio server that blocks its own event loop. Wallpaper downloads run synchronous `urllib` calls with 20–40s timeouts inside request handlers — while `Home` auto-requests artist photos on every track change, the whole API (health, WS, video streaming) freezes behind them. The Anime channel rescans the entire library on every state poll (every 4s from the frontend), also synchronously. And episode streaming can't seek because responses ignore HTTP `Range`. One event loop, many self-inflicted stalls.

## What Changes

- **Non-blocking external I/O**: all wallpaper/cover/artist HTTP fetches and downloads move to async `httpx` (already a dependency); heavy work runs in background tasks — `fetch`/`artist` return promptly and downloads complete in the background, with per-artist in-flight deduplication.
- **Range-enabled streaming**: `GET /api/channels/{id}/stream` supports `Range` requests (`206 Partial Content`, `Accept-Ranges: bytes`), enabling video seek and big MKV playback. **BREAKING for broken clients only**: the `rel` query-param side effect (selecting the episode via GET) is removed; episode selection goes through the existing `set_episode` command.
- **Cached library scan**: the Anime channel rescans at most every N seconds (TTL) or on explicit refresh, and scans off the event loop thread.
- **Typed channel capabilities**: replace `hasattr` duck-typing in the API with explicit capability protocols (`StreamableChannel`, `MediaLibraryChannel`, `HistoricalChannel`); channels declare `capabilities` in their `to_dict()` so the frontend can discover features instead of hardcoding ids.
- **Download hygiene**: dedupe downloaded files by content hash (not just source id), and cap concurrent downloads.

## Capabilities

### New Capabilities

- `channel-capabilities`: typed optional capabilities and their discovery via the API.

### Modified Capabilities

- `wallpapers`: async background downloads, in-flight dedupe, hash-based file dedupe (ADDED ops; no existing requirement text contradicted).
- `anime-channel`: cached scanning, Range-enabled streaming, episode selection only via command (the `rel` GET side effect is REMOVED).
- `backend-api`: stream endpoint serves `206` with ranges; capability endpoints driven by declared capabilities.

## Non-goals

- WebSocket event refactor of the frontend (`event-driven-state` builds on this but is separate).
- Transcoding, subtitles, or multi-audio handling for video.
- A job queue framework — plain asyncio tasks suffice.
- Changing wallpaper sources or the rating model.

## Impact

- `backend/catodo/wallpapers.py` (major rework), `api.py` (range streaming, capability dispatch), `channels/anime.py` (scan cache), `channel.py` + channel implementations (capability declarations).
- `frontend/src/channels/Anime.tsx`: stop relying on `?rel=` GET side effect; use the command then reload the stream.
- New behavior visible to API clients: `Accept-Ranges` header, `206` responses, `capabilities` field in channel listings.
