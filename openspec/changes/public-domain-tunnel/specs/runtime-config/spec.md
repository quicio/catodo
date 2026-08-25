## MODIFIED Requirements

### Requirement: Overrideable keys

The runtime config SHALL support overriding these keys: `anime_dir`, `arcade_dir`, `arcade_emulators`, `arcade_default_emulator`, `arcade_boxart_enabled`, `resume_last_channel`, `per_channel_volume_enabled`, `per_channel_volume_default`, `channel_audio_sinks`, `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`, `mqtt_topic_prefix`, `tv_url`, `youtube_url`, `crunchyroll_url`, `spotify_embed_url`, `host`, `port`, `plugin_repo`, `libraries`, `idle_screensaver_seconds`, `idle_sleep_seconds`, `theme`, `themes`, `theme_overrides`, `home_layout_id`, `public_domain`, `tunnel_enabled`, `tunnel_provider`, `tunnel_token_path`, `tunnel_require_token`. Reading an unset key SHALL return the built-in default.

#### Scenario: Default when unset

- **WHEN** a key has no stored override
- **THEN** reads return the value from application settings (env or built-in).

#### Scenario: Theme defaults

- **WHEN** `theme` has no stored override
- **THEN** reads return the default theme id; `themes` returns the built-in themes plus any custom ones.

#### Scenario: Home layout default

- **WHEN** `home_layout_id` has no stored override
- **THEN** reads return `"default"`.

#### Scenario: Home layout unknown value sanitized

- **WHEN** `home_layout_id` is set to a value not present in the frontend registry
- **THEN** reads return `"default"` (no error, no leak of the invalid id).

#### Scenario: Tunnel defaults

- **WHEN** none of the tunnel keys has a stored override
- **THEN** reads return `public_domain=""`, `tunnel_enabled=false`, `tunnel_provider="cloudflare"`, `tunnel_token_path=""`, `tunnel_require_token=true`.

#### Scenario: Invalid public_domain rejected

- **WHEN** a POST sets `public_domain` to a value that is not a bare hostname (contains spaces, scheme, path, or trailing slash)
- **THEN** the request returns `400` and no other tunnel key in the same payload is persisted (atomic write of the tunnel group).

#### Scenario: Unknown tunnel_provider rejected

- **WHEN** a POST sets `tunnel_provider` to a value that no registered provider implements
- **THEN** the request returns `400` and no other tunnel key in the same payload is persisted.

### Requirement: Config API

`GET /api/config` SHALL return every supported key with its effective value. `POST /api/config` SHALL accept a JSON object and persist only the supported keys, ignoring unknown ones, and return the full effective config.

#### Scenario: Unknown keys ignored

- **WHEN** POSTing `{"tv_url": "https://example.com", "bogus": 1}`
- **THEN** `tv_url` is stored, `bogus` is dropped, and the response reflects the effective config.

#### Scenario: Tunnel keys round-trip

- **WHEN** POSTing `{"public_domain": "catodo.example.com", "tunnel_enabled": true, "tunnel_provider": "cloudflare", "tunnel_token_path": "/home/me/.cloudflared/abc.json", "tunnel_require_token": true}`
- **THEN** the keys are persisted and a subsequent `GET /api/config` returns them with their effective (normalized) values.

### Requirement: Config change events

Persisting a runtime config override SHALL publish `config_changed` with the key and effective value, so open UIs can react without reloading.

#### Scenario: URL override propagates

- **WHEN** `POST /api/config` sets `tv_url`
- **THEN** connected clients receive `config_changed` with `{"key": "tv_url", "value": <new value>}`.

#### Scenario: Tunnel override propagates

- **WHEN** `POST /api/config` sets `public_domain` or `tunnel_enabled` or `tunnel_provider`
- **THEN** connected clients receive `config_changed` with the new effective value, so the Settings UI and the tunnel manager can react in real time.
