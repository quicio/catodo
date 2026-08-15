## 1. Backend: theme model v2

- [x] 1.1 Rewrite `backend/catodo/themes.py` to the v2 model: `colors`, `typography`, `shape`, `density`, `effects`, `icons`; keep `tokens`→`colors` and top-level `crt`→`effects.crt` aliases for v1 custom themes
- [x] 1.2 Add the font registry (8 bundled font ids), icon pack registry (10 pack ids), shape presets (`square`/`rounded`/`pill`) and density presets (`compact`/`comfortable`/`spacious`) as validation enums
- [x] 1.3 Add CSS color validation for color tokens (`#hex`, `rgb(a)`, `hsl(a)`); invalid themes are excluded with a logged warning
- [x] 1.4 Implement `base` inheritance for custom themes (unknown base → reject + log); resolve every served theme to all six dimensions
- [x] 1.5 Define the 10 built-in themes per the design table (colors, typography, shape, density, effects, icon pack each)
- [x] 1.6 Backend tests: v1 theme accepted, partial theme with `base` resolves, invalid color rejected, invalid preset rejected, invalid icon pack rejected, unknown base rejected, exactly 10 built-ins served fully resolved

## 2. Backend: overrides config

- [x] 2.1 Add `theme_overrides` key to `runtime_config.py` (default `{}`), with per-field validation (font/radius/density/iconPack/crt/glow) and unknown-field stripping
- [x] 2.2 Migrate legacy `theme_crt_enabled: false` into `theme_overrides.crt=false` once at load; keep accepting writes to `theme_crt_enabled` as a mapped alias
- [x] 2.3 Tests: override persistence, legacy migration, alias write mapping, `config_changed` emitted for `theme_overrides`

## 3. Frontend: appearance engine

- [x] 3.1 Update `frontend/src/theme.ts`: Theme interface v2, sanitize/normalize, `applyTheme()` writing color + typography + radius + density variables and `data-crt`/`data-glow`/`data-icons` attributes; merge `theme_overrides` over the resolved theme
- [x] 3.2 Sync the frontend `FALLBACK` with the backend default theme (v2 shape)
- [x] 3.3 Extend `RuntimeConfig` type and `ThemeContext` in `App.tsx`: expose `overrides` and a `setOverride(dimension, value|null)` that POSTs `theme_overrides`
- [x] 3.4 Install and import the 6 new `@fontsource` packages (inter, nunito, oswald, orbitron, vt323, ibm-plex-mono; 400/700 only) in `main.tsx`; register ids → family stacks
- [x] 3.5 Update `styles.css`: `:root` defaults for `--font-display`, `--radius-sm/md/lg`, `--font-size-base`, `--space-scale`; wire structural surfaces (Home grid, cards, channel bar, popovers, buttons) to radius/space/font variables; add `data-glow` accent glow styles

## 4. Frontend: registro de iconos

- [x] 4.1 Add `react-icons` dependency; create the semantic `Icon` component + registry (`frontend/src/icons.tsx`) with a typed `IconName` union covering every icon the UI uses (~30 names) and a per-pack `renderer: "morph" | "static"` flag
- [x] 4.2 Create the 10 pack maps (lucide, game-icons, feather, phosphor, material, ionicons, bootstrap, codicons, tabler, radix), each exhaustive over `IconName` (compile error if a mapping is missing); morph packs (lucide, feather, tabler) map to icon data consumed by `MorphIcon`, the rest map to react-icons components
- [x] 4.3 Resolve the active pack from theme + `theme_overrides.iconPack` in `ThemeContext`; expose via `useTheme()`
- [x] 4.4 Replace all direct `lucide`/`lucide-react`/`morphicons` imports in components with `<Icon name="…"/>`; morph state transitions keep working on stroke-based packs and swap instantly on the rest

## 5. Frontend: settings UI

- [x] 5.1 Rebuild the Home settings popover: theme gallery with palette swatches and theme name rendered in its own display font
- [x] 5.2 Add "Personalización" section: font select, icon pack select, segmented radius and density pickers, CRT/glow toggles — every control with a "Tema" (default) option that clears the override
- [x] 5.3 Apply overrides optimistically on click (local apply + POST), reconciled by the `config_changed` event

## 6. Frontend: token cleanup

- [x] 6.1 Replace remaining hardcoded hex/rgba literals in components (MediaChannel, Home, App, ArcadeLauncher, NowPlaying, channels) with tokens; use `color-mix(in srgb, var(--accent) X%, transparent)` for alpha variants
- [x] 6.2 Replace hardcoded `fontFamily` and `borderRadius` inline styles with `var(--font-display)` / radius vars
- [x] 6.3 Grep audit: zero color/font/radius literals and zero direct icon-library imports in component rendering paths; manual contrast pass on `minimal-light` and `paper-mono` across all channels

## 7. Remote PWA

- [x] 7.1 Convert `backend/static/remote/style.css` to `var(--…)` with `:root` defaults equal to `spotify-dark` (colors + radius)
- [x] 7.2 In `app.js`: fetch `/api/config` on boot and apply colors + radius to `:root`; fall back to defaults if unreachable
- [x] 7.3 Re-apply on `config_changed` (`theme`, `themes`, `theme_overrides`) over the existing WebSocket

## 8. Verificación y cierre

- [x] 8.1 Manual pass over all 10 themes × all channels (kiosk) + remote; verify each theme differs beyond palette and every icon resolves in all 10 packs
- [x] 8.2 Verify personalization flows: single-dimension override, reset to theme default, override survives theme switch, restart persistence
- [x] 8.3 Run backend test suite and frontend typecheck/build; confirm bundle size impact of new fonts + react-icons
- [x] 8.4 Update README.md with the appearance system (themes, overrides, icon packs, custom theme JSON format)
- [x] 8.5 Archive the completed `theme-system` change before archiving this one
