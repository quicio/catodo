## ADDED Requirements

### Requirement: Theme selector in UI

The frontend SHALL expose a theme selector in the Home view listing the available themes (predefined + custom). Selecting a theme SHALL persist it via `POST /api/config` and apply it immediately.

#### Scenario: Select theme

- **WHEN** the user picks a theme in the selector
- **THEN** the UI applies the theme tokens at once and the backend stores the choice.

#### Scenario: Theme list includes custom themes

- **WHEN** custom themes are defined in config.json
- **THEN** they appear in the selector alongside the predefined ones.

### Requirement: Apply theme from config

The frontend SHALL read the active theme at boot (from `/api/config` or the `config_changed` event) and apply its tokens to `:root`. A `config_changed` event with key `theme`, `themes`, or `theme_crt_enabled` SHALL re-apply the theme without a reload.

#### Scenario: Boot applies theme

- **WHEN** the app loads and the config reports a non-default theme
- **THEN** the UI renders with that theme's tokens.

#### Scenario: Config change re-applies

- **WHEN** a `config_changed` event for `theme` arrives
- **THEN** the UI switches tokens live.

### Requirement: CRT effects follow config

The frontend SHALL toggle the CRT scanlines/vignette based on `theme_crt_enabled` (default on), even if the theme itself does not override it.

#### Scenario: CRT disabled via config

- **WHEN** `theme_crt_enabled` is set to `false`
- **THEN** no scanlines or vignette render on any channel.

#### Scenario: CRT enabled via config

- **WHEN** `theme_crt_enabled` is `true`
- **THEN** scanlines and vignette render on all channels except screen cast.
