## ADDED Requirements

### Requirement: Ratings API

The system SHALL expose `GET /api/wallpapers/ratings` (all ratings) and `POST /api/wallpapers/ratings` (`{"id": <wallpaper id>, "rating": "up"|"down"|"none"}`), persisting them server-side. `none` SHALL remove the rating.

#### Scenario: Rate down

- **WHEN** POSTing `{"id": "abc123", "rating": "down"}`
- **THEN** subsequent GETs include the rating and rotation excludes `abc123`.

### Requirement: Frontend rating sync

The frontend SHALL read ratings from the backend and write through it, keeping a local mirror only as an offline/render cache.

#### Scenario: Two browsers agree

- **WHEN** a wallpaper is rated in one browser and another browser loads Home
- **THEN** both show the same rating state.
