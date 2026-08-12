# Fix Critical Bugs

## Why

Several shipped behaviors are actively wrong or misleading. The worst offender: the volume endpoint stores a number and shows a HUD, but **nothing actually gets louder or quieter** — not the system, not the video player, not Spotify. Alongside it: a broken `playing` flag, dead code that confuses the channel model, and a config writer that can corrupt `config.json` on crash. These are correctness bugs in a system meant to run 24/7.

## What Changes

- **Real volume control**: `POST /api/volume` drives the system mixer via PipeWire/PulseAudio (`wpctl`/`pactl`), falling back to per-channel volume (Spotify MPRIS) when no system mixer is available. **BREAKING**: volume now has audible side effects; the value is read back from the mixer at startup instead of always starting at 50.
- **Frontend applies volume locally**: the Anime `<video>` element follows the global volume; webview channels document why they can't (third-party players own their audio — system mixer covers them).
- **Fix `playing` tracking**: the manager no longer guesses `playing` from command names; it asks the current channel for its real status after a command, and `toggle` no longer implies "playing".
- **Remove dead/duplicate code**: duplicate `SpotifyChannel.state()`, unused `pydbus` dependency, unused `settings.chromium_bin`, the misleading `settings.channels` list (registry is static), and the orphan `RATINGS_FILE` constant (returns in `media-persistence`).
- **Atomic runtime config**: writes go through a write-temp-then-rename dance with a lock, so a crash mid-save cannot corrupt `config.json`.
- **EventBroker shutdown**: subscriber queues that are full at close time are drained instead of leaving generator tasks hanging.

## Capabilities

### New Capabilities

- `volume-control`: system-mixer-backed volume with per-channel fallback and read-back.

### Modified Capabilities

- `channel-system`: manager derives `playing` from channel state, not from command names. (Delta uses ADDED ops: the baseline lands with `sync-specs-reality`; no existing requirement text is contradicted.)
- `runtime-config`: atomic, locked writes (behavioral only under failure). (ADDED ops, same reason.)
- `backend-api`: volume endpoint semantics (drives real mixer; reports actual level). (ADDED ops, same reason.)

## Non-goals

- Per-channel volume mixing or audio device routing (future change).
- Replacing polling with WebSocket events (that is `event-driven-state`).
- Async rework of wallpaper downloads (that is `backend-async-hardening`).
- New channels or features.

## Impact

- `backend/catodo/manager.py`, `channels/spotify.py`, `runtime_config.py`, `events.py`, `config.py`, `channels/__init__.py`, `pyproject.toml`.
- `frontend/src/App.tsx`, `channels/Anime.tsx` (apply volume to media elements).
- New optional runtime dependency on `wpctl` or `pactl` (system binaries, detected at runtime).
