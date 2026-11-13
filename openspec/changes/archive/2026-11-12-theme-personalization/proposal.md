## Why

The current theme system (from the unarchived `theme-system` change) only themes **16 color tokens** plus a global CRT flag, with just 3 built-in themes. Fonts, button shapes, density and effects are hardcoded across the kiosk UI, ~140 color literals still bypass tokens, the per-theme `crt` flag is dead code, and the remote PWA uses its own fixed palette. The user wants a real "appearance" experience — inspired by console launchers, Kodi, TV OSes, video players, vintage devices, retro interfaces, futurism and minimalism — with 10 themes and granular personalizations.

## What Changes

- **Expanded theme model**: a theme now defines `colors` (existing tokens), `typography` (display/mono font families), `shape` (border-radius scale / button style), `density` (spacing & font-size scale), `effects` (CRT, glow) and `icons` (icon pack). The first five resolve as CSS variables at runtime; `icons` selects one of 10 bundled icon packs rendered through a semantic icon registry.
- **10 built-in themes** inspired by the requested references: Spotify Dark, Retro CRT, Minimal Light (kept/refined) + Orbital Blue (PS2/XMB launcher), Estuary (Kodi), Smart TV Coral (webOS/Tizen), Cone Orange (VLC/video players), Amber Vintage (vintage terminals), Cyber Neon (futurism), Paper Mono (e-ink minimalism).
- **Granular personalizations**: the user can override font, radius, density, icon pack and effects independently of the active theme; overrides persist in runtime config and re-apply live over WebSocket. **BREAKING** for custom-theme authors: theme JSON gains optional dimension keys (old color-only themes keep working — missing dimensions inherit from the theme's base).
- **Partial custom themes**: a custom theme may declare `base: <builtin-id>` plus only the tokens it changes; it no longer needs all 16 color tokens.
- **Color validation**: token values are validated as CSS colors (hex/rgb(a)/hsl(a)); invalid themes are rejected with a clear error instead of silently breaking CSS.
- **Token coverage fix**: replace remaining hardcoded hex/rgba literals in kiosk components with tokens (incl. new `--glow`/`--shadow` tokens where needed).
- **Remote PWA theming**: the remote fetches the resolved theme and applies the same CSS variables (colors + radius), replacing its hardcoded palette.
- **Settings UI redesign**: theme gallery with live swatch previews per theme, plus a "Personalización" section (font picker, icon pack picker, radius, density, effects toggles).
- Fix: per-theme `crt` flag is honored as the default when no user override exists.

## Capabilities

### New Capabilities
- `appearance`: Expanded theme model (colors, typography, shape, density, effects, icons), the 10 built-in themes, the bundled icon-pack registry with semantic icons, granular personalization overrides, custom themes with inheritance and validation, and theme application in kiosk and remote.

### Modified Capabilities
- `runtime-config`: New persisted keys for appearance overrides; validation rules for theme objects; live propagation of appearance changes.
- `frontend-kiosk`: Settings popover becomes a theme gallery + personalization panel; all kiosk UI must consume theme tokens (no hardcoded literals).
- `remote-control`: Remote PWA must resolve and apply the active theme instead of its fixed palette.

## Impact

- **Backend**: `catodo/themes.py` (new model, 10 themes, validation, inheritance), `runtime_config.py` (new keys, normalization), `api.py` (unchanged surface; new keys flow through `/api/config`).
- **Frontend kiosk**: `theme.ts` (apply new variable groups), `styles.css` (variable-driven fonts/radii/spacing), new semantic `Icon` registry + per-pack maps, all components (token cleanup, icon registry adoption), `Home.tsx` (new settings UI), `main.tsx` (new font packages).
- **Remote PWA**: `static/remote/style.css`, `static/remote/app.js` (fetch/apply theme).
- **Config**: `~/.local/share/catodo/config.json` gains appearance override keys; existing keys keep working.
- **Dependencies**: new `@fontsource/*` font packages for theme typography; `react-icons` for the 10 icon packs.
- **Non-goals**: visual theme editor UI, per-channel themes, wallpaper-linked themes, light/dark auto-switching by schedule, theming of the on-screen keyboard plugin skin, icon packs on the remote PWA (it adopts colors/radius only).
