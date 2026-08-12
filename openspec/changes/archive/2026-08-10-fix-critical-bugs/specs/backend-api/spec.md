## ADDED Requirements

### Requirement: Graceful WebSocket shutdown

On server shutdown the system SHALL terminate every WebSocket subscriber loop, including subscribers whose event queue is full. No generator task SHALL be left awaiting a queue that will never be fed.

#### Scenario: Shutdown with idle client

- **WHEN** the server shuts down while a WebSocket client is connected
- **THEN** the client's connection closes and the server task finishes within the shutdown timeout.

#### Scenario: Shutdown with saturated client

- **WHEN** the server shuts down while a subscriber's queue is at capacity
- **THEN** the subscriber is still terminated (its queue may be drained/dropped) rather than hanging forever.

### Requirement: No synthetic domain events

Internal broker control messages SHALL NOT be delivered to WebSocket clients as if they were domain events.

#### Scenario: Client never sees control frames

- **WHEN** a client is connected during shutdown
- **THEN** it never receives a parseable domain event that was not published by the domain (e.g. no `{"event": "_closed"}`).
