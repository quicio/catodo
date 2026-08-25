## MODIFIED Requirements

### Requirement: MPRIS control

The Spotify channel SHALL control the desktop Spotify client through the MPRIS DBus interface (`org.mpris.MediaPlayer2.spotify`) when DBus is available on the platform. `open()` SHALL send Play; `close()` SHALL send Pause. The channel SHALL be omitted from the channel registry on platforms where DBus is not available (macOS by default); in that case `GET /api/channels` SHALL NOT include `spotify`, and the frontend SHALL show the slot as unavailable without an error.

#### Scenario: Open channel with Spotify running

- **WHEN** the channel is opened and the Spotify desktop client is on the session bus
- **THEN** a Play method call is issued over MPRIS.

#### Scenario: Backend without Spotify

- **WHEN** any channel operation is attempted and Spotify is not reachable
- **THEN** the operation completes without raising, and state reports `available: false`.

#### Scenario: Channel omitted on platform without DBus

- **WHEN** the backend starts on macOS (no DBus session bus by default)
- **THEN** `spotify` is not present in `GET /api/channels`, no Spotify channel instance is constructed, and a single info log line "Spotify channel disabled: DBus not available on this platform" is emitted. The frontend SHALL display the channel slot as "not available on this platform" rather than failing.