## Why

Los colores están hardcodeados en más de 100 lugares del frontend (`#1db954`, `#4dffb1`, `rgba(...)`, etc.) y el único token de CSS es `--accent`. No hay forma de cambiar la apariencia de Cátodo sin tocar código, ni de tener temas claros/oscuros o personalizados.

## What Changes

- **Motor de themes**: sistema de temas con tokens de color (CSS custom properties) que reemplaza los colores hardcodeados del frontend.
- **Tokens de color**: paleta base (fondo, superficie, texto primario/secundario, acento, acento-suave, borde, canales, danger, success) definida por tema.
- **Themes predefinidos**: al menos 3 incluidos por defecto (ej. "Spotify Dark", "Retro CRT", "Minimal Light") con selector en la UI.
- **Themes custom**: el usuario puede definir themes propios en `~/.local/share/catodo/config.json` sin tocar código.
- **Selector en la UI**: en el Home, se puede elegir el theme activo; persiste en la config del backend.
- **Config del backend**: nuevas claves de runtime (`theme`, `themes`, `theme_crt_enabled`) expuestas vía `/api/config`, con evento `config_changed` al cambiar.
- **Modo light/dark + efectos CRT**: el theme define el modo de color y si aplican los efectos CRT (scanlines/vignette).

## Capabilities

### New Capabilities

- `theme-system`: definición de themes, tokens de color, themes predefinidos y custom, y su persistencia.

### Modified Capabilities

- `runtime-config`: nuevas claves `theme`, `themes` y `theme_crt_enabled` con defaults y persistencia en config.json.
- `frontend-kiosk`: el frontend aplica el theme activo (tokens CSS, modo color, efectos CRT) y ofrece selector de theme en la UI.

## Impact

- Backend: `runtime_config.py` (nuevas claves), `api.py` (exposición de themes en `/api/config`).
- Frontend: `styles.css` (tokens), `Home.tsx` (selector + tema), `App.tsx`/`CrtShell.tsx` (aplicación del theme y efectos CRT), y todos los componentes con colores hardcodeados (`NowPlaying`, `MediaChannel`, `Anime4KCanvas`, `ChannelBar`, etc.).
- Sin cambios de API pública ni de formato de datos persistidos existentes (se agregan claves nuevas).
