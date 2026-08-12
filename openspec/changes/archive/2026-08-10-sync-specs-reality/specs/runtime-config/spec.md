## Purpose

Documents the runtime configuration as built: a JSON file in the user data dir that overrides built-in defaults (paths, URLs) without touching the repo, exposed over HTTP.

## ADDED Requirements

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
