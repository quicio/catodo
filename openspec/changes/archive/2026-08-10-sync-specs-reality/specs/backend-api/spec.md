## ADDED Requirements

### Requirement: Channel close endpoint

The system SHALL expose `POST /api/channels/{id}/close` which closes the channel and emits a `channel_closed` event. Closing the current channel SHALL leave the system with no current channel.

#### Scenario: Close current channel

- **WHEN** the current channel is closed via the API
- **THEN** global state reports `current_channel_id: null`.

#### Scenario: Unknown channel

- **WHEN** close is called for an unregistered id
- **THEN** the response is 404.

### Requirement: Per-channel state endpoint

The system SHALL expose `GET /api/channels/{id}/state` returning the channel-specific state object, or 404 for unknown ids.

#### Scenario: Spotify state shape

- **WHEN** `GET /api/channels/spotify/state` is called
- **THEN** the response contains at least `id` and `available`.

### Requirement: Channel capability endpoints

The system SHALL expose `GET /api/channels/{id}/episodes` and `GET /api/channels/{id}/history`. Channels without those capabilities SHALL return empty collections rather than an error.

#### Scenario: Channel without episodes

- **WHEN** episodes are requested for a channel with no episode support
- **THEN** the response is `{"id": <id>, "episodes": []}` with status 200.

### Requirement: Channel stream endpoint

The system SHALL expose `GET /api/channels/{id}/stream` for channels with a current streamable item, returning the underlying file. Channels without streaming support, or with no current item, SHALL return 404.

#### Scenario: No stream support

- **WHEN** a stream is requested for a channel without streaming
- **THEN** the response is 404 with detail "channel has no stream".

### Requirement: Volume endpoint parsing

`POST /api/volume?level=...` SHALL accept an integer 0–100 or the relative tokens `+`/`-` (±5 steps). The `+` token SHALL be parsed from the raw query string so it is not decoded as a space. Missing or invalid levels SHALL return 400.

#### Scenario: Relative plus

- **WHEN** `POST /api/volume?level=+` is called at volume 50
- **THEN** the response reports volume 55.

#### Scenario: Missing level

- **WHEN** the level parameter is absent
- **THEN** the response is 400.

### Requirement: Config endpoints

The system SHALL expose `GET /api/config` (full effective config) and `POST /api/config` (persist supported keys only) as specified in the runtime-config capability.

#### Scenario: Round trip

- **WHEN** a supported key is POSTed and then GET is called
- **THEN** the GET response includes the new value.

### Requirement: Global state shape

`GET /api/state` SHALL return `current_channel_id`, `playing`, `volume`, `available_channels`, `history` (last channel ids, capped at 16), and `uptime_seconds`.

#### Scenario: Uptime increases

- **WHEN** state is requested twice with a delay
- **THEN** the second `uptime_seconds` is greater than or equal to the first.
