## ADDED Requirements

### Requirement: Cached library scan

The channel SHALL cache scan results and rescan at most once per TTL (default 60s) or when explicitly refreshed, and SHALL run the filesystem walk off the event loop thread.

#### Scenario: Repeated state polls

- **WHEN** state is requested twice within the TTL
- **THEN** the second response is served from cache without walking the filesystem again.

#### Scenario: Manual refresh

- **WHEN** a `refresh` command is issued
- **THEN** the next state reflects the current directory contents.

### Requirement: Range-enabled streaming

The stream endpoint SHALL honor HTTP `Range` headers with `206 Partial Content`, `Content-Range`, and `Accept-Ranges: bytes`, and SHALL return `416` for unsatisfiable ranges.

#### Scenario: Seek request

- **WHEN** a request arrives with `Range: bytes=1000000-`
- **THEN** the response is 206 starting at byte 1000000 with correct `Content-Range`.

#### Scenario: Full request

- **WHEN** no Range header is present
- **THEN** the response is 200 with the full file and an `Accept-Ranges: bytes` header.

### Requirement: Episode selection via command only

Episode selection SHALL happen exclusively through the `set_episode` command; the stream endpoint SHALL NOT mutate channel state.

#### Scenario: GET is side-effect free

- **WHEN** the stream endpoint is called repeatedly with any query parameters
- **THEN** the current episode remains unchanged.

## REMOVED Requirements

### Requirement: Episode streaming

**Reason**: The `rel` query parameter made a GET request mutate channel state (non-idempotent, race-prone). Selection now lives in the `set_episode` command; streaming keeps its Range-enabled form per the added requirements above.

**Migration**: Clients calling `GET /api/channels/anime/stream?rel=<path>` must instead `POST /api/channels/anime/command` with `{"command": "set_episode", "episode": "<path>"}` and then GET the stream without parameters.
