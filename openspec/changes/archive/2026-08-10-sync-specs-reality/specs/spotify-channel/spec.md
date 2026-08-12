## Purpose

Documents the Spotify channel as built: it controls the desktop Spotify client over MPRIS and exposes now-playing state, an estimated playback position, and an in-memory track history.

## ADDED Requirements

### Requirement: MPRIS control

The Spotify channel SHALL control the desktop Spotify client through the MPRIS DBus interface (`org.mpris.MediaPlayer2.spotify`). `open()` SHALL send Play; `close()` SHALL send Pause.

#### Scenario: Open channel with Spotify running

- **WHEN** the channel is opened and the Spotify desktop client is on the session bus
- **THEN** a Play method call is issued over MPRIS.

#### Scenario: Backend without Spotify

- **WHEN** any channel operation is attempted and Spotify is not reachable
- **THEN** the operation completes without raising, and state reports `available: false`.

### Requirement: Now-playing state

The channel state SHALL expose `status` (PlaybackStatus), `title`, `artist`, `album`, `art_url`, an `available` flag, and a `position` in seconds estimated between polls.

#### Scenario: State while playing

- **WHEN** `GET /api/channels/spotify/state` is called while a track plays
- **THEN** the response includes `available: true`, `status: "Playing"`, track metadata, and a monotonically increasing `position`.

### Requirement: Track history

The channel SHALL keep an in-memory history of the last 20 tracks played, newest first, with `track_id`, `spotify_uri` (when derivable), title, artist, album, art URL, and play timestamp. Duplicate track detections within 2 seconds SHALL be collapsed.

#### Scenario: History endpoint

- **WHEN** `GET /api/channels/spotify/history` is called after several tracks played
- **THEN** the response is `{"id": "spotify", "items": [...]}` newest first, capped at 20 items.

### Requirement: Commands

The channel SHALL accept the commands `play`, `pause`, `next`, `prev`, `toggle`, `volume` (level 0.0–1.0), and `open_uri` (Spotify URI opened via the system handler). Unknown commands SHALL be logged and ignored.

#### Scenario: Toggle playback

- **WHEN** `POST /api/channels/spotify/command` is called with `{"command": "toggle"}`
- **THEN** playback pauses if the last known status was Playing, otherwise it resumes.

#### Scenario: Open a history entry

- **WHEN** a command `{"command": "open_uri", "uri": "spotify:track:..."}` is received
- **THEN** the URI is opened with the system handler (`xdg-open`/`gio`), bringing Spotify to that track.
