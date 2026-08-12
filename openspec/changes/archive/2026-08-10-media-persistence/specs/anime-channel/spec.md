## ADDED Requirements

### Requirement: Progress reporting and seek-on-load

The channel state and episode records SHALL include saved position and watched flag. The channel SHALL accept a `seek` command carrying the current position for periodic saves.

#### Scenario: Episode records carry progress

- **WHEN** `GET /api/channels/anime/state` is called
- **THEN** each episode record includes `position_seconds` and `watched`.

#### Scenario: Save position

- **WHEN** a `{"command": "seek", "position": 754}` command arrives for the current episode
- **THEN** the position is persisted for that episode.

### Requirement: Resume in the player

The frontend SHALL seek to the saved position when an episode with saved progress starts playing, and SHALL show a watched/resume indicator in the episode list.

#### Scenario: Resume indicator

- **WHEN** the episode list renders an episode with saved progress below the watched threshold
- **THEN** it shows a resume indicator; watched episodes show a watched indicator.
