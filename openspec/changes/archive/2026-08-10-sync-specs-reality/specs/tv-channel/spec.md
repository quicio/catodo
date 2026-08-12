## Purpose

Documents the TV channel as built: a web channel rendered in an in-app webview pointing at a runtime-configurable URL (a DRM-protected TV provider by default).

## ADDED Requirements

### Requirement: Configurable URL

The channel SHALL resolve its URL from the runtime config key `tv_url`, falling back to the built-in default. A `set_url` command SHALL persist a new URL via runtime config.

#### Scenario: State returns effective URL

- **WHEN** `GET /api/channels/tv/state` is called
- **THEN** the response includes the runtime override when set, otherwise the default URL.

#### Scenario: Unknown command

- **WHEN** a command other than `set_url` is sent
- **THEN** it is logged as a passthrough and ignored without error.

### Requirement: Open flag

The channel SHALL track an `open` boolean set by `open()`/`close()` and expose it in state. No external process is managed by this channel.

#### Scenario: Close resets flag

- **WHEN** the channel is closed after being opened
- **THEN** state reports `open: false`.
