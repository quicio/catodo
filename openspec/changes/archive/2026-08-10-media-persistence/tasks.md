# Tasks

## 1. Shared store

- [x] 1.1 Create `backend/catodo/store.py`: `load(name, default)`/`save(name, data)` with atomic writes, a lock, `.bak` recovery, and a `version` envelope.
- [x] 1.2 Verify: write + read back each file; corrupt one by hand and confirm recovery + `.bak`.

## 2. Anime progress

- [x] 2.1 Channel: load `anime_progress.json` at construction; merge `position_seconds`/`watched` into episode records in `state()`; handle `seek` (persist position) and mark watched at ≥95% or on end signal.
- [x] 2.2 Frontend: post `seek` every ~10s during playback and on pause/end; seek to saved position on `loadedmetadata` when > 10s; add resume/watched indicators to the episode list.
- [x] 2.3 Verify: stop an episode mid-way, restart backend, reopen → playback resumes near the stop point; finishing an episode flags it watched.

## 3. Spotify history on disk

- [x] 3.1 Load `spotify_history.json` at construction; save on every append (bounded at 20).
- [x] 3.2 Verify: play tracks, restart backend, `GET /api/channels/spotify/history` still lists them.

## 4. Wallpaper ratings server-side

- [x] 4.1 Backend: `GET/POST /api/wallpapers/ratings` over `wallpaper_ratings.json` (`none` deletes).
- [x] 4.2 Frontend `Home.tsx`: hydrate ratings from the API, write through it, keep localStorage only as a pre-fetch mirror.
- [x] 4.3 Verify: rate down, wipe localStorage, reload → still filtered; a second browser profile shows the same ratings.

## 5. Last channel memory

- [x] 5.1 Persist `current_channel_id` on change; expose `last_channel_id` in `GET /api/state` (frontend behavior unchanged).
- [x] 5.2 Verify: open a channel, restart, `/api/state` reports it as `last_channel_id`.

## 6. Regression pass

- [x] 6.1 Walk every scenario in this change's specs; confirm bounds hold (history ≤ 20, ratings/progress keyed by id) and record results.
