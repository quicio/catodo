## 1. Backend — parseo M3U y canal

- [ ] 1.1 Crear `catodo/iptv.py`: parser M3U/M3U8 (`#EXTINF` con `tvg-logo`/`group-title` + URL) y `load_playlist()` que resuelve local o URL remota con TTL.
- [ ] 1.2 `IptvChannel` (tipo `iptv`): estado con `groups[{name, channels[]}]` y `current`; comandos `set_channel`, `next`, `prev`, `refresh`.
- [ ] 1.3 Registrar el canal en `build_default_registry()` después de TV.

## 2. Backend — proxy ffmpeg

- [ ] 2.1 Endpoint `GET /api/channels/iptv/stream?channel=<id>`: `ffprobe` para detectar formato; `ffmpeg -c copy` para HLS o transcode para el resto; respuesta `video/mp2t`.
- [ ] 2.2 Manejar la vida del proceso ffmpeg: matar el stream previo al cambiar de canal y al cerrar el canal; sin procesos huérfanos.
- [ ] 2.3 Publicar `iptv_stream_error` cuando `ffprobe`/`ffmpeg` falla o el stream no responde.

## 3. Config

- [ ] 3.1 Clave `iptv_playlist` en `runtime_config.KEYS` (default vacío) y `iptv_headers` opcional.

## 4. Tests backend

- [ ] 4.1 Tests del parser: grupo por `group-title`, logo, entrada sin grupo → "Otros", playlist local y por URL (mockeada).
- [ ] 4.2 Tests de comandos `set_channel`/`next`/`prev`/`refresh` y del estado.
- [ ] 4.3 Test del endpoint `/stream` (con ffmpeg/ffprobe mockeados o un stream local generado).

## 5. Frontend — vista IPTV

- [ ] 5.1 `IptvView.tsx`: lista por grupos con logos, navegación por flechas (arriba/abajo grupo, izquierda/derecha o Enter canal) y `<video>` del stream.
- [ ] 5.2 Routing en `ChannelView.tsx` para tipo `iptv`.
- [ ] 5.3 Manejo de `iptv_stream_error` en el store para mostrar "señal no disponible".

## 6. Verificación

- [ ] 6.1 E2E: cargar una playlist con canales reales → se ve el canal, zapping con flechas, cambio de grupo, y señal caída muestra error.
- [ ] 6.2 README: documentar el canal IPTV, la clave `iptv_playlist` y el proxy ffmpeg.
