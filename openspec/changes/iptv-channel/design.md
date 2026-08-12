## Context

Cátodo ya tiene: `MediaChannel` (backend streamea archivos locales con range → `<video>` en el frontend), un canal TV webview, y `ffmpeg`/`ffprobe` instalados en el sistema. El canal IPTV reusa el patrón de streaming del canal media pero con fuente remota (HLS/TS/MP4) vía proxy ffmpeg.

## Goals / Non-Goals

**Goals:**
- Parsear M3U/M3U8 (local o URL) con grupos y logos.
- Reproducir cualquier formato IPTV (HLS, MPEG-TS, MP4) en el `<video>` del navegador.
- Zapping tipo TV con un solo stream activo y procesos limpiados.

**Non-Goals:**
- EPG, grabación, timeshift, DRM, multi-stream simultáneo.

## Decisions

### 1. `IptvChannel` en `catodo/iptv.py`
Un solo canal `iptv` (order después de TV). Parseo M3U con un parser dedicado:
`#EXTINF:-1 tvg-logo="..." group-title="..." ,Nombre` + línea de URL. `state()` devuelve `groups: [{name, channels: [{id, name, logo}]}]` y `current`. TTL de la lista (60s) para no re-leer en cada zap.

### 2. Fuente configurable
`iptv_playlist` en `runtime_config` (ruta local o URL). `load_playlist()`: si es `http(s)://` descarga con `urllib` (timeout, user-agent), si no, lee el archivo. El `refresh` force recarga.

### 3. Proxy ffmpeg en `/stream`
Endpoint `GET /api/channels/iptv/stream?channel=<id>` (tipo `SupportsStream`-like, pero por id de canal). Estrategia por formato:
- Si `ffprobe` reporta `m3u8`/HLS → `ffmpeg -i <url> -c copy -f mpegts pipe:1` (re-encapsulado, sin transcode).
- Otros (TS crudo, MP4 no soportado) → `ffmpeg -i <url> -c:v libx264 -preset veryfast -c:a aac -f mpegts pipe:1` (transcode).
Se sirve como `video/mp2t` y el `<video>` del frontend lo reproduce. El proceso vive mientras el cliente lee el stream; se mata al cambiar de canal (`set_channel`/`next`/`prev` matan el proceso previo).

### 4. Zapping en el frontend
Nueva vista `IptvView.tsx` (tipo `iptv`): lista por grupos (flechas arriba/abajo cambian grupo, izquierda/derecha o Enter cambian canal), logo o placeholder, y un `<video src="/api/channels/iptv/stream?channel=<id>">`. Al cambiar de canal se re-set `src`. Estado/eventos vienen del store (WS) + comando `set_channel`/`next`/`prev`/`refresh`.

### 5. Fallos
Si `ffprobe`/`ffmpeg` falla o el stream no responde, se publica `iptv_stream_error {channel}` y la UI muestra "señal no disponible" sin romper el zapping.

## Risks / Trade-offs

- **Transcode consume CPU** → solo para formatos que el navegador no toca; HLS se re-encapsula con `-c copy`. Documentado.
- **URLs con headers/referer exigidos por el proveedor** → muchos streams gratis los piden; se agrega una clave opcional `iptv_headers` para mandarlos en el proxy. Best-effort.
- **Playlist remota grande** → TTL de 60s evita re-descargas; el parseo es streaming línea a línea.
