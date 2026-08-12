# Design

## Context

See proposal.md — Why. The broker already fans out to WS clients; what is missing is (a) anyone publishing interesting events and (b) anyone listening on the frontend. The core decision is how Spotify state becomes events without GLib main-loop surgery.

## Goals / Non-Goals

**Goals**
- One subscription, one store, zero polling loops in the frontend.
- Backend idle request rate ≈ 0.

**Non-Goals**
- No DBus signal integration, no new frontend dependencies (no zustand/redux), no protocol change (same WS, same JSON).

## Decisions

### Decision 1: Diff-based watcher instead of MPRIS signals

A single asyncio task in the Spotify channel polls MPRIS every 1s and publishes only on diff (track id, status). MPRIS `PropertiesChanged` signals would require running a GLib main loop bridged into asyncio — real complexity (thread affinity, `gi` event source) for the same observable events. The watcher starts/stops with the app lifespan and is owned by the channel instance; the manager hands channels the broker at construction.

Position inside `playback_status_changed` reuses the existing monotonic estimation; the frontend interpolates between events, so 1s granularity is invisible.

### Decision 2: Snapshot = manager state + per-channel states, one message

On WS connect, the server sends `{"event": "state_snapshot", "state": <manager.state()>, "channels": {<id>: <channel.state()>}}`. Per-channel states are gathered with `asyncio.gather` and a per-channel try/except so one broken channel cannot break the snapshot. This kills the frontend's initial REST round-trips.

### Decision 3: Frontend store = `useReducer` + context in `App`, no library

`applyEvent` (already in `ws.ts`) extends to the new events and to `state_snapshot`. `App` holds the store and passes slices down; `NowPlaying`, `Home`, `Anime` drop their intervals. Lyrics sync: on `track_changed`, fetch lyrics once (REST stays for one-shot fetches); highlight line from interpolated position. Wallpapers: `Home` refetches the list on `wallpapers_changed` instead of only after rating-driven fetches.

### Decision 4: Commands stay REST, effects arrive via WS

The frontend keeps calling REST for commands (simple, typed errors), but no longer chains a state GET afterwards — the event confirms the effect. Optimistic channel preview stays, reconciled by `channel_changed` (or rolled back on HTTP error).

### Decision 5: Event emission points

- `manager.open/close/set_volume` — already publish; unchanged.
- `manager.command` — after deriving real `playing` (from `fix-critical-bugs`), publish `playing_changed` only on actual change.
- `SpotifyChannel` watcher — `track_changed`, `playback_status_changed`.
- `AnimeChannel` — `episode_changed` in `set_episode`/`next`/`prev` (channels receive the broker; sync methods schedule the publish with `asyncio.create_task`).
- `wallpapers` background tasks — `wallpapers_changed` per completed batch.
- `runtime_config.set` — `config_changed` (broker injected as an optional module hook to avoid import cycles).

### Dependency note

Builds on `fix-critical-bugs` (playing derivation, broker shutdown) and `backend-async-hardening` (background wallpaper tasks are the `wallpapers_changed` source). Apply those first; this change then only *adds* event plumbing.
