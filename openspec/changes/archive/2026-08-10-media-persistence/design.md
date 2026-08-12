# Design

## Context

See proposal.md — Why. Three small persistence needs, one shared mechanism. The guiding constraint: no database, no new dependencies, reuse the atomic-write pattern from `fix-critical-bugs`.

## Goals / Non-Goals

**Goals**
- One tiny store module, three consumers, zero schema frameworks.
- All state under the existing data dir.

**Non-Goals**
- No SQLite/ORM, no sync, no migrations engine (version field only).

## Decisions

### Decision 1: `store.py` — one JSON file per collection

`backend/catodo/store.py`: `load(name, default)`, `save(name, data)`, both under a module lock, atomic via temp+rename, corrupt → `.bak` + default. Files: `anime_progress.json`, `spotify_history.json`, `wallpaper_ratings.json`. Each file gets a `{"version": 1, "items": ...}` envelope so future format changes can branch on version without a migration framework.

### Decision 2: Anime progress keyed by relative path

`{rel: {"position": float, "watched": bool, "updated_at": ts}}`. Relative paths survive moving the base dir. The player posts `seek` with its current position every ~10s while playing and on pause/end (frontend timer — cheap, and the channel simply records). Watched threshold: ≥95% of duration when duration is known, or the `ended` signal.

Resume is explicit-position-only: `state()` merges stored progress into episode records; the `<video>` seeks on `loadedmetadata` when `position > 10s` (skip accidental taps at 2s).

### Decision 3: Spotify history saves on append

The channel already dedupes/appends in `_on_track_change`; it now also schedules a store save. Load at construction; corrupt/missing file → empty history (current behavior).

### Decision 4: Ratings move server-side, frontend mirrors

`wallpaper_ratings.json`: `{id: "up"|"down"}`. Endpoints under the existing `/api/wallpapers` router. `Home.tsx` keeps its `ratings` state shape but hydrates from `GET /ratings`, writes via POST, and mirrors to localStorage purely as a render-before-fetch cache. Rotation/filtering logic is unchanged — only the source of truth moves.

### Decision 5: Last channel memory — state only

Persist `current_channel_id` on change (`last_state.json` via the same store) and expose it as `last_channel_id` in global state. The frontend keeps starting at Home; this just stops the data from being lost, and a future "resume session" toggle becomes a frontend-only change.

### Dependency note

Depends on `fix-critical-bugs` (atomic-write pattern, restored `RATINGS_FILE`-style constant lives in `store.py` paths). Independent from `event-driven-state`, but if both land, progress saves may also emit events — explicitly out of scope here to keep the diff small.
