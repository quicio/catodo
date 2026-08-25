## Why

Cátodo está atado a Linux en seis puntos de contacto con el SO: `pygobject`/DBus para Spotify/MPRIS, `wpctl`/`pactl` para volumen, `xdotool`/`ydotool` para inyección de input, `xdg-open` para URIs, `ss`+`/proc` en launchers, `systemd` para autostart, y `electron-builder --linux` para packaging. A eso se suma `scripts/install_castlab.sh` que sólo descarga assets `linux-${ARCH}` para el binario de Electron con Widevine. Queremos correr el kiosk shell completo sobre macOS Apple Silicon sin perder la base Linux: el backend, los canales web (YouTube, TV, Crunchyroll), Anime/Arcade, remote, screencast y —para DRM— el launcher castLabs portable.

## What Changes

- **Capa hexagonal (ports & adapters) para los subsistemas OS-touched del backend**. `catodo/domain/ports.py` define `MixerPort`, `InputInjectorPort`, `UriOpenerPort` y `SpotifyClientPort` como `Protocol` PEP 544. `catodo/infrastructure/{linux,macos}/` contiene los adapters concretos (Linux: `WpctlPactlMixer`, `YdotoolInjector`/`XdotoolInjector`, `XdgUriOpener`, `DbusSpotifyClient`; macOS: `OsascriptMixer`, `CliclickInjector`/`OsascriptInjector`, `MacOpenUriOpener`, `DbusslessSpotifyClient` Null). `catodo/infrastructure/factory.py` selecciona el adapter según `platform.IS_MACOS`. El composition root (`main.py:44 lifespan`) instancia los adapters y los guarda en `app.state`. Los consumers existentes (`mixer.py`, `mouse.py`, `channels/spotify.py`) quedan como fachadas finas que delegan al port — firmas públicas sin cambios.
- **`pygobject` gated por PEP 508**: `sys_platform == 'linux'` en `pyproject.toml`. `uv sync` en macOS no resuelve wheels; los `try/except ImportError` absorben el runtime. El composition root omite el registro del canal Spotify cuando `spotify_client.is_available()` devuelve `False`.
- **castLabs Electron install portable**: `scripts/install_castlab.sh` detecta OS con `uname -s`. Linux mantiene el asset `linux-${ARCH}.zip` y el path FHS actual. macOS baja `darwin-${ARCH}.zip`, extrae a `frontend/electron-castlab/Electron.app/` (binario en `Contents/MacOS/Electron`), sin wrapper bash ni `chrome-sandbox`. `run-dev.sh` resuelve `CASTLAB_ELECTRON` por plataforma y cae a `npx electron` con el warning actual si no está instalado.
- **Scripts portables**: `scripts/_lib.sh` con `current_pid()` y `backend_stale()` que branch por OS (`lsof`+`ps -o lstart=`+`stat -f %m` en macOS). `install.sh` rama macOS con mapa de brew formulae, sin sudo, sin unit systemd (autostart documentado vía Login Items). `build.sh` decide target electron-builder según OS (`--linux` o `--mac dir zip`).
- **Frontend packaging**: target `mac` (`dir`+`zip`) agregado a `frontend/package.json:build`. Sin notarización.
- **Documentación**: sección "macOS (Apple Silicon)" en README con requisitos (brew, python3 ≥3.12, uv, node 20+, cliclick opcional, ffmpeg opcional), dev steps, castLabs install, limitaciones (Spotify deshabilitado, Widevine vía castLabs-Electron-macOS, prompt TCC para osascript).
- Sin cambios a API HTTP ni al formato de `~/.local/share/catodo/`.

## Capabilities

### New Capabilities

- `cross-platform-runtime`: capa hexagonal de abstracción OS-touched en el backend (mixer, input injector, URI opener, Spotify client) con adapters por plataforma, factory selector y composition root.
- `kiosk-drm-engine`: install y dev launcher del Electron castLabs portable por plataforma (Linux x64/arm64, macOS x64/arm64), con fallback a stock Electron cuando no está instalado.

### Modified Capabilities

- `spotify-channel`: el canal SHALL auto-desactivarse (registro omitido, no error) cuando el SpotifyClientPort reporta `is_available() == False` (caso macOS). `GET /api/channels` no muestra el canal.

## Impact

- Backend nuevos: `backend/catodo/domain/ports.py`, `backend/catodo/infrastructure/linux/{mixer,input_injector,uri_opener,spotify_client}.py`, `backend/catodo/infrastructure/macos/{mixer,input_injector,uri_opener,spotify_client}.py`, `backend/catodo/infrastructure/factory.py`.
- Backend modificados: `mixer.py` (fachada → port), `mouse.py` (fachada → port), `channels/spotify.py` (usa `SpotifyClientPort`), `manager.py` (gating), `main.py` (composition root), `pyproject.toml` (marker PEP 508).
- Scripts: `install.sh`, `run-dev.sh`, `run-prod.sh`, `build.sh`, `scripts/install_castlab.sh`, nuevo `scripts/_lib.sh`.
- Frontend: `frontend/package.json` (mac target). `frontend/electron/main.cjs` sin cambios de fondo.
- Docs: `README.md` (sección macOS).
- Sin breaking changes en API HTTP ni en el formato de `~/.local/share/catodo/`. El usuario Linux no nota cambios.

## Non-goals

- Spotify en macOS vía AppleScript — el canal se omite vía Null adapter. Queda como follow-up.
- Notarización Apple ni `.dmg` firmado — target `dir`/`zip` sin firma.
- Windows — no se aborda.
- castLabs bundled dentro del `.app` empaquetado — sólo en dev launcher (documentado como limitación para DRM en "prod" macOS).
- Data dir macOS idiomático (`~/Library/Application Support`) — se mantiene `~/.local/share/catodo/`.