# Event-Driven State

## Why

The WebSocket exists but the frontend never connected to it: `useWebSocket`/`applyEvent` are dead code while four components run independent polling loops (500ms–4s), each keeping its own copy of overlapping state. Channels never publish events, so nothing is pushed anyway. Result: duplicated requests, state that diverges between components and clients, and a "live TV" that is actually a slow photocopier. The MVP promised WS-driven events; this change makes it true.

## What Changes

- **Backend domain events**: channels publish real events — Spotify emits `track_changed` and `playback_status_changed` (via a single backend watch loop with change detection, replacing per-client polling), Anime emits `episode_changed`, wallpapers emit `wallpapers_changed` when background downloads land, runtime config emits `config_changed`.
- **WS snapshot on connect**: a new WebSocket client immediately receives a full state snapshot, then live events — no initial REST round-trip needed for liveness.
- **Frontend single store**: one WS subscription in `App` feeding a central reducer store; `NowPlaying`, `Home`, `Anime`, and the HUD read from it. The four polling loops die.
- **Local position interpolation**: lyrics/progress interpolate playback position between events (position + wall-clock at event time) instead of polling every 500ms.
- **Optimistic UI reconciled**: local channel-switch previews are confirmed or rolled back by the authoritative `channel_changed` event.

## Capabilities

### New Capabilities

- `event-system`: the domain event catalog, publish/subscribe guarantees, and the WS snapshot contract.

### Modified Capabilities

- `spotify-channel`: publishes track/playback events from one backend-side watcher (ADDED ops).
- `anime-channel`: publishes `episode_changed` (ADDED ops).
- `wallpapers`: publishes `wallpapers_changed` after background downloads (ADDED ops).
- `runtime-config`: publishes `config_changed` on write (ADDED ops).
- `frontend-kiosk`: single WS-fed store; polling loops removed (ADDED ops).
- `backend-api`: WS endpoint sends an initial snapshot (ADDED ops).

## Non-goals

- DBus/GLib signal integration (MPRIS `PropertiesChanged`): the diff-based watcher delivers the same events with far less complexity; signals can replace the watcher later without changing the event contract.
- CRDT/multi-client conflict resolution — events are authoritative and last-write-wins.
- Server-sent events or WebRTC — WebSocket stays.
- Removing the REST API: it remains for commands and on-demand state.

## Impact

- `backend/catodo/events.py` (catalog + snapshot), `channels/spotify.py` (watcher + publishes), `channels/anime.py`, `wallpapers.py`, `runtime_config.py`, `api.py` (WS snapshot).
- `frontend/src/api/ws.ts` (wire-up), `App.tsx` (store), all channel components and `Home`/`NowPlaying` (consume store, delete pollers).
- Net effect: idle backend goes from ~2–4 req/s of polling to zero; UI updates become push-latency.
