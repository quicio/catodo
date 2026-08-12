# Media Persistence

## Why

Cátodo runs 24/7 but remembers nothing across restarts. Spotify's track history lives in an in-memory deque; wallpaper ratings live in the browser's localStorage (lost on profile wipe, invisible to the backend that picks the wallpapers); and the Anime channel — a video library — has no concept of "where did I stop" or "what have I seen". A TV that forgets everything on reboot is not much of a TV.

## What Changes

- **Anime watch progress**: per-episode saved position (resume where you left off) and watched flags, stored in the data dir; the frontend seeks to the saved position on load and offers a "resume" indicator per episode.
- **Spotify history on disk**: the 20-track history persists to `<data_dir>/spotify_history.json` and reloads on startup.
- **Wallpaper ratings server-side**: ratings move from localStorage to `<data_dir>/wallpaper_ratings.json` with `GET/POST /api/wallpapers/ratings`; the rotation and the fetch logic consume backend ratings. (Revives the `RATINGS_FILE` idea, done properly; frontend keeps working offline with a local cache mirror.)
- **Unified persistence helper**: one small JSON-store module (atomic writes, reusing the `fix-critical-bugs` pattern) that all three features share.
- **Last channel memory**: on startup, global state can report the last open channel so the shell *could* restore context (the frontend keeps its current always-start-at-Home behavior by default).

## Capabilities

### New Capabilities

- `media-persistence`: the shared JSON store, what gets persisted, retention, and failure behavior.

### Modified Capabilities

- `anime-channel`: resume position + watched flags (ADDED ops).
- `spotify-channel`: history survives restarts (ADDED ops).
- `wallpapers`: ratings API + server-side storage, including its HTTP endpoints (ADDED ops).

## Non-goals

- A real database (SQLite): JSON files are enough at this scale; the store module leaves the door open.
- Cross-device sync or multi-user profiles.
- Scrobbling to external services (last.fm).
- Bookmarks/favorites beyond watched+resume.

## Impact

- New `backend/catodo/store.py`; `channels/anime.py`, `channels/spotify.py`, `wallpapers.py`, `api.py`.
- `frontend/src/channels/Anime.tsx` (resume seek + watched UI), `Home.tsx` (ratings via API with local mirror).
- Data lands in `~/.local/share/catodo/` — outside the repo, already the convention.
