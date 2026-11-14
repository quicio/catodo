# cross-platform-runtime Specification

## Purpose
Define la capa de abstracción cross-platform que permite a Cátodo correr de forma idéntica en Linux y macOS Apple Silicon, enrutando cada subsistema OS-touched al backend nativo disponible en cada plataforma sin cambiar la API HTTP ni el formato de datos persistidos. La implementación es Rust; no hay dependencias Python.

## Requirements
### Requirement: Detección de plataforma en runtime

El sistema SHALL detectar el SO y la arquitectura en `catodo-platform` (`Os`, `Arch`, `PlatformInfo`) y exponer el resultado al resto del backend. El código OS-específico SHALL aislarse con `#[cfg(target_os = "linux")]` / `#[cfg(target_os = "macos")]`, no con ramas de runtime sobre strings.

#### Scenario: Backend arranca en Linux
- **WHEN** el proceso arranca en un sistema con kernel Linux
- **THEN** `PlatformInfo.detect().os` es `Os::Linux` y se compilan los adapters Linux.

#### Scenario: Backend arranca en macOS
- **WHEN** el proceso arranca en macOS
- **THEN** `PlatformInfo.detect().os` es `Os::Macos` y se compilan los adapters macOS.

### Requirement: Mixer portable

El sistema SHALL aplicar cambios de volumen al output de audio del sistema usando una herramienta nativa disponible en la plataforma. En Linux SHALL usar `wpctl` (PipeWire) y caer a `pactl` (PulseAudio). En macOS SHALL usar `osascript` con `set volume output volume N` (0–100). Si ninguna herramienta está disponible o falla, SHALL mantener el valor en memoria sin error.

#### Scenario: Set volume en Linux con PipeWire
- **WHEN** `POST /api/volume?level=70` se ejecuta en un sistema con `wpctl` disponible
- **THEN** el volumen del sink por defecto se setea a 70% vía `wpctl set-volume @DEFAULT_AUDIO_SINK@ 70%`.

#### Scenario: Set volume en macOS
- **WHEN** `POST /api/volume?level=70` se ejecuta en macOS
- **THEN** `osascript -e "set volume output volume 70"` se ejecuta y la respuesta reporta 70.

#### Scenario: Sin mixer disponible
- **WHEN** ninguna herramienta de mixer está disponible en la plataforma
- **THEN** el valor en memoria se actualiza y la API responde 200 sin invocar nada del sistema.

### Requirement: Inyección de input desde el remote

El sistema SHALL traducir las peticiones del remote de mouse (`/api/mouse/move`, `/api/mouse/click`, `/api/mouse/scroll`) y teclado (`/api/mouse/key`, `/api/mouse/type`) a primitivas nativas de la plataforma. En Linux SHALL usar `xdotool`. En macOS SHALL usar `cliclick` y, para tipeo, `osascript` con `tell application "System Events"` como fallback. Sin herramienta disponible SHALL devolver HTTP 503 con detalle explícito.

#### Scenario: Mouse move en macOS con cliclick
- **WHEN** el remote envía `POST /api/mouse/move` con `{dx: 100, dy: -50}` y `cliclick` está en PATH
- **THEN** `cliclick m:100,-50` se ejecuta y el cursor se desplaza relativamente.

#### Scenario: Keystroke en macOS con cliclick
- **WHEN** el remote envía `POST /api/mouse/key` con `{key: "enter"}` y `cliclick` está disponible
- **THEN** `cliclick kp:return` se ejecuta y Enter se inyecta en la app enfocada.

#### Scenario: Sin herramienta de input
- **WHEN** el remote invoca `/api/mouse/*` y no hay herramienta nativa disponible
- **THEN** el endpoint responde HTTP 503 con `{"detail": "input injector not available"}`.

### Requirement: Apertura de URIs portable

El sistema SHALL abrir URIs externas (Spotify, deep links) usando el handler nativo de la plataforma. En Linux SHALL usar `xdg-open`. En macOS SHALL usar `open` o el `open location` de AppleScript. Si falla, SHALL devolver/loggear el error sin tumbar el backend.

#### Scenario: Open Spotify URI en macOS
- **WHEN** el canal Spotify invoca `open_uri("spotify:track:xyz")` en macOS
- **THEN** la app Spotify (si está instalada) toma el foco.

### Requirement: Sin dependencias Python

El sistema SHALL NOT requerir Python, pip, PyGObject, uv ni un venv para correr, testear o empaquetar. Las dependencias del SO SHALL invocarse como procesos externos y su ausencia SHALL degradar el canal o endpoint afectado, no el arranque.

#### Scenario: Backend en macOS sin Python
- **WHEN** el binario Rust arranca en macOS sin `python3` en PATH
- **THEN** el backend arranca, sirve la API y sólo quedan no disponibles los canales que dependan de herramientas ausentes.

#### Scenario: Canal Spotify sin MPRIS
- **WHEN** el backend arranca en Linux sin `playerctl` o sin DBus session bus
- **THEN** el canal Spotify se omite del registry y el resto de la API sigue funcionando.

### Requirement: Scripts de bootstrap portables

Los scripts `install.sh`, `run-dev.sh`, `run-prod.sh`, `build.sh` y `scripts/_lib.sh` SHALL detectar la plataforma con `uname -s` y usar primitivas nativas disponibles. `install.sh` SHALL instalar paquetes del sistema solo en Linux (con sudo + gestor de paquetes detectado); en macOS SHALL solo verificar requisitos y reportar qué falta. `run-dev.sh` y `run-prod.sh` SHALL usar `lsof -nP -iTCP:PORT -sTCP:LISTEN -t` para detectar el PID del backend en macOS (en lugar de `ss`) y `ps -p PID -o lstart=` para calcular el start time del proceso (en lugar de `/proc/<pid>/stat`). `build.sh` SHALL elegir el empaquetador de la app según OS (`package-linux-app.sh` en Linux, `package-macos-app.sh` en macOS).

#### Scenario: run-dev.sh en macOS
- **WHEN** `./run-dev.sh` se ejecuta en macOS y el puerto 8765 está libre
- **THEN** el script no intenta usar `ss` ni `/proc`, arranca Vite + Electron con backend fresh, y limpia los procesos en Ctrl+C.

#### Scenario: install.sh --check en macOS
- **WHEN** `bash install.sh --check` se ejecuta en macOS sin brew instalado
- **THEN** el script reporta `brew: FALTA`, sale con código 1 y no intenta instalar nada.

### Requirement: Decisión de Spotify por plataforma

El backend SHALL registrar el canal Spotify solo cuando el `SpotifyClient` por defecto reporta disponibilidad. En macOS SHALL requerir `Spotify.app` instalada y `osascript`; en Linux SHALL requerir `playerctl` y `DBUS_SESSION_BUS_ADDRESS`. Si no está disponible SHALL omitir el canal, loggear una vez y no incluirlo en `GET /api/channels`.

#### Scenario: Arranque en macOS sin Spotify.app
- **WHEN** el backend arranca en macOS sin `/Applications/Spotify.app`
- **THEN** `GET /api/channels` no incluye `spotify` y el frontend no muestra un error.

#### Scenario: Arranque en Linux con MPRIS
- **WHEN** el backend arranca en Linux con `playerctl` y session bus
- **THEN** `GET /api/channels` incluye `spotify` y sus comandos se enrutan a `playerctl -p spotify`.
