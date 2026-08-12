# Sync Specs with Reality

## Why

`initial-mvp` is complete (49/49 tasks) but was never archived, so `openspec/specs/` is empty: the project has no baseline specs. On top of that, the codebase grew beyond the MVP (anime, tv, lyrics, wallpapers, runtime config) with zero spec coverage, and some MVP artifacts now lie (they say Tauri; the shell is Electron). Future changes need a truthful baseline to delta against.

## What Changes

- Correct `initial-mvp` artifacts before archiving: `frontend-kiosk` describes Electron (not Tauri), real channel bar timeout (8s), real channel set.
- Archive `initial-mvp` so its four capabilities become the baseline under `openspec/specs/`.
- Fix `openspec/config.yaml`: stack is Electron + React + Vite (not Tauri), document the four real channels and the runtime data dir.
- Document everything built but never specified as delta specs describing **current** behavior:
  - Spotify channel: MPRIS control, track history, estimated position, `open_uri`.
  - YouTube channel: webview channel with runtime-configurable URL, video id/thumbnail.
  - TV channel: webview channel with runtime-configurable URL (Widevine via castLabs Electron in dev).
  - Anime channel: local library scan, grouped episodes, per-episode streaming, next/prev.
  - Lyrics: `GET /api/lyrics` backed by LRCLib with search fallback.
  - Wallpapers: data-dir provisioning, list/files/fetch/cover/artist endpoints.
  - Runtime config: JSON overrides at `~/.local/share/catodo/config.json` + `GET/POST /api/config`.
- Extend `backend-api` with the endpoints that exist but were never specified: channel close/state/episodes/stream/history, config, and the raw-`+` volume query handling.

No code changes. This change only aligns documentation with the running system.

## Capabilities

### New Capabilities

- `spotify-channel`: MPRIS-backed media channel behavior, history, position tracking.
- `youtube-channel`: web channel with configurable URL and metadata derivation.
- `anime-channel`: local video library channel, scanning and streaming behavior.
- `tv-channel`: web channel with configurable URL.
- `lyrics`: lyrics lookup API behavior (LRCLib get + search fallback, sync parsing).
- `wallpapers`: wallpaper provisioning, caching, and serving behavior.
- `runtime-config`: runtime JSON overrides and the `/api/config` surface.

### Modified Capabilities

- `backend-api`: adds the endpoints shipped but unspecified (close/state/episodes/stream/history/config; volume raw query parsing).

## Non-goals

- Changing any runtime behavior (that is what `fix-critical-bugs` and friends are for).
- Specifying planned-but-unbuilt work (remote client, persistence, power management).
- Rewriting the MVP spec history beyond factual corrections (Electron, channel set, timeouts).

## Impact

- `openspec/changes/initial-mvp/` — edited, then archived to `openspec/specs/`.
- `openspec/config.yaml` — stack and conventions corrected.
- `openspec/changes/sync-specs-reality/specs/` — seven new delta specs + one modified.
- No code, API, or dependency impact. Unblocks truthful deltas for all queued changes.
