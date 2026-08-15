## Context

Ver proposal.md. El frontend tiene ~100+ colores hardcodeados (`#1db954`, `#4dffb1`, `rgba(...)`, etc.) en `styles.css` y componentes (`NowPlaying`, `MediaChannel`, `Home`, `Anime4KCanvas`, `ChannelBar`), con un único token `--accent` en `:root`. La config de runtime ya persiste claves en `<data_dir>/config.json` y emite `config_changed` al cambiar.

## Goals / Non-Goals

**Goals:**
- Un solo conjunto de tokens CSS consumido por todos los componentes.
- Themes predefinidos + custom por JSON, con selector en la UI.
- Persistencia vía runtime config existente y re-aplicación en vivo vía `config_changed`.

**Non-Goals:**
- Editor visual de themes (solo JSON).
- Themes por canal independientes del theme global (el theme define el color de cada canal, pero hay un solo theme activo).
- Soporte de fuentes/logo por theme (solo colores + modo + CRT).

## Decisions

### 1. Tokens CSS como fuente única
Se define el set de CSS custom properties en `:root` (o `[data-theme]`): `--bg`, `--surface`, `--text`, `--text-dim`, `--accent`, `--accent-soft`, `--border`, `--danger`, `--success`, `--ch-spotify`, `--ch-youtube`, `--ch-tv`, `--ch-anime`, `--ch-crunchyroll`, `--ch-arcade`. Todos los colores hardcodeados se reemplazan por `var(--...)`.
*Alternativa*: objetos JS en un contexto React — descartado porque los estilos están mezclados entre CSS y style inline; los tokens CSS cubren ambos (inline via `var()`).

### 2. Definición de themes en el backend
Los themes viven en `runtime_config`: los predefinidos se exponen vía la clave `themes` (merge de built-in + custom). El formato de un theme:
```json
{
  "id": "spotify-dark",
  "name": "Spotify Dark",
  "colorScheme": "dark",
  "crt": true,
  "tokens": {
    "bg": "#0a0a0a", "surface": "#181818", "text": "#f5f5f5",
    "textDim": "rgba(255,255,255,0.6)", "accent": "#1db954",
    "accentSoft": "#1ed760", "border": "rgba(255,255,255,0.15)",
    "danger": "#ff6b6b", "success": "#1db954",
    "chSpotify": "#1db954", "chYoutube": "#ff0033", "chTv": "#4d7cff",
    "chAnime": "#ffd166", "chCrunchyroll": "#f47521", "chArcade": "#b66dff"
  }
}
```
Los custom van en `config.json` bajo `themes` (array). Claves nuevas en `runtime_config.KEYS`: `theme` (default `spotify-dark`), `themes` (default `[]`), `theme_crt_enabled` (default `True`).

### 3. Aplicación en el frontend
- El `App` (o un `ThemeProvider`) lee `/api/config` al boot y escucha `config_changed`.
- Los tokens se escriben como CSS properties en `document.documentElement` (`data-theme` + `--bg`, etc.), más `color-scheme` según `colorScheme`.
- El selector de theme se renderiza en `Home` (un popover/dropdown con la lista `themes` + el activo) y hace `POST /api/config {theme}`.
- Los efectos CRT se controlan en `CrtShell` según `theme_crt_enabled` (con fallback al `crt` del theme activo).

### 4. Reemplazo de hardcoded
Pasada de barrido por componentes: sustituir `#1db954` → `var(--accent)`, `#4dffb1` → `var(--accent-soft)`, `#fff` → `var(--text)`, negros → `var(--bg)`, colores de canal → `var(--ch-<id>)`, `rgba(255,255,255,x)` → `var(--text-dim)` o tokens con alpha derivados. Se priorizan los más visibles (Home, NowPlaying, MediaChannel, ChannelBar, CrtShell); los alpha exactos se mapean a tokens "suaves" existentes.

## Risks / Trade-offs

- [Alpha values distintos en rgba(255,255,255,x)] → No se crea un token por cada alpha; se usa una familia (`--text`, `--text-dim`, `--text-faint`) + `--surface` con alpha en los overlays.
- [Cambio masivo de componentes] → Se hace en tareas chicas por componente, con `tsc`/build entre cada una; el theme por defecto reproduce los colores actuales para que no haya regresión visual.
- [JSON de theme custom inválido rompe el boot] → Se valida en backend (`themes` se filtra a esquema válido al cargar) y el frontend ignora tokens no definidos.
