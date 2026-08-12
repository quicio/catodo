# Tasks

## 1. Broker plumbing

- [x] 1.1 Pass the broker to channels at registration (constructor or `attach_broker`), so any channel can publish.
- [x] 1.2 WS endpoint: send the `state_snapshot` message first on connect (manager state + gathered per-channel states, per-channel try/except).
- [x] 1.3 Verify: `websocat ws://127.0.0.1:8765/api/ws` shows the snapshot as the first frame.

## 2. Spotify watcher

- [x] 2.1 Add a lifespan-owned asyncio task in `SpotifyChannel`: 1s MPRIS read, diff on `(track_id, status)`, publish `track_changed`/`playback_status_changed`; stop cleanly on shutdown.
- [x] 2.2 Verify: skip a track in Spotify desktop → the WS client sees `track_changed` with the new title within ~1s; repeated identical polls emit nothing.

## 3. Remaining publishers

- [x] 3.1 Anime: publish `episode_changed` from `set_episode`/`next`/`prev`.
- [x] 3.2 Wallpapers: publish `wallpapers_changed` when a background download batch completes (depends on `backend-async-hardening`).
- [x] 3.3 Runtime config: publish `config_changed` on successful `set`.
- [x] 3.4 Verify: trigger each path and observe the matching event on the WS.

## 4. Frontend store

- [x] 4.1 Extend `applyEvent` for all new events + `state_snapshot`; wire `useWebSocket` in `App` with a `useReducer` store; provide slices via context/props.
- [x] 4.2 Delete the four polling loops (`App` 1s, `Home` 2s, `NowPlaying` 500ms + history 5s, `Anime` 4s) and the post-command state re-fetches; render from the store.
- [x] 4.3 Position interpolation for lyrics/progress from the last event's position + wall clock; resync on each status/track event.
- [x] 4.4 Optimistic switch: keep the local preview, roll back on HTTP error, confirm on `channel_changed`.
- [x] 4.5 Verify: with the Network tab open, idle UI produces no periodic requests; switching tracks in Spotify updates Home and Now Playing without any fetch.

## 5. Regression pass

- [x] 5.1 Walk every scenario in this change's specs (snapshot-first, single watcher, quiet idle, reconnect re-render) and record results.
