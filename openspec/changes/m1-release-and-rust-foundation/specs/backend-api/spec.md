## ADDED Requirements

### Requirement: Version endpoint

The system SHALL expose `GET /api/version` returning `200 OK` and JSON `{"version": "<semver>"}`. The reported version SHALL be the canonical product version from the repository `VERSION` file and SHALL match the version reported by `catodo --version` and the Rust server.

#### Scenario: Version matches release

- **WHEN** `GET /api/version` is called on a build of version `0.2.0`
- **THEN** the response is `200 OK` with body `{"version":"0.2.0"}`

#### Scenario: Version is not cached across upgrades

- **WHEN** the backend is upgraded and restarted with a new version
- **THEN** `GET /api/version` reports the new version without requiring a client cache purge
