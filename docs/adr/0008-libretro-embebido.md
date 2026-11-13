---
id: adr-0008
status: aceptada
version: 1.0.0
updated: 2026-11-13
---

# ADR-0008 — Emulación con cores libretro embebidos en el backend

## Contexto

El canal Arcade hoy sólo lanza un emulador externo (`arcade_default_emulator` con
`{rom}`). En macOS eso abre **otra ventana**: con el kiosko en fullscreen el juego
queda en otro Space o detrás, y el control remoto no puede mandarle input. Además
depende de que el usuario instale RetroArch o Mednafen a mano.

Se evaluaron tres caminos:

1. **Emulador externo** (RetroArch/Mednafen): cero código, pero ventana externa,
   input desconectado y setup manual.
2. **EmulatorJS (WASM)** en un webview: frontend listo, pero es JS, pesa más y
   N64/PSX rinden peor.
3. **Host libretro nativo en el backend Rust**: los cores son librerías nativas
   (`.dylib`/`.so`) con una API C de ~15 funciones; nosotros hacemos el loop y el
   streaming.

Spike previo (2026-11-13, macOS arm64): se cargó `fceumm_libretro.dylib` con
`libloading`, se ejecutó `retro_load_game` con un ROM público de test y 180
`retro_run()` produjeron frames 256×240 (XRGB8888, pitch 1024) y audio a 48 kHz.
La API `components`/FFI no requiere bindings generados: ~15 símbolos alcanzan.

## Decisión

- El canal Arcade usa **cores libretro cargados en proceso** por `catodo-server`,
  no un emulador externo.
- Los cores **no se empaquetan**: se descargan on-demand desde el buildbot público
  (`buildbot.libretro.com/nightly/<os>/<arch>/latest/`) a
  `~/.local/share/catodo/cores/`, igual que hace RetroArch. Evita distribuir GPL y
  mantiene el `.app` liviano.
- El core corre en un **thread dedicado** a la frecuencia que reporta
  `retro_get_system_av_info().timing.fps`.
- **Video**: el frame del core (XRGB8888/RGB565) se manda como `rawvideo` a
  `ffmpeg` (libx264, `zerolatency`) y sale como **fMP4** por el mismo endpoint de
  stream que ya usa IPTV.
- **Audio**: PCM s16 del core al mismo `ffmpeg` (segunda entrada) → AAC en el
  mismo fMP4.
- **Input**: comandos por el WS/HTTP existentes → `retro_input_state`.
- **Upscaling** en dos capas:
  - Cores 3D (PSX/N64): resolución interna 2x/4x vía core options.
  - 2D: el stream sale a resolución nativa y el kiosko lo escala en GPU con WebGL
    (reusando el motor de `frontend/src/webgl/`), con shaders `nearest`, `crt` o
    `xbr`. `arcade_output_height` (720/1080) define el tamaño del canvas.
- Fallback simple: `arcade_upscaler: "ffmpeg"` escala en el encode
  (`neighbor` para pixel art, `lanczos` para 3D).

## Consecuencias

Buenas:

- El juego se ve **dentro del kiosko**, sin ventanas externas ni Spaces.
- Performance nativa del core; el único costo es el encode (720p60 ≈ 2–4 % CPU,
  1080p60 ≈ 5–10 % en Apple Silicon).
- Un solo camino para macOS y Linux; el mismo endpoint de stream y el mismo WS.
- Savestates gratis (`retro_serialize`) y gamepad por la Gamepad API del webview.

Malas:

- Mantenemos FFI propio (`libloading` + tipos C): ~15 símbolos, pero hay que
  seguir la ABI si libretro cambia.
- Los cores son GPL en su mayoría: al descargarlos el usuario, no los
  redistribuimos, pero hay que documentar el origen y la licencia.
- El primer uso de un sistema necesita red para bajar el core (~1–5 MB).
- Los cores 3D pesados (N64) pueden no llegar a 60 fps en máquinas modestas.
- El encode agrega ~30–60 ms de latencia (aceptable para single-player).

## Alternativas descartadas

- **RetroArch embebido como app externa**: sigue siendo otra ventana y otro
  proceso que no controlamos.
- **EmulatorJS**: se descarta para la implementación principal por ser JS/WASM y
  rendir peor en 3D; queda como fallback si el host nativo se complica.
- **Reimplementar emuladores en Rust puro**: reinventar la rueda; los cores
  libretro ya están probados y cubren decenas de sistemas.
