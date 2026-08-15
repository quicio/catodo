## MODIFIED Requirements

### Requirement: Overrideable keys

The runtime config SHALL support overriding these keys: `anime_dir`, `arcade_dir`, `arcade_emulators`, `arcade_default_emulator`, `arcade_boxart_enabled`, `per_channel_volume_enabled`, `per_channel_volume_default`, `channel_audio_sinks`, `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`, `mqtt_topic_prefix`, `tv_url`, `youtube_url`, `crunchyroll_url`, `spotify_embed_url`, `host`, `port`, `plugin_repo`, `libraries`, `idle_screensaver_seconds`, `idle_sleep_seconds`, `theme`, `themes`, `theme_crt_enabled`. Reading an unset key SHALL return the built-in default.

#### Scenario: Default when unset

- **WHEN** a key has no stored override
- **THEN** reads return the value from application settings (env or built-in).

#### Scenario: Theme defaults

- **WHEN** `theme` has no stored override
- **THEN** reads return the default theme id; `themes` returns the built-in themes plus any custom ones; `theme_crt_enabled` defaults to `true`.
