## Purpose

Documents the Anime channel as built: it scans a local video directory, exposes episodes grouped by series, and streams the selected episode file over HTTP.

## ADDED Requirements

### Requirement: Library scan

The channel SHALL recursively scan the configured anime directory (runtime key `anime_dir`, default `~/Anime`) for files with video extensions (`.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`). Each episode SHALL record its absolute path, display name, series (top-level directory or "Sin serie"), season (second-level directory when present), and path relative to the base.

#### Scenario: Episodes grouped by series

- **WHEN** `GET /api/channels/anime/state` is called with a populated anime directory
- **THEN** the response includes `count` and `series`, a map of series name to its episodes.

#### Scenario: Empty library

- **WHEN** the anime directory does not exist or has no video files
- **THEN** state reports `count: 0` and `current: null` without error.

### Requirement: Current episode selection

The channel SHALL track a current episode (defaulting to the first scanned) and accept `set_episode` (by relative or absolute path), `next`, and `prev` commands. Next/previous SHALL wrap around cyclically.

#### Scenario: Wrap-around navigation

- **WHEN** the `next` command is issued on the last episode
- **THEN** the first episode becomes current.

### Requirement: Episode streaming

`GET /api/channels/anime/stream` SHALL return the current episode file with a guessed video MIME type. An optional `rel` query parameter SHALL select a different episode before streaming. When no episode is selected or the file is missing, the endpoint SHALL return 404.

#### Scenario: Stream current episode

- **WHEN** `GET /api/channels/anime/stream` is called with a current episode set
- **THEN** the response is the episode file with a `video/*` content type.

### Requirement: Playing flag

The channel SHALL maintain a `playing` flag toggled by `open`/`close` and the `play`/`pause`/`set_episode`/`next`/`prev` commands, and expose it in state.

#### Scenario: Play command sets flag

- **WHEN** a `play` command is issued
- **THEN** subsequent state calls report `playing: true`.
