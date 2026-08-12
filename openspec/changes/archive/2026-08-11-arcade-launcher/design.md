## Context

Cátodo ya tiene el patrón de "biblioteca local configurable" (`catodo/media.py` → `MediaLibraryChannel`, tipo `app`) y canales `web` vía webview. El canal Arcade reusa ese patrón de escaneo, pero en lugar de streamear video al kiosk debe **lanzar un emulador externo** (RetroArch/MAME) a pantalla completa y volver al launcher cuando el emulador termina. El backend controla todo vía `Channel` (open/close/state/command); el frontend rutea por `current.type`.

## Goals / Non-Goals

**Goals:**
- Canal Arcade (`launcher`) con grilla de juegos por sistema y carátulas.
- `command("launch")` que spawnea el emulador externo y supervisa su salida.
- Config persistente (`arcade_dir`, `arcade_emulators`, `arcade_default_emulator`).
- El reposo no se activa mientras corre un emulador.

**Non-Goals:**
- Emulación in-app, scraping de ROMs/carátulas, mapeo de controles, guardados en nube.

## Decisions

### 1. Nuevo tipo de canal `launcher` + `ArcadeChannel`
Se agrega `launcher` a `ChannelType` en `catodo/channel.py`. `ArcadeChannel` vive en `catodo/arcade.py`, se registra en `build_default_registry()` (después de las bibliotecas de media). El frontend rutea `type === "launcher"` → componente `ArcadeLauncher`.

### 2. Escaneo por sistemas (dos niveles)
`arcade_dir/<Sistema>/<Juego>/`: cada `<Juego>/` debe contener un archivo de ROM (ext: `.zip .nes .smc .sfc .gb .gba .md .n64 .rom .bin .iso`) y opcionalmente `boxart.png|jpg|jpeg`. El escaneo devuelve `systems: [{name, games: [{name, rom, rel, boxart?}]}]` con TTL (reusa el patrón `SCAN_TTL` de media). Sin carátula → el frontend muestra placeholder.

### 3. Servir carátulas
Nuevo endpoint `GET /api/channels/{channel_id}/boxart?path=<rel>` protegido por un protocol `SupportsBoxart` (patrón idéntico a `SupportsStream`/`/stream`). Devuelve la imagen o `404`. El frontend usa `<img src="…/boxart?path=…">`.

### 4. Lanzar emulador y supervisar salida
`command("launch", game=<rel>)`:
- Resuelve la plantilla del emulador: `arcade_emulators[system]` → `arcade_default_emulator` → error.
- Remplaza `{rom}` con la ruta real de la ROM y spawnea con `subprocess.Popen(…, shell=False, start_new_session=True)` (array de args, sin shell para no heredar comandos del nombre del archivo).
- Guarda `self._proc` y `self._current`; publica `game_launched` y `playing_changed: true`.
- Un task `asyncio` hace `await asyncio.to_thread(proc.wait)`; al salir publica `game_exited` y `playing_changed: false`, limpia `_current`. El frontend vuelve a mostrar la grilla al recibir `game_exited`.
- `close()` del canal no mata un emulador en curso (el juego sigue; es comportamiento tipo TV).

### 5. Reposo mientras se juega
El frontend ya considera "reproducción en curso" como actividad (App.tsx `pollPlaying`). Se extiende: los eventos `playing_changed` de Arcade actualizan el `playing` global del store, y `pollPlaying` también hace `wake()` si `state.playing`. Así el kiosk pinguea `/api/activity` mientras corre el emulador sin tocar el `IdleManager`.

### 6. Config
Claves en `runtime_config.KEYS`: `arcade_dir` (default `~/Arcade`), `arcade_emulators` (dict sistema→plantilla), `arcade_default_emulator` (plantilla `{rom}`). Editables vía `/api/config`.

## Risks / Trade-offs

- **Emulador no instalado/configurado** → `launch` falla. Se devuelve un error en la respuesta del comando y la UI lo muestra sin romper la grilla.
- **El emulador puede no abrir fullscreen** → depende del emulador (RetroArch `--fullscreen`). Se documenta en README que las plantillas deben incluirlo.
- **Ruta de ROM con espacios** → se pasa como argumento separado del array (nunca shell), así no se rompe.
- **Proceso huérfano si el kiosk se cierra** → `start_new_session=True` deja que el emulador siga; se acepta.
