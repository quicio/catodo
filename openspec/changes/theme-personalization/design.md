## Context

The current system (change `theme-system`, complete but **not yet archived**) themes only 16 color tokens + a global CRT flag, with 3 built-in themes defined in `backend/catodo/themes.py`. Kiosk components still carry ~52 hex and ~89 `rgba()` hardcoded literals, fonts/radii/spacing are fixed in `styles.css` and inline styles, the per-theme `crt` flag is never read by the frontend, and the remote PWA (`backend/static/remote/`) uses its own fixed palette. Backend → `/api/config` → WebSocket → CSS vars plumbing already exists and is reused as-is.

## Goals / Non-Goals

**Goals:**
- Theme model v2: `colors` + `typography` + `shape` + `density` + `effects` + `icons`; the first five resolve to CSS variables on `:root`, `icons` selects a bundled icon pack rendered through a semantic registry.
- 10 built-in themes that differ in more than palette (see table below).
- Granular user overrides per dimension, persisted in one new config key.
- Remote PWA consumes the resolved theme (colors + radius) instead of its hardcoded palette.
- Backend tests for validation/inheritance/resolution.

**Non-Goals:**
- Visual theme editor, per-channel themes, scheduled light/dark switching, theming plugin skins (e.g. simple-keyboard).
- Icon packs on the remote PWA: it keeps its fixed inline SVGs (shipping per-pack SVG sprites to a no-build page is not worth it); the remote adopts colors/radius only.
- Full refactor of every inline style to a spacing scale: density/shape target the structural surfaces (Home grid, cards, channel bar, popovers, buttons) via variables; long-tail cosmetic paddings stay as-is.
- Theming the Electron shell itself.

## Decisions

### 1. Theme model v2 (backend-normalized, backend-resolved)

```json
{
  "id": "orbital-blue", "name": "Orbital Blue", "colorScheme": "dark",
  "colors":    { "bg": "...", "...": "..." },
  "typography": { "display": "orbitron", "mono": "jetbrains-mono" },
  "shape":      "pill",
  "density":    "spacious",
  "effects":    { "crt": false, "glow": true },
  "icons":      "phosphor"
}
```

- The **backend normalizes and fully resolves** every theme (inheritance from `base` applied) before serving it in `GET /api/config`. Clients never implement inheritance. Rationale: single source of truth; the remote (vanilla JS) stays dumb.
- **Backwards compatibility**: v1 custom themes (`tokens` instead of `colors`, top-level `crt`, all 16 tokens mandatory) are accepted: `tokens`→`colors` alias, `crt`→`effects.crt`, missing dimensions inherit from the default theme. Alternative considered: reject v1 and force migration — discarded, breaks user configs for no benefit.
- `shape` and `density` are **named presets**, not free values: keeps the design space curated (10 themes × 3 presets stay coherent) and validation trivial. Alternatives considered: free px values (rejected: arbitrary values break layouts); per-theme px scales (rejected: verbose, no user-facing gain over presets).
- `icons` is an **icon pack id from a bundled registry** (10 packs via `react-icons`, ESM tree-shaken). Icons are React components, not CSS: the kiosk renders them through a semantic `Icon` registry — `<Icon name="play"/>` — that maps the ~30 semantic names the UI uses to each pack. Alternative considered: per-pack CSS/SVG sprites (rejected: the kiosk is React; components are simpler, typed and tree-shakeable). `lucide`/`lucide-react`/`morphicons` direct imports are replaced by the registry.
- **Hybrid morph rendering**: each pack declares `renderer: "morph" | "static"`. Stroke-based 24×24 packs (`lucide`, `feather`, `tabler`) render through `MorphIcon`, keeping the spring morph on state swaps (e.g. channel hover → Play). Filled or non-24×24 packs (game-icons 512², phosphor, material, ionicons, bootstrap, codicons 16², radix 15²) render as plain components and state swaps are instant — `morphicons` only interpolates stroke geometry on a shared 24×24 grid (its README explicitly names Material/Bootstrap/Phosphor as unsupported), so morph-everywhere was never on the table. Alternative considered: re-curate all 10 packs to stroke-based sets (rejected: kills the visual variety — no chunky arcade glyphs, no solid Kodi look).

### 2. Variable mapping

| Dimension | CSS variables |
|---|---|
| colors | existing 16: `--bg`, `--surface`, `--text`, … `--ch-arcade` |
| typography | `--font-display`, `--font-mono` |
| shape | `--radius-sm`, `--radius-md`, `--radius-lg` — `square`: 0/0/2px · `rounded`: 6/10/16px · `pill`: 999px/999px/24px |
| density | `--font-size-base`, `--space-scale` — `compact`: 14px/0.85 · `comfortable`: 16px/1 · `spacious`: 18px/1.2 |
| effects | `data-crt` (exists) + new `data-glow` attribute on `<html>`; glow styles use `var(--accent-soft)` |
| icons | active pack id in `ThemeContext` (consumed by the `Icon` registry) + `data-icons` attribute on `<html>` for CSS hooks |

Fonts are referenced by **id from a bundled registry** (not arbitrary family names), so validation is a set-membership check and bundling is explicit: `space-grotesk`, `jetbrains-mono` (existing) + new `@fontsource` packages: `inter`, `nunito`, `oswald`, `orbitron`, `vt323`, `ibm-plex-mono`. Only 400/700 weights (plus 500 for the two existing) to bound bundle size.

