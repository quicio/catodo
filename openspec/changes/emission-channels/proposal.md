# Proposal

## Why

Hoy Cátodo instala por defecto proveedores web (TV, Crunchyroll, Max) que el
operador no eligió, y mantiene un canal `anime` hardcodeado con su propio
`anime_dir`. Eso impide una instalación limpia y obliga a tocar código para
tener otra biblioteca (películas, Saint Seiya, sci-fi, etc.). El motor de medios
ya existe; falta desacoplarlo de Anime y exponerlo como canales configurables.

## What Changes

- **Instalación nueva**: sólo `Spotify`, `Arcade`, `IPTV`, `Screen Cast` y
  `YouTube` vienen activos. `TV`, `Crunchyroll`, `Max` y los proveedores
  regionales pasan a ser **sólo catálogo** y se instalan desde Ajustes.
- **Anime deja de ser builtin**. En su lugar hay **canales de emisión**
  genéricos: N instancias, cada una con nombre libre, carpeta, modo
  `series` (temporadas/episodios) o `videos` (plano), icono, color y orden.
- **Alta/edición/borrado en caliente** de canales de emisión desde Ajustes →
  Emisión, sin reiniciar. Las rutas siguen siendo local-only.
- **Progreso y reanudación por canal** (no por el id fijo `anime`), con
  migración compatible de las entradas `libraries` existentes.
- **Home/barra** usan el nombre, icono y color declarados por cada canal de
  emisión en vez de tablas hardcodeadas por id.
- `anime_dir` queda como clave legacy sin crear canal automáticamente.

## Capabilities

### New Capabilities

- `emission-channels`: motor y ciclo de vida de canales de medios configurables
  (series/videos, nombre/ruta/icono/color/orden, progreso, alta/edición/borrado).

### Modified Capabilities

- `channel-system`: los built-ins ya no incluyen Anime ni TV; los canales de
  emisión se registran desde configuración y se actualizan sin reiniciar.
- `plugin-system`: set mínimo de plugins bundled y proveedores opt-in desde el
  catálogo.
- `frontend-kiosk`: sección Emisión en Ajustes y uso de metadatos del canal en
  Home/barra.

## Impact

- Rust: `media.rs` (quitar caso anime, metadatos y orden), `libraries.rs`
  (CRUD/edición, sin builtin), `channels.rs`/`main.rs` (registro dinámico),
  `config.rs` si hace falta validar entradas.
- `plugins-repo/index.json`: `bundled` sólo para YouTube.
- Frontend: `ChannelSettings`/nueva sección Emisión, `api/client.ts`,
  `ChannelGrid`/`ChannelBar`/`App.tsx`.
- Specs y docs (`README`, `HANDOFF`, `anime-channel` retirada).

## Non-goals

- Scraping de metadata (TMDB/TVDB) o renombrado automático de episodios.
- Playlists manuales o categorías dentro de un canal (queda para otro change).
- Auto-crear un canal Anime al migrar: se elimina el builtin y el operador lo
  agrega desde Ajustes.
- Cambiar el motor de reproducción, efectos o DRM.
