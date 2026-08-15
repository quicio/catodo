## Purpose

Sistema de apariencia de Cátodo: temas multidimensionales (color, tipografía, forma, densidad, efectos, iconos) con 10 temas predefinidos, personalizaciones granulares por el usuario y temas custom con herencia, aplicados en vivo en kiosk y remote.

## ADDED Requirements

### Requirement: Modelo de tema multidimensional

A theme SHALL define six dimensions: `colors` (palette tokens), `typography` (display and mono font families), `shape` (corner-radius preset), `density` (spacing and font-size scale), `effects` (CRT scanlines/vignette, glow) and `icons` (icon pack id). Colors, typography, shape, density and effects SHALL resolve to CSS custom properties on `:root` consumed via `var(--…)`; `icons` SHALL select a bundled icon pack rendered through the semantic icon registry, replacing hardcoded icon components.

#### Scenario: Applying a theme defines all dimensions

- **WHEN** a theme is applied
- **THEN** CSS variables for colors, typography, shape, density and effects are defined on `:root`, and the icon pack is active in the icon registry

#### Scenario: Theme with partial dimensions

- **WHEN** a theme only defines some dimensions
- **THEN** the missing dimensions inherit from its base theme (or the default theme) so every variable is still defined

### Requirement: Diez temas predefinidos

The system SHALL ship exactly 10 built-in selectable themes spanning these inspirations: console launchers (Orbital Blue / PS2-XMB), Kodi (Estuary), TV operating systems (Smart TV Coral), video players (Cone Orange / VLC), vintage devices (Amber Vintage), retro interfaces (Retro CRT), futurism (Cyber Neon), minimalism (Minimal Light, Paper Mono) and the existing Spotify Dark. Each built-in theme SHALL define all six dimensions. The default theme when unset SHALL remain `spotify-dark`.

#### Scenario: Theme list shows 10 themes

- **WHEN** the available themes are requested
- **THEN** exactly 10 built-in themes are listed, each with id, name, color scheme and all six dimensions resolved

#### Scenario: Distinct look per theme

- **WHEN** switching between any two built-in themes
- **THEN** at least one non-color dimension (typography, shape, density, effects or icons) also changes, so themes differ beyond their palette

### Requirement: Personalizaciones granulares

The user SHALL be able to override typography (font family), shape (radius preset), density, icon pack and each effect (CRT, glow) independently of the active theme. Every override SHALL support a "theme default" state that removes the override and returns to the theme's value.

#### Scenario: Override a single dimension

- **WHEN** the user overrides only the icon pack
- **THEN** every icon in the kiosk renders from the chosen pack while colors, typography, shape, density and effects still follow the active theme

#### Scenario: Reset to theme default

- **WHEN** the user resets an override to "theme default"
- **THEN** that dimension immediately reflects the active theme again

#### Scenario: Override survives theme switch

- **WHEN** a font override is set and the user switches to another theme
- **THEN** the chosen font is kept and only the non-overridden dimensions change

### Requirement: Precedencia de efectos

Each theme SHALL declare its default effects. An explicit user override SHALL take precedence over the theme default; with no override, the theme's declared default SHALL apply (including CRT scanlines/vignette).

#### Scenario: Theme CRT default honored

- **WHEN** the user switches to a theme whose default disables CRT effects and no CRT override exists
- **THEN** scanlines and vignette disappear

#### Scenario: User override wins

- **WHEN** the user explicitly enables CRT effects
- **THEN** scanlines and vignette render on every channel (except screen cast) regardless of the active theme's default, until the override is reset

### Requirement: Temas personalizados con herencia

Custom themes defined in the `themes` config key MAY declare `base: <theme-id>` and provide only the tokens or dimensions they change; missing values SHALL inherit from the base theme. Color-only themes written for the previous schema (all 16 color tokens, no other dimensions) SHALL keep working, inheriting non-color dimensions from the default theme.

#### Scenario: Partial custom theme

- **WHEN** a custom theme declares `base: "retro-crt"` and overrides only `colors.accent`
- **THEN** the theme is available and resolves every other value from `retro-crt`

#### Scenario: Legacy color-only theme

- **WHEN** a custom theme defines the 16 color tokens with no other dimensions
- **THEN** it is accepted and inherits typography, shape, density, effects and icons from the default theme

#### Scenario: Unknown base

- **WHEN** a custom theme declares a `base` that does not exist
- **THEN** the theme is rejected, the active theme is unaffected, and the error is logged

### Requirement: Validación de temas

Color tokens SHALL be valid CSS colors (`#hex`, `rgb(a)`, `hsl(a)`); typography values SHALL reference bundled font families; shape and density SHALL be valid preset ids; `icons` SHALL be a bundled icon pack id. Invalid custom themes SHALL be rejected without breaking the active theme or the rest of the theme list.

#### Scenario: Invalid color rejected

- **WHEN** a custom theme has a color token that is not a valid CSS color
- **THEN** that theme is excluded from the available list and a warning is logged

#### Scenario: Invalid preset rejected

- **WHEN** a custom theme sets `shape` or `density` to an unknown preset
- **THEN** that theme is excluded from the available list and a warning is logged

#### Scenario: Invalid icon pack rejected

- **WHEN** a custom theme sets `icons` to an unknown icon pack id
- **THEN** that theme is excluded from the available list and a warning is logged

### Requirement: Registro semántico de iconos

The kiosk SHALL render icons through a semantic icon registry: components request icons by semantic name (e.g. `play`, `settings`, `volume`) and the registry maps that name to the active pack's icon. Every bundled icon pack SHALL cover the full semantic set, and components SHALL NOT import icon libraries directly. Stroke-based 24×24 packs SHALL render through the morphing renderer (animated state transitions); all other packs SHALL render statically, with icon state changes swapping instantly.

#### Scenario: Pack switch swaps all icons

- **WHEN** the active icon pack changes (theme switch or override)
- **THEN** every icon in the kiosk re-renders from the new pack without a reload

#### Scenario: Full semantic coverage

- **WHEN** any bundled pack is active
- **THEN** every semantic icon name used by the UI resolves to an icon in that pack (no missing icons)

#### Scenario: Morph degrades gracefully

- **WHEN** a statically-rendered pack is active and an icon changes state (e.g. hover reveals the Play icon)
- **THEN** the icon swaps instantly with no broken in-between rendering

### Requirement: Resolución en el backend

The backend SHALL serve every theme (built-in and custom) fully resolved — inheritance applied, all dimensions complete — via `GET /api/config`, so no client reimplements inheritance logic.

#### Scenario: Clients receive resolved themes

- **WHEN** a client requests `GET /api/config`
- **THEN** every theme in `themes` contains all six dimensions with concrete values

### Requirement: Persistencia y aplicación en vivo

The active theme id and the user overrides SHALL persist in the backend runtime config and survive restarts. Changes to `theme`, `themes`, `theme_crt_enabled` or the overrides key SHALL publish `config_changed` and re-apply on connected clients without a reload.

#### Scenario: Restart keeps appearance

- **WHEN** a theme and overrides are set and the backend restarts
- **THEN** the same appearance is active after the restart

#### Scenario: Live re-apply

- **WHEN** an override is changed through the API while the kiosk is open
- **THEN** the kiosk re-renders with the new appearance without reloading