### 3. The 10 built-in themes

| id | Inspiration | Scheme | Display font | Icons | Shape | Density | CRT | Glow | Accent |
|---|---|---|---|---|---|---|---|---|---|
| `spotify-dark` | Spotify (default, kept) | dark | space-grotesk | lucide | rounded | comfortable | on | off | `#1db954` |
| `retro-crt` | Retro interfaces | dark | vt323 | game-icons | square | comfortable | on | on | `#00ff9c` |
| `minimal-light` | Minimalism (kept) | light | inter | feather | rounded | comfortable | off | off | `#1db954`→ neutral |
| `orbital-blue` | PS2/XMB launcher | dark | orbitron | phosphor | pill | spacious | off | on | `#4d7cff` |
| `estuary` | Kodi Estuary | dark | oswald | material | square | compact | off | off | `#12b2e7` |
| `smart-tv-coral` | webOS/Tizen | dark | nunito | ionicons | pill | spacious | off | off | `#ff5a5f` |
| `cone-orange` | VLC / video players | dark | inter | bootstrap | rounded | compact | off | off | `#ff7f00` |
| `amber-vintage` | Vintage terminals | dark | ibm-plex-mono | codicons | square | comfortable | on | on | `#ffb000` |
| `cyber-neon` | Futurism | dark | orbitron | tabler | rounded | compact | off | on | `#00e5ff` |
| `paper-mono` | E-ink minimalism | light | inter | radix | square | comfortable | off | off | `#222226` |

Final per-theme palettes are tuned during implementation; the dimension mix above is the contract.

### 4. Overrides: one new key, `theme_overrides`

`{ "font"?, "radius"?, "density"?, "iconPack"?, "crt"?, "glow"? }` — absent keys mean "follow the theme". The frontend merges overrides over the resolved theme at apply time (cheap, and one `themes` list serves all clients).

**CRT migration**: `theme_crt_enabled` stays a supported key, but is now legacy: at load, a stored `theme_crt_enabled: false` is folded once into `theme_overrides.crt=false` (and the key cleared); writes to it map to the override. Effective CRT = `theme_overrides.crt` if present, else the theme's `effects.crt` — this fixes the dead per-theme `crt` flag. Alternative considered: keep `theme_crt_enabled` as the canonical CRT switch — rejected, it cannot express "follow the theme" (its default `true` always shadows the theme).

### 5. Kiosk UI

The Home settings popover becomes two sections: **TEMAS** (gallery: one row per theme with palette swatches + name rendered in the theme's display font) and **PERSONALIZACIÓN** (font select, icon pack select, segmented radius/density pickers, CRT/glow toggles — each with a "Tema" default option). Token cleanup replaces the remaining hardcoded literals with `var(--…)` (incl. the `rgba(29,185,84,…)` accent clones, replaced by `color-mix(in srgb, var(--accent) X%, transparent)`).

### 6. Remote PWA

`style.css` replaces its hardcoded palette with `var(--…)` declarations whose `:root` defaults equal `spotify-dark`. `app.js` fetches `/api/config` on boot, applies colors + radii, and re-applies on `config_changed` over its existing WebSocket. No build step, no new dependencies — honors the "self-contained remote" requirement.

### 7. Spec dependency

`theme-system` (complete, unarchived) MUST be archived **before** this change is archived: both deltas MODIFY `runtime-config`'s "Overrideable keys" and touch the same frontend-kiosk requirements; archiving in that order yields the union described in these deltas.

## Risks / Trade-offs

- **Bundle size** (6 new font packages + `react-icons`) → fonts ship only 400/700 weights (display faces single weight); `react-icons` is ESM tree-shaken so only the mapped glyphs ship; verify final bundle in build task.
- **Semantic icon coverage** (a pack missing a glyph the UI uses) → the registry is typed: the pack maps are exhaustive over a single `IconName` union, so a missing mapping is a compile error, not a runtime hole; the "Full semantic coverage" spec scenario is checked in the manual pass.
- **Inline-style refactor creep** → scope token cleanup to color/font/radius literals on rendering paths (the audit's ~140 hits); density only rewires structural surfaces. Verify via grep audit scenario in the spec.
- **`color-mix()` support** → Chromium 111+; Electron 33 is fine. The remote targets modern mobile browsers (Safari 16.2+); provide a plain-opacity fallback class for older browsers.
- **Archive order** (decision 7) → document in PR/merge notes; validate with `openspec validate --strict` before archiving.
- **Light-theme contrast regressions** from previously-dark-only literals → the "Readable in every theme" spec scenario is checked manually per channel on `minimal-light` and `paper-mono`.

## Migration Plan

1. Ship backend (model v2 + validation + inheritance + `theme_overrides`) — old frontends keep working: they read the same `themes` list with extra keys they ignore.
2. Ship kiosk frontend (apply v2, new settings UI, token cleanup).
3. Ship remote (var-driven CSS + config fetch).
4. Rollback: revert code; `theme_overrides` is ignored by old code (unknown-key policy), and folded CRT overrides degrade to the old global default — no config corruption possible.
