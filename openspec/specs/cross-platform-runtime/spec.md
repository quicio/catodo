# cross-platform-runtime Specification

## Purpose
Define la capa de abstracción cross-platform que permite a Cátodo correr de forma idéntica en Linux y macOS Apple Silicon, enrutando cada subsistema OS-touched al backend nativo disponible en cada plataforma sin cambiar la API HTTP ni el formato de datos persistidos.
## Requirements
### Requirement: Detección de plataforma en runtime

El sistema SHALL detectar el SO en runtime y exponer banderas de plataforma (`IS_MACOS`, `IS_LINUX`) y helpers de capacidades (`has_dbus()`) que el resto del backend consulta antes de cargar dependencias OS-específicas.

#### Scenario: Backend arranca en Linux
- **WHEN** el proceso arranca en un sistema con kernel Linux
- **THEN** `IS_LINUX` es `True`, `IS_MACOS` es `False`, y `has_dbus()` devuelve `True` cuando hay session bus accesible.

#### Scenario: Backend arranca en macOS
- **WHEN** el proceso arranca en un sistema con kernel Darwin (macOS)
- **THEN** `IS_MACOS` es `True`, `IS_LINUX` es `False`, y `has_dbus()` devuelve `False` (DBus no es parte del SO; si fue instalado por el usuario vía brew queda fuera del contrato).

### Requirement: Mixer portable

El sistema SHALL aplicar cambios de volumen al output de audio del sistema usando una herramienta nativa disponible en la plataforma. En Linux SHALL usar `wpctl` (PipeWire) o `pactl` (PulseAudio), detectados al arranque. En macOS SHALL usar `osascript` con `set volume output volume N` (0–100). Si ninguna herramienta está disponible, SHALL mantener el valor en memoria sin error.

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

El sistema SHALL traducir las peticiones del remote de mouse (`/api/mouse/move`, `/api/mouse/click`, `/api/mouse/scroll`) y teclado (`/api/mouse/key`, `/api/mouse/type`) a primitivas nativas de la plataforma. En Linux SHALL usar `ydotool` (Wayland) o `xdotool` (X11). En macOS SHALL usar `cliclick` (preferido, instalable vía brew) o `osascript` con `tell application "System Events"` como fallback. Sin herramienta disponible SHALL devolver HTTP 503 con detalle explícito.

#### Scenario: Mouse move en macOS con cliclick
- **WHEN** el remote envía `POST /api/mouse/move` con `{dx: 100, dy: -50}` y `cliclick` está en PATH
- **THEN** `cliclick m:100,-50` se ejecuta y el cursor se desplaza relativamente.

#### Scenario: Keystroke en macOS con cliclick
- **WHEN** el remote envía `POST /api/mouse/key` con `{key: "enter"}` y `cliclick` está disponible
- **THEN** `cliclick kp:return` se ejecuta y Enter se inyecta en la app enfocada.

#### Scenario: Sin herramienta de input
- **WHEN** el remote invoca `/api/mouse/*` y no hay herramienta nativa disponible
- **THEN** el endpoint responde HTTP 503 con `{"detail": "input injector not available on this platform"}`.

### Requirement: Apertura de URIs portable

El sistema SHALL abrir URIs externas (Spotify, deep links) usando el handler nativo de la plataforma. En Linux SHALL usar `xdg-open` o `gio open`. En macOS SHALL usar `open <uri>`. Si ninguno está disponible SHALL intentar `webbrowser.open()` como último recurso y loggear el fallo.

#### Scenario: Open Spotify URI en macOS
- **WHEN** el canal Spotify invoca `_open_uri("spotify:track:xyz")` en macOS
- **THEN** `open "spotify:track:xyz"` se lanza como proceso detached y la app Spotify (si está instalada) toma el foco.

### Requirement: Dependencias OS-only gated por plataforma

El sistema SHALL no requerir dependencias Linux-only cuando corre en macOS. La declaración de dependencias SHALL gatear `pygobject` (DBus) detrás del marker PEP 508 `sys_platform == 'linux'` para que `uv sync` no lo instale fuera de Linux. Los `import` SHALL estar envueltos en `try/except ImportError` para tolerar la ausencia.

#### Scenario: uv sync en macOS
- **WHEN** `uv sync` corre en macOS
- **THEN** `pygobject` no se instala y `uv.lock` no incluye wheels para esa dependencia.

#### Scenario: Backend arranca sin pygobject
- **WHEN** el backend arranca en macOS e intenta importar `gi.repository`
- **THEN** el `except ImportError` absorbe el fallo, loggea una vez "pygobject not available on this platform", y el canal Spotify queda no disponible.

### Requirement: Scripts de bootstrap portables

Los scripts `install.sh`, `run-dev.sh`, `run-prod.sh` y `build.sh` SHALL detectar la plataforma con `uname -s` y usar primitivas nativas disponibles. `install.sh` SHALL instalar paquetes del sistema solo en Linux (con sudo + gestor de paquetes detectado); en macOS SHALL solo verificar requisitos y reportar qué falta. `run-dev.sh` y `run-prod.sh` SHALL usar `lsof -nP -iTCP:PORT -sTCP:LISTEN -t` para detectar el PID del backend en macOS (en lugar de `ss`) y `ps -p PID -o lstart=` para calcular el start time del proceso (en lugar de `/proc/<pid>/stat`). `build.sh` SHALL elegir el target de electron-builder según OS (`--linux` en Linux, `--mac` en macOS).

#### Scenario: run-dev.sh en macOS
- **WHEN** `./run-dev.sh` se ejecuta en macOS y el puerto 8765 está libre
- **THEN** el script no intenta usar `ss` ni `/proc`, arranca Vite + Electron con backend fresh, y limpia los procesos en Ctrl+C.

#### Scenario: install.sh --check en macOS
- **WHEN** `bash install.sh --check` se ejecuta en macOS sin brew instalado
- **THEN** el script reporta `brew: FALTA — instalar con el instalador oficial de brew.sh` y sale con código 1, sin intentar instalar nada.

### Requirement: Decisión de Spotify por plataforma

El backend SHALL registrar el canal Spotify solo cuando el `SpotifyClientPort` configurado reporta `is_available() == True`. Cuando reporta `False` (macOS por defecto, o Linux sin DBus session bus) SHALL omitir el registro, loggear una vez "Spotify channel disabled: SpotifyClientPort reports not available", y no incluir el canal en `GET /api/channels` ni en la barra del frontend.

#### Scenario: Arranque en macOS
- **WHEN** el backend arranca en macOS
- **THEN** `GET /api/channels` no incluye `spotify` y el frontend muestra el slot Ch1 como "no disponible en esta plataforma" sin error.

#### Scenario: Arranque en Linux sin sesión DBus
- **WHEN** el backend arranca en Linux sin DBus session bus accesible
- **THEN** se aplica la misma omisión (defensa en profundidad: la disponibilidad real se evalúa por plataforma, no se asume DBus en Linux).

