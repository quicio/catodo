# media-persistence Specification

## Purpose
Defines what Cátodo remembers across restarts, where it lives, and how the shared JSON store behaves under failure.
## Requirements
### Requirement: Shared JSON store

The system SHALL provide one JSON persistence helper used by all persisted features, with atomic writes (temp file + rename), serialized access, and corrupt-file recovery (preserve as `.bak`, start empty). Files live under the data dir (`~/.local/share/catodo/` by default).

#### Scenario: Corrupt store recovery

- **WHEN** a persisted JSON file contains invalid JSON at startup
- **THEN** the feature starts with empty data, the corrupt file is preserved as `<name>.bak`, and a warning is logged.

### Requirement: Anime progress persistence

The system SHALL persist per-episode playback position (seconds) and a watched flag, keyed by episode relative path, saved on pause/seek/close and periodically during playback.

#### Scenario: Resume after restart

- **WHEN** an episode was stopped at 12:34 and the backend restarts
- **THEN** selecting that episode reports the saved position so the player can resume at 12:34.

#### Scenario: Watched flag

- **WHEN** an episode reaches ≥ 95% of its duration (or ends)
- **THEN** it is marked watched and subsequent library states show it as watched.

### Requirement: Spotify history persistence

The track history SHALL persist to disk (bounded at the existing 20 entries) and reload at startup.

#### Scenario: History survives restart

- **WHEN** tracks played, the backend restarts, and `GET /api/channels/spotify/history` is called
- **THEN** the previously played tracks are still listed.

### Requirement: Wallpaper ratings persistence

Wallpaper ratings (`up`/`down`) SHALL be stored server-side, keyed by wallpaper id, and SHALL drive filtering consistently across sessions and browsers.

#### Scenario: Down-rated stays hidden

- **WHEN** a wallpaper is rated down and the browser profile is wiped
- **THEN** the wallpaper remains excluded from rotation.

### Requirement: Bounded growth

Each persisted collection SHALL have an explicit bound (history: 20; progress: one entry per library episode; ratings: one per wallpaper) and SHALL NOT grow unboundedly.

#### Scenario: History cap

- **WHEN** more than 20 tracks accumulate
- **THEN** the oldest entries are dropped, keeping the file size bounded.

