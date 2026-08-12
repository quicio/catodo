## ADDED Requirements

### Requirement: Wallpaper change events

When background downloads complete and the wallpaper set changes, the system SHALL publish `wallpapers_changed` with the new total so clients can refresh listings without polling.

#### Scenario: Download lands

- **WHEN** a background wallpaper download finishes writing a new file
- **THEN** a `wallpapers_changed` event is published with the updated total.
