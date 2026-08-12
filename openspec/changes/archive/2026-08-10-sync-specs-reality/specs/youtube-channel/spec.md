## Purpose

Documents the YouTube channel as built: a web channel rendered in an in-app webview whose target URL is configurable at runtime, with derived video metadata.

## ADDED Requirements

### Requirement: Configurable URL

The channel SHALL resolve its URL from the runtime config key `youtube_url`, falling back to the built-in default (`https://www.youtube.com/tv`). A `set_url` command SHALL persist a new URL via runtime config.

#### Scenario: Custom URL persists

- **WHEN** `POST /api/channels/youtube/command` is called with `{"command": "set_url", "url": "https://www.youtube.com/embed/<id>"}`
- **THEN** subsequent state calls return the new URL, and it survives a backend restart.

### Requirement: State metadata

The channel state SHALL expose `open`, `url`, `video_id` (extracted from common YouTube URL shapes, or null), and `thumbnail` (derived from the video id, or null).

#### Scenario: State with a video URL

- **WHEN** the configured URL contains a `v=<id>` parameter and state is requested
- **THEN** `video_id` is that id and `thumbnail` is its `i.ytimg.com` maxres URL.

### Requirement: External launch command

The channel SHALL accept a `launch` command that opens the configured URL in the system browser without blocking the event loop.

#### Scenario: Launch

- **WHEN** `POST /api/channels/youtube/command` is called with `{"command": "launch"}`
- **THEN** the configured URL is handed to the system opener (`xdg-open`/`gio`) and the API returns success.
