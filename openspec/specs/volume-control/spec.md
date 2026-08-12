# volume-control Specification

## Purpose
Makes volume real: the global volume endpoint drives the system mixer and reflects the actual output level, instead of storing a cosmetic number.
## Requirements
### Requirement: System mixer integration

The system SHALL apply volume changes to the default audio sink using an available system mixer tool (`wpctl` or `pactl`, detected at runtime). When no mixer tool is available, the system SHALL fall back to forwarding volume to the current media channel (e.g. Spotify via MPRIS) and keep the in-memory value as last resort.

#### Scenario: Set absolute volume

- **WHEN** `POST /api/volume?level=70` is called on a system with PipeWire
- **THEN** the default sink volume is set to 70% and the response reports 70.

#### Scenario: Relative step

- **WHEN** `POST /api/volume?level=+` is called
- **THEN** the sink volume increases by 5 percentage points, clamped at 100.

#### Scenario: No mixer available

- **WHEN** neither `wpctl` nor `pactl` exists and volume is set
- **THEN** the volume is forwarded to the current media channel when possible, state still reports the value, and no error is raised.

### Requirement: Startup read-back

At startup the system SHALL initialize its volume from the actual mixer level when a mixer tool is available, instead of a hardcoded default.

#### Scenario: Cold start

- **WHEN** the backend starts with the system mixer at 35%
- **THEN** `GET /api/state` reports `volume: 35`.

### Requirement: Mixer failure resilience

A failing mixer command SHALL NOT break the API call; the endpoint SHALL keep returning the tracked value and log the failure.

#### Scenario: Mixer command fails

- **WHEN** the mixer tool exits non-zero during a volume set
- **THEN** the API still responds 200 with the tracked volume and the error is logged.

### Requirement: Media elements follow volume

The frontend SHALL apply the global volume to local media elements (the Anime video player) on volume change.

#### Scenario: Anime playback volume

- **WHEN** the user presses `+` while an episode plays
- **THEN** the video element's audible volume changes accordingly.

