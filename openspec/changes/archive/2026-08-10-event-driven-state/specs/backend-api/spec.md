## ADDED Requirements

### Requirement: WebSocket initial snapshot

`WS /api/ws` SHALL send a `state_snapshot` event as the first message on every connection, containing the global state plus the current state of each registered channel.

#### Scenario: Snapshot precedes events

- **WHEN** a client connects while events are being published
- **THEN** the client receives the complete `state_snapshot` before any live event on that connection.
