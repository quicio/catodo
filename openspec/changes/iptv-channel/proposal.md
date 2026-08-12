## Why

El canal TV actual es un webview (Movistar), pero no hay forma de ver **canales IPTV libres/gratis** (playlists M3U). Con ffmpeg ya instalado, Cátodo puede convertirse en un IPTV real: lista por grupos, zapping con flechas y streams que reproducen directo.

## What Changes

- Nuevo canal **IPTV** (tipo `iptv`) que parsea una playlist M3U/M3U8.
- La playlist se configura con `iptv_playlist` (ruta a un archivo local `.m3u` o una URL remota).
- Cada entrada (`#EXTINF` con `group-title` y `tvg-logo`) es un canal; se agrupan por `group-title` y se muestran con su logo/ícono.
- **Proxy ffmpeg en el backend**: `GET /api/channels/iptv/stream?channel=<id>` spawnea `ffprobe` para conocer el formato y `ffmpeg` para re-encapsular/transcodificar a algo que reproduzca el `<video>` del navegador (HLS/mp4). Un proceso por canal activo, cerrado al cambiar/zapping.
- **Zapping**: dentro del canal IPTV, `ArrowUp/Down` cambian de grupo, `ArrowLeft/Right` o `Enter` cambian de canal, y el estado expone el canal actual. Es un solo canal en la barra.
- **Caché de la playlist** con TTL para no re-descargar en cada zap; botón/command `refresh` para recargar.

## Capabilities

### New Capabilities
- `iptv-channel`: canal IPTV que reproduce canales libres desde una playlist M3U/M3U8 (local o URL) vía proxy ffmpeg, con grupos y zapping tipo TV.

### Modified Capabilities
- Ninguna (el canal TV webview existente no cambia).

## Impact

- **Backend**: nuevo `catodo/iptv.py` con `IptvChannel` (parseo M3U, estado con grupos/canales, comando `set_channel`/`next`/`prev`/`refresh`) + endpoint `/stream` que sirve el proxy ffmpeg. Se registra en `build_default_registry()`.
- **Config**: claves `iptv_playlist` (ruta o URL) en `runtime_config`.
- **Frontend**: nueva vista `IptvView.tsx` (lista por grupos + zapping) y routing por tipo `iptv`.
- **Otros**: tests backend (parseo M3U, resolución de stream, comandos), README.

## Non-goals

- No es un gestor de listas ni busca listas automáticamente.
- No graba, no EPG, no timeshift.
- No soporta DRM ni canales de pago.
- No transcodificación en lote: un solo stream activo (el canal seleccionado).
