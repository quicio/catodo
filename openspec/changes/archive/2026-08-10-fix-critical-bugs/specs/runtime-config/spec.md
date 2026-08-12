## ADDED Requirements

### Requirement: Atomic writes

Config writes SHALL be atomic: data is written to a temporary file in the same directory and then renamed over `config.json`. A crash during save SHALL NOT leave a truncated config.

#### Scenario: Crash mid-save

- **WHEN** the process is killed while saving
- **THEN** on next start the config file is either the old complete version or the new complete version, never partial.

### Requirement: Serialized access

Concurrent reads/writes SHALL be serialized with a lock so simultaneous API calls cannot interleave a load-modify-save cycle.

#### Scenario: Concurrent updates

- **WHEN** two POSTs to `/api/config` arrive concurrently with different keys
- **THEN** both keys are present afterwards (no lost update).

### Requirement: Corrupt file recovery

When `config.json` exists but is not valid JSON, the system SHALL back it aside (e.g. `config.json.bak`) and start from defaults rather than crashing or silently discarding.

#### Scenario: Corrupt config at startup

- **WHEN** the config file contains invalid JSON
- **THEN** the backend starts with defaults, preserves the corrupt file as a `.bak`, and logs a warning.
