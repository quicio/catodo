## ADDED Requirements

### Requirement: Remote adopts active theme

The remote SHALL fetch the resolved active theme and personalization overrides from `/api/config` on load and apply the color palette and corner radius as CSS variables on its own `:root`, replacing its fixed palette. A `config_changed` event for `theme`, `themes`, or `theme_overrides` SHALL re-apply the appearance without a reload.

#### Scenario: Remote matches TV

- **WHEN** the remote is opened while a non-default theme is active
- **THEN** the remote renders with that theme's palette and radius.

#### Scenario: Live theme update

- **WHEN** the theme is changed on the TV while the remote is open
- **THEN** the remote re-renders with the new palette within a second.

#### Scenario: Config unreachable at load

- **WHEN** the remote cannot fetch the config
- **THEN** it falls back to the built-in default theme and keeps working.
