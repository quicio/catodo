## ADDED Requirements

### Requirement: Config change events

Persisting a runtime config override SHALL publish `config_changed` with the key and effective value, so open UIs can react without reloading.

#### Scenario: URL override propagates

- **WHEN** `POST /api/config` sets `tv_url`
- **THEN** connected clients receive `config_changed` with `{"key": "tv_url", "value": <new value>}`.
