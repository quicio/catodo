## ADDED Requirements

### Requirement: Accurate playing state

The manager SHALL derive the global `playing` flag from the current channel's reported status after a transport command, not from the command name. A `toggle` command SHALL NOT be assumed to mean "now playing".

#### Scenario: Toggle while paused

- **WHEN** `toggle` is sent while the channel reports Paused
- **THEN** the manager queries the channel state and reports `playing: true` only if the channel confirms playback.

#### Scenario: Command on unavailable channel

- **WHEN** a transport command targets a channel that cannot report state
- **THEN** `playing` remains unchanged rather than being guessed.

### Requirement: Channel close failure isolation

A failing `close()` on the outgoing channel SHALL NOT prevent opening the next channel, and the failure SHALL be logged.

#### Scenario: Close raises during switch

- **WHEN** switching channels and the outgoing channel's `close()` raises
- **THEN** the new channel still opens, the switch completes, and a warning is logged.
