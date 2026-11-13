# Tasks — iptv-channel

> Reescrito para el backend Rust (`rust/crates/catodo-server`), que es el runtime
> de release desde M4. El plan original apuntaba al backend Python legacy.

## 1. Backend — parser M3U y canal

- [ ] 1.1 Crear `rust/crates/catodo-server/src/iptv.rs`: parser M3U/M3U8 (`#EXTINF` con `tvg-logo`/`group-title` + URL de la línea siguiente) y `load_playlist()` que resuelve archivo local o URL remota con TTL de 60 s.
- [ ] 1.2 Implementar `impl Channel for IptvChannel`: `info()` (`id=iptv`, `type=iptv`, order después de TV), `state()` con `groups[{name, channels[{id, name, logo}]}]` + `current`, y comandos `set_channel`, `next`, `prev`, `refresh`, `close`.
- [ ] 1.3 Registrar el canal en `build_default_channels()` (`channels.rs`), después de los media channels y antes de arcade.

## 2. Backend — proxy ffmpeg

- [ ] 2.1 Ruta `GET /api/channels/iptv/stream` en `api.rs`: `ffprobe` para detectar formato, `ffmpeg ... -f mpegts pipe:1`, respuesta `video/mp2t` con `Body::from_stream` del stdout del child.
- [ ] 2.2 Vida del proceso: matar el ffmpeg previo al cambiar de canal, al cerrar el canal y al cortarse el cliente; `kill_on_drop` y sin procesos huérfanos.
- [ ] 2.3 Publicar `iptv_stream_error` por el `EventBroker` cuando `ffprobe`/`ffmpeg` falla o el stream no responde.

## 3. Config

- [ ] 3.1 Claves `iptv_playlist` (default vacío, env `CATODO_IPTV_PLAYLIST`) e `iptv_headers` (objeto opcional) en `config.rs` (`KEYS` + defaults).
- [ ] 3.2 Aplicar `iptv_headers` como headers HTTP al descargar la playlist y al invocar ffmpeg (`-headers`).

## 4. Tests backend

- [ ] 4.1 Tests del parser: grupo por `group-title`, `tvg-logo`, entrada sin grupo → "Otros", playlist local (fixture) y por URL (mock con `wiremock`/servidor de test).
- [ ] 4.2 Tests de comandos `set_channel`/`next`/`prev`/`refresh` y forma del `state()`.
- [ ] 4.3 Test del endpoint `/stream` con un `ffmpeg` falso (script que escribe bytes) para verificar content-type, corte al cambiar de canal y que no queden procesos.

## 5. Frontend — vista IPTV

- [ ] 5.1 `frontend/src/channels/IptvChannel.tsx`: lista por grupos con logos, navegación (arriba/abajo grupo, izquierda/derecha o Enter canal) y `<video>` del stream.
- [ ] 5.2 Enganchar `current.type === "iptv"` en `frontend/src/components/ChannelView.tsx`.
- [ ] 5.3 Manejar `iptv_stream_error` en el store para mostrar "señal no disponible".

## 6. Verificación y docs

- [ ] 6.1 E2E manual: playlist con canales reales → se ve el canal, zapping con flechas, cambio de grupo, y señal caída muestra el error.
- [ ] 6.2 README: documentar el canal IPTV, `iptv_playlist`, `iptv_headers` y el proxy ffmpeg (incluye el costo de transcode).
- [ ] 6.3 `./scripts/check.sh` verde y `openspec validate iptv-channel` sin errores.
