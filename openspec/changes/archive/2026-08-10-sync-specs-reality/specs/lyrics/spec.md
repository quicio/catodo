## Purpose

Documents the lyrics API as built: server-side lyrics lookup against LRCLib with an exact-match endpoint, a search fallback, and synced-lyrics parsing.

## ADDED Requirements

### Requirement: Lyrics lookup

`GET /api/lyrics` SHALL require non-empty `artist` and `track` query parameters and accept an optional `duration` in seconds. It SHALL first attempt an exact LRCLib match; on failure it SHALL fall back to LRCLib search, picking the candidate with the closest duration when `duration` is given. When nothing is found it SHALL return 404.

#### Scenario: Exact match

- **WHEN** LRCLib has an exact match for the artist/track
- **THEN** the response contains `track`, `artist`, `album`, `duration`, `synced`, `lines`, `plain`, `source: "lrclib"`, and `id`.

#### Scenario: Search fallback picks closest duration

- **WHEN** the exact lookup fails, search returns multiple candidates, and `duration` is provided
- **THEN** the candidate with the smallest duration difference is returned.

#### Scenario: Not found

- **WHEN** both exact and search lookups yield nothing
- **THEN** the API responds 404 with detail "lyrics not found".

#### Scenario: Missing parameters

- **WHEN** `artist` or `track` is empty or whitespace
- **THEN** the API responds 400.

### Requirement: Synced lyrics parsing

Synced (LRC) lyrics SHALL be parsed into `lines`: a list of `{t, text}` where `t` is the timestamp in seconds. Unparseable lines SHALL be skipped. `synced` SHALL be true only when at least one timed line exists.

#### Scenario: LRC parsing

- **WHEN** the upstream response contains synced lyrics like `[01:12.50] hello`
- **THEN** `lines` includes `{"t": 72.5, "text": "hello"}` and `synced` is true.

### Requirement: Upstream resilience

Upstream failures (network, timeout, non-200) SHALL NOT raise to the caller; they SHALL fall through to the next strategy and ultimately to a 404.

#### Scenario: LRCLib down

- **WHEN** LRCLib is unreachable
- **THEN** the API responds 404 rather than 500.
