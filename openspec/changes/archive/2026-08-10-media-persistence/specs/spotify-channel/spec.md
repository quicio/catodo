## ADDED Requirements

### Requirement: Persisted history

The channel SHALL load its track history from disk at startup and save it on change (bounded at 20 entries).

#### Scenario: Pre-seeded history

- **WHEN** the backend starts with a history file present
- **THEN** `GET /api/channels/spotify/history` returns those entries before any new track plays.
