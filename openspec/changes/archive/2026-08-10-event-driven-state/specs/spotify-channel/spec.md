## ADDED Requirements

### Requirement: Playback events

The channel SHALL publish `track_changed` (with title, artist, album, art URL) when the MPRIS track id changes, and `playback_status_changed` (with status and position) when playback status flips between Playing/Paused/Stopped.

#### Scenario: New song pushes event

- **WHEN** the user skips to a new track in Spotify
- **THEN** connected clients receive `track_changed` within one watch interval, with the new metadata.

#### Scenario: No duplicate events

- **WHEN** the watcher observes the same state twice in a row
- **THEN** no event is published for the unchanged observation.
