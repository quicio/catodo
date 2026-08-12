## Purpose

Replaces duck-typed `hasattr` checks with explicit, typed channel capabilities that channels declare and clients can discover through the API.

## ADDED Requirements

### Requirement: Declared capabilities

Each channel SHALL declare its optional capabilities (e.g. `stream`, `episodes`, `history`) in its serialized form returned by `GET /api/channels` and `GET /api/state`.

#### Scenario: Capability discovery

- **WHEN** `GET /api/channels` is called
- **THEN** each channel object includes a `capabilities` array; the anime channel lists `["stream", "episodes"]` and the spotify channel lists `["history"]`.

### Requirement: Capability-driven endpoints

The API SHALL dispatch the `episodes`, `history`, and `stream` endpoints based on declared capabilities backed by typed interfaces, not attribute sniffing. Channels lacking a capability SHALL keep returning the current fallback shapes (empty collections / 404).

#### Scenario: Unsupported capability

- **WHEN** `GET /api/channels/tv/episodes` is called
- **THEN** the response is 200 with `{"id": "tv", "episodes": []}`.

#### Scenario: Stream without capability

- **WHEN** a stream is requested for a channel that does not declare `stream`
- **THEN** the response is 404 with detail "channel has no stream".

### Requirement: Frontend feature discovery

The frontend SHALL use the declared `capabilities` to render capability-specific UI (episode lists, history strips) instead of hardcoding channel ids for those features.

#### Scenario: New capable channel

- **WHEN** a new channel declaring `episodes` is registered in the backend without frontend changes
- **THEN** the channel view offers episode browsing for it.
