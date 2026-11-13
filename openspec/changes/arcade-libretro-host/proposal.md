## Why

El canal Arcade sólo lanza un emulador externo con `{rom}`. En macOS eso abre otra
ventana: con el kiosko en fullscreen el juego queda en otro Space o detrás, el
control remoto no le puede mandar input y el usuario tiene que instalar RetroArch
o Mednafen a mano. Además no hay forma de escalar a 720p/1080p con buena calidad.

Un spike validó que se puede cargar un core libretro nativo desde Rust
(`fceumm` + ROM público, 180 frames 256×240 XRGB8888 y audio 48 kHz), así que el
camino viable es hacer de host: correr el core en el backend y streamear video y
audio al kiosko.

## What Changes

- Nuevo **host libretro** en `catodo-server`: carga el core con `libloading`,
  corre `retro_run()` en un thread dedicado y expone video/audio/input por el
  canal Arcade.
- **Cores on-demand**: se descargan desde el buildbot público a
  `~/.local/share/catodo/cores/` según el sistema del juego; no se empaquetan.
- **Stream**: el frame del core se encodea a fMP4 (libx264) y se sirve por el
  mismo endpoint que IPTV; el audio PCM va en el mismo mux.
- **Input**: comandos del canal (`press`, `release`, `reset`, `save_state`,
  `load_state`) traducidos a `retro_input_state`; teclas y gamepad desde el kiosko.
- **Upscaling**: cores 3D con resolución interna 2x/4x; 2D con shader GPU en el
  kiosko (`nearest`/`crt`/`xbr`), salida configurable a 720p o 1080p.
- **UI**: el launcher Arcade deja de lanzar un proceso externo y abre el player
  embebido, con savestates y selector de sistema.

## Capabilities

### New Capabilities
- `arcade-emulation`: host libretro embebido con cores on-demand, streaming
  fMP4, input, savestates y upscaling configurable.

### Modified Capabilities
- `arcade-launcher`: el lanzamiento deja de depender de un emulador externo; el
  comando `launch` abre el player embebido y `arcade_default_emulator` /
  `arcade_emulators` quedan como override opcional para usuarios que prefieran un
  binario externo.

## Impact

- **Backend**: `rust/crates/catodo-server/src/arcade/` (nuevo módulo con
  `core.rs`, `runner.rs`, `av.rs`, `cores.rs`), `config.rs` (claves nuevas),
  `api.rs` (stream + comandos), `Cargo.toml` (`libloading`).
- **Frontend**: `ArcadeLauncher.tsx` + player con WebGL para upscaling.
- **Datos**: `~/.local/share/catodo/cores/` (cores) y savestates junto a los ROMs.
- **Docs**: ADR-0008, README (Arcade y upscaling) y HANDOFF.
- **Riesgo**: FFI propio, licencias GPL de los cores (se descargan, no se
  redistribuyen) y performance de cores 3D pesados.

## Non-goals

- Netplay, cheats, logros, rewind y shaders Slang/GLSL arbitrarios (v1 sólo
  `nearest`/`crt`/`xbr` propios).
- Empaquetar cores o ROMs en el `.app`/AppImage.
- Sustituir el override externo: quien ya tenga RetroArch configurado lo puede
  seguir usando.
