## MODIFIED Requirements

### Requirement: Theme selector in UI

The frontend SHALL expose a theme gallery in the Home settings panel listing the available themes (built-in + custom) with a visual preview per theme (palette swatches and typography sample). Selecting a theme SHALL persist it via `POST /api/config` and apply it immediately. The panel SHALL also expose the granular personalizations (font, icon pack, radius, density, effects) with a per-dimension "theme default" option.

#### Scenario: Select theme

- **WHEN** the user picks a theme in the gallery
- **THEN** the UI applies the full theme (all dimensions) at once and the backend stores the choice.

#### Scenario: Theme list includes custom themes

- **WHEN** custom themes are defined in config.json
- **THEN** they appear in the gallery alongside the built-in ones.

#### Scenario: Adjust a personalization

- **WHEN** the user changes the radius preset in the personalization section
- **THEN** the UI re-renders with the new corner radius immediately and the override is persisted.

#### Scenario: Switch icon pack

- **WHEN** the user picks a different icon pack in the personalization section
- **THEN** every icon in the kiosk re-renders from that pack immediately and the override is persisted.

### Requirement: Apply theme from config

The frontend SHALL read the active theme and personalization overrides at boot (from `/api/config` or the `config_changed` event) and apply every dimension (colors, typography, shape, density, effects, icons) to `:root` and the icon registry. A `config_changed` event with key `theme`, `themes`, `theme_crt_enabled`, or `theme_overrides` SHALL re-apply the appearance without a reload.

#### Scenario: Boot applies theme

- **WHEN** the app loads and the config reports a non-default theme or overrides
- **THEN** the UI renders with that appearance.

#### Scenario: Config change re-applies

- **WHEN** a `config_changed` event for `theme` or `theme_overrides` arrives
- **THEN** the UI switches tokens live.

## ADDED Requirements

### Requirement: Token-driven styling

Kiosk components SHALL consume theme variables for color, font family, corner radius and spacing, and SHALL render icons through the semantic icon registry. Hardcoded color, font or radius literals — and direct icon-library imports — in components are defects, except inside theme definitions, the registry itself and `:root` fallback defaults.

#### Scenario: Audit finds no stray literals

- **WHEN** the kiosk source is audited for hardcoded hex/rgba color literals, fixed font-family/border-radius values and direct icon-library imports outside theme definitions, the icon registry and `:root` defaults
- **THEN** none remain in component rendering paths.

#### Scenario: Readable in every theme

- **WHEN** any built-in theme is active
- **THEN** primary text, accents and channel colors render with adequate contrast on every channel view.
