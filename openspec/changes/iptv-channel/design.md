## Context

Cátodo ya tiene: `MediaChannel` (el backend Rust sirve archivos locales con range →
`<video>` en el frontend), un canal TV webview, y `ffmpeg`/`ffprobe` disponibles en
el sistema. El canal IPTV reusa ese patrón de streaming, pero con fuente remota
(HLS/TS/MP4) vía proxy ffmpeg.

El backend de release es Rust (`catodo-server`), así que el canal se implementa
como un `impl Channel` más, no en el backend Python legacy.

## Goals / Non-Goals

**Goals:**
- Parsear M3U/M3U8 (local o URL) con grupos y logos.
- Reproducir cualquier formato IPTV (HLS, MPEG-TS, MP4) en el `<video>` del navegador.
- Zapping tipo TV con un solo stream activo y procesos limpiados.

**Non-Goals:**
- EPG, grabación, timeshift, DRM, multi-stream simultáneo.

## Decisions

### 1. `IptvChannel` en `rust/crates/catodo-server/src/iptv.rs`

Un `impl Channel` con `info() → ChannelInfo::new("iptv", "IPTV", "iptv")`, order
después de TV, registrado en `build_default_channels()` (`channels.rs`) junto a
`ArcadeChannel` y los media channels.

Parseo M3U con un parser dedicado (línea a línea):
`#EXTINF:-1 tvg-logo="..." group-title="..." ,Nombre` + la URL de la línea
siguiente. `state()` devuelve
`groups: [{name, channels: [{id, name, logo}]}]` y `current`.

TTL de 60 s sobre la lista para no releer/re-descargar en cada zap; el comando
`refresh` la invalida.

### 2. Fuente configurable

Claves nuevas en `config.rs` (`KEYS` + default de `RuntimeConfig`):

- `iptv_playlist` (vacío = canal sin lista; env `CATODO_IPTV_PLAYLIST`).
- `iptv_headers` (objeto opcional `{ "User-Agent": "...", "Referer": "..." }`).

`load_playlist()`: si el valor es `http(s)://` se descarga con `reqwest`
(timeout de 10 s, headers de `iptv_headers`); si no, se lee como archivo local.

### 3. Proxy ffmpeg en un endpoint propio

El trait `Channel::current_stream()` devuelve un `PathBuf` y la ruta
`/api/channels/{id}/stream` sirve archivos con Range; IPTV necesita un pipe vivo,
así que va por una ruta dedicada en `api.rs`:

`GET /api/channels/iptv/stream` → `Body::from_stream(stdout del child)` con
`content-type: video/mp2t`. Estrategia por formato (según `ffprobe`):

- HLS (`m3u8`) → `ffmpeg -i <url> -c copy -f mpegts pipe:1` (re-encapsulado).
- Otros (TS crudo, MP4 no soportado por el navegador) → transcode
  `-c:v libx264 -preset veryfast -c:a aac -f mpegts pipe:1`.

El proceso vive mientras el cliente lee; `set_channel`/`next`/`prev`/`close`
matan el proceso anterior (`kill_on_drop` + `Child::kill` explícito) para no
dejar streams huérfanos.

### 4. Zapping en el frontend

Vista nueva `src/channels/IptvChannel.tsx`, enganchada en
`src/components/ChannelView.tsx` con `current.type === "iptv"` (mismo lugar donde
hoy se resuelven `app`, `cast` y `launcher`). Lista por grupos:

- `ArrowUp`/`ArrowDown` cambian de grupo.
- `ArrowLeft`/`ArrowRight` o `Enter` cambian de canal.
- `<video src="/api/channels/iptv/stream">`; al cambiar de canal se re-setea el
  `src` (el backend mata el ffmpeg anterior).

El estado y los eventos llegan por el WS existente; las acciones van por el
comando del canal (`set_channel`, `next`, `prev`, `refresh`).

### 5. Fallos

Si `ffprobe`/`ffmpeg` falla o el stream no responde, se publica
`iptv_stream_error {channel}` por el `EventBroker` y la UI muestra "señal no
disponible" sin romper el zapping.

## Risks / Trade-offs

- **Transcode consume CPU** → sólo para formatos que el navegador no reproduce;
  HLS se re-encapsula con `-c copy`. Documentado.
- **URLs con headers/referer exigidos por el proveedor** → `iptv_headers`
  opcional, best-effort.
- **Playlist remota grande** → TTL de 60 s y parseo streaming línea a línea.
- **Windows**: el kill de procesos y el pipe de ffmpeg necesitan cuidado extra;
  el target de release hoy es macOS arm64 + Linux x86_64.
