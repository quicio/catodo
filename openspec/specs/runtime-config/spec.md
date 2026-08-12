# runtime-config Specification

## Purpose
Documents the runtime configuration as built: a JSON file in the user data dir that overrides built-in defaults (paths, URLs) without touching the repo, exposed over HTTP.
## Requirements
### Requirement: Overrideable keys

The runtime config SHALL support overriding these keys only: `anime_dir`, `tv_url`, `youtube_url`, `spotify_embed_url`, `host`, `port`. Reading an unset key SHALL return the built-in default.

#### Scenario: Default when unset

- **WHEN** a key has no stored override
- **THEN** reads return the value from application settings (env or built-in).

### Requirement: Persistence

Overrides SHALL be stored as JSON at `<data_dir>/config.json`, created on first use, and SHALL survive backend restarts.

#### Scenario: Restart keeps overrides

- **WHEN** an override is written and the backend restarts
- **THEN** the override is still returned.

### Requirement: Config API

`GET /api/config` SHALL return every supported key with its effective value. `POST /api/config` SHALL accept a JSON object and persist only the supported keys, ignoring unknown ones, and return the full effective config.

#### Scenario: Unknown keys ignored

- **WHEN** POSTing `{"tv_url": "https://example.com", "bogus": 1}`
- **THEN** `tv_url` is stored, `bogus` is dropped, and the response reflects the effective config.

### Requirement: Consumers resolve at use time

Channels SHALL resolve overridable values (URLs, directories) through the runtime config at the moment of use, so an override takes effect without editing code.

#### Scenario: TV channel follows override

- **WHEN** `tv_url` is overridden and the TV channel state is requested
- **THEN** the channel reports the overridden URL.

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

### Requirement: Config change events

Persisting a runtime config override SHALL publish `config_changed` with the key and effective value, so open UIs can react without reloading.

#### Scenario: URL override propagates

- **WHEN** `POST /api/config` sets `tv_url`
- **THEN** connected clients receive `config_changed` with `{"key": "tv_url", "value": <new value>}`.

