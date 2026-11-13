# Tasks — arcade-libretro-host

## 0. Spike (hecho)

- [x] 0.1 Cargar `fceumm_libretro.dylib` con `libloading` desde Rust y ejecutar `retro_init` / `retro_load_game` con un ROM público de test.
- [x] 0.2 Correr 180 `retro_run()` y verificar video (256×240 XRGB8888, pitch 1024) y audio (48 kHz, 143.752 samples).
- [x] 0.3 Confirmar que no hacen falta bindings generados: ~15 símbolos C alcanzan.

## 1. Módulo `arcade/` en Rust

- [x] 1.1 Crear `rust/crates/catodo-server/src/arcade/` (`mod.rs`, `core.rs`, `runner.rs`, `av.rs`, `cores.rs`) moviendo el escaneo actual a `mod.rs`.
- [x] 1.2 `core.rs`: tipos FFI, `retro_set_*`, `retro_init`, `retro_load_game`, `retro_get_system_av_info`, `retro_run`, `retro_serialize`/`unserialize`, con `libloading`.
- [x] 1.3 `cores.rs`: mapa sistema → core, descarga desde `buildbot.libretro.com/nightly/<os>/<arch>/latest/`, extracción y caché en `arcade_cores_dir`.
- [x] 1.4 `runner.rs`: thread a `timing.fps`, bitmask de botones, buffer de frame y cola de audio; cierre limpio (`retro_unload_game`, `retro_deinit`).

## 2. Streaming

- [x] 2.1 `av.rs`: ffmpeg rawvideo → fMP4 (`frag_keyframe+empty_moov`, `zerolatency`). **Pendiente audio** (segunda entrada s16le).
- [x] 2.2 `GET /api/channels/arcade/stream` en `api.rs` con `Body::from_stream` (mismo patrón que IPTV) y corte al cambiar de juego.
- [x] 2.3 Comandos `launch`, `press`, `release`, `reset`, `save_state`, `load_state`, `stop` en el canal.
- [x] 2.4 Estado del canal: `mode`, `system`, `core`, `fps`, `resolution`, `save_slots`, `error`.

## 3. Config y compatibilidad

- [x] 3.1 Claves `arcade_output_height`, `arcade_upscaler`, `arcade_shader`, `arcade_internal_scale`, `arcade_cores_dir` en `config.rs`.
- [x] 3.2 Si `arcade_default_emulator` o `arcade_emulators` están seteados, `launch` usa el binario externo (comportamiento actual).

## 4. Frontend

- [x] 4.1 `ArcadeLauncher.tsx`: al elegir un juego, abrir el player embebido en vez de esperar un proceso externo.
- [ ] 4.2 Player con canvas WebGL reusando `frontend/src/webgl/` y shaders `nearest` / `crt` / `xbr`; fallback a `<video>` con `image-rendering: pixelated`.
- [ ] 4.3 Mapeo de teclado hecho (flechas, Z/X, A/S, Enter, Shift); falta Gamepad API.
- [ ] 4.4 UI de savestates y estado de descarga del core.

## 5. Tests y verificación

- [ ] 5.1 Test de carga real por sistema con un ROM público (NES validado con `nestest.nes`; falta SNES/GB).
- [x] 5.2 Test del endpoint `/stream`: content-type, bytes > 0 y corte al cambiar de juego.
- [x] 5.3 Test de `save_state`/`load_state` (serialize → unserialize).
- [ ] 5.4 E2E manual: NES y SNES jugables a 720p y 1080p con shader `crt` y `nearest`.
- [ ] 5.5 Medir fps y CPU con 720p/1080p y documentar el resultado.
- [ ] 5.6 `./scripts/check.sh` verde y `openspec validate arcade-libretro-host` OK.

## 6. Docs

- [ ] 6.1 README: Arcade embebido, cores on-demand, upscaling y licencias.
- [ ] 6.2 HANDOFF y ROADMAP actualizados; ADR-0008 referenciado.
