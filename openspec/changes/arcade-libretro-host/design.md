## Context

`arcade.rs` hoy escanea `~/Arcade/<Sistema>/<Juego>/` y lanza un comando externo
con `{rom}`. El spike del 2026-11-13 validó cargar `fceumm_libretro.dylib` con
`libloading` desde Rust: `retro_init`, `retro_load_game` con un ROM público, 180
`retro_run()` con frames 256×240 (XRGB8888, pitch 1024) y audio 48 kHz.

## Goals / Non-Goals

**Goals**
- Jugar dentro del kiosko, sin ventanas externas, en macOS y Linux.
- 720p/1080p con upscaling de calidad (GPU para 2D, resolución interna para 3D).
- Input por teclado y gamepad, savestates, y cero instalación manual de cores.

**Non-Goals**
- Netplay, cheats, logros, rewind, shaders Slang.
- Empaquetar cores o ROMs.
- Reemplazar el override de emulador externo.

## Decisions

### 1. Host libretro en `arcade/`

```
arcade/
  mod.rs        ArcadeChannel (escaneo, estado, comandos) — reusa lo existente
  core.rs       carga del core + tipos FFI (libloading, sin bindgen)
  runner.rs     thread del core: retro_run a timing.fps, ring buffers de A/V
  av.rs         encode fMP4 (ffmpeg) y endpoint de stream
  cores.rs      resolución/descarga de cores desde el buildbot
```

Se escriben los tipos C a mano (~15 símbolos): evita una dependencia de bindings
y el spike ya demostró que alcanza. `libloading` es la única dependencia nueva.

### 2. Cores on-demand

`cores.rs` mapea sistema → core (`NES` → `fceumm`, `SNES` → `snes9x`, `GB/GBC` →
`gambatte`, `GBA` → `mgba`, `PSX` → `pcsx_rearmed`, `N64` → `mupen64plus_next`,
`MD` → `genesis_plus_gx`) y descarga
`https://buildbot.libretro.com/nightly/<os>/<arch>/latest/<core>_libretro.<ext>.zip`
a `~/.local/share/catodo/cores/`. Se cachea y se valida el `.dylib`/`.so` antes de
cargarlo. Sin red, el estado del canal reporta `core_missing` con el sistema.

### 3. Runner y streaming

Un thread por sesión:

- `retro_run()` a `timing.fps` con `Instant` + sleep compensado.
- Video: `retro_video_refresh` copia el frame a un buffer; `av.rs` lo manda como
  `rawvideo` (xrgb8888 o rgb565) a `ffmpeg -f rawvideo ... -c:v libx264 -preset
  ultrafast -tune zerolatency -f mp4 -movflags frag_keyframe+empty_moov`.
- Audio: `retro_audio_sample_batch` acumula PCM s16 en un ring buffer (~1 s).
  El mux con ffmpeg como segunda entrada (FIFO) quedó pendiente: ffmpeg abre
  ambos extremos pero no emite frames. Se evaluará PCM por WebSocket + WebAudio
  o `ffmpeg-next` embebido (ver tareas 7.x).
- Salida: `GET /api/channels/arcade/stream` con `Body::from_stream`, igual que
  IPTV (mismo patrón ya probado).

Latencia esperada: 30–60 ms (encode + buffer), aceptable para single-player.

### 4. Input

Comandos del canal:

```json
{"command":"press","button":"a"}
{"command":"release","button":"a"}
{"command":"reset"}
{"command":"save_state","slot":1}
{"command":"load_state","slot":1}
```

`runner.rs` mantiene un bitmask de botones (ABI `RETRO_DEVICE_JOYPAD`) y
`retro_input_state` lo devuelve. El kiosko mapea teclado (flechas, Z/X/A/S,
Enter/Esc) y la Gamepad API del webview; el remote puede mandar los mismos
comandos.

### 5. Upscaling

- **3D (PSX/N64)**: core options de resolución interna (`2x`/`4x`) cuando el core
  las expone; se setean antes de `retro_load_game`.
- **2D**: el stream sale a resolución nativa y el kiosko lo dibuja en un canvas
  WebGL (`frontend/src/webgl/`, mismo patrón que Anime4K) con shaders:
  `nearest` (píxel perfecto), `crt` (scanlines + curvatura) o `xbr`.
- `arcade_output_height`: `720` | `1080` (default 720).
- `arcade_upscaler`: `shader` (default) | `ffmpeg` (`scale=...:flags=neighbor` o
  `lanczos` según sistema).
- Fallback: si WebGL no inicializa, el `<video>` escala con
  `image-rendering: pixelated`.

### 6. Configuración

Claves nuevas en `config.rs`:

- `arcade_output_height` (720).
- `arcade_upscaler` (`shader`).
- `arcade_shader` (`crt`).
- `arcade_internal_scale` (`auto`).
- `arcade_cores_dir` (`~/.local/share/catodo/cores`).

`arcade_default_emulator` y `arcade_emulators` se mantienen: si están seteados, el
comando `launch` usa el binario externo (compatibilidad).

### 7. Estados y errores

`state()` del canal agrega `mode: "embedded" | "external"`, `system`, `core`,
`fps`, `resolution`, `save_slots` y `error`. Los eventos `arcade_core_missing`,
`arcade_core_download_failed` y `arcade_emulator_error` alimentan la UI.

## Risks / Trade-offs

- **FFI propio**: si libretro agrega comandos de environment nuevos, los
  desconocidos devuelven `false` (los cores lo toleran). Se cubre con tests de
  carga real por sistema.
- **Licencias**: los cores son GPL; se descargan del buildbot, no se empaquetan.
  El README lo documenta.
- **N64/PSX**: pueden no llegar a 60 fps; se reporta `fps` real en el estado.
- **Audio/video sync**: el mux de ffmpeg con dos entradas puede derivar; se
  monitorea con `-vsync cfr` y se resetea la sesión al cambiar de juego.
