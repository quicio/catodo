## 1. Backend — domain ports (Protocols)

- [x] 1.1 Crear `backend/catodo/domain/__init__.py` (vacío) y `backend/catodo/domain/ports.py` con `Protocol` PEP 544: `MixerPort` (get_volume, set_volume, set_default_sink, is_available), `InputInjectorPort` (move, click, scroll, key, type_text, is_available), `UriOpenerPort` (open), `SpotifyClientPort` (is_available, play, pause, next, previous, set_volume, open_uri, get_state).
- [x] 1.2 Crear `backend/catodo/platform.py` con `IS_MACOS`, `IS_LINUX` (de `sys.platform`), `os_name()`, `has_dbus()` (intenta `Gio.bus_get_sync` envuelto en try/except).
- [x] 1.3 Test en `backend/tests/test_domain_ports.py`: cada Protocol se puede satisficar con una clase vacía que tenga los métodos correctos (verifica duck typing).

## 2. Backend — adapters Linux

- [x] 2.1 Crear `backend/catodo/infrastructure/__init__.py` y `backend/catodo/infrastructure/linux/__init__.py`.
- [x] 2.2 `backend/catodo/infrastructure/linux/mixer.py` con `WpctlPactlMixer`: mueve la lógica actual de `mixer.py` (wpctl → pactl → no-op) sin cambios de comportamiento. Implementa `MixerPort`.
- [x] 2.3 `backend/catodo/infrastructure/linux/input_injector.py` con `YdotoolInjector` y `XdotoolInjector`: mueven la lógica de `mouse.py:_detect()` con los diccionarios de keys existentes. Cada uno implementa `InputInjectorPort`. Factory helper local elige entre ellos según `shutil.which`.
- [x] 2.4 `backend/catodo/infrastructure/linux/uri_opener.py` con `XdgUriOpener` (usa `xdg-open` o `gio`). Implementa `UriOpenerPort`.
- [x] 2.5 `backend/catodo/infrastructure/linux/spotify_client.py` con `DbusSpotifyClient`: encapsula la lógica DBus/MPRIS de `channels/spotify.py:_ensure/_get/_set/_call_method/_read_state` + `is_available()` que verifica `gi` importable y bus accesible.

## 3. Backend — adapters macOS

- [x] 3.1 `backend/catodo/infrastructure/macos/__init__.py`.
- [x] 3.2 `backend/catodo/infrastructure/macos/mixer.py` con `OsascriptMixer`: `get_volume` con `osascript -e 'output volume of (get volume settings)'` parseando el primer entero; `set_volume(N)` con `osascript -e "set volume output volume <N>"`; `set_default_sink` no-op con `log.info` (sin equivalente directo); `is_available()` = `shutil.which("osascript") is not None`.
- [x] 3.3 `backend/catodo/infrastructure/macos/input_injector.py` con `CliclickInjector` (usa `cliclick m:dx,dy`, `cliclick c:x,y`, `cliclick kp:<key>`) y `OsascriptInjector` (fallback con `osascript`+`System Events` para click/keystroke). Factory local prefiere `cliclick`, cae a `osascript` si no está.
- [x] 3.4 `backend/catodo/infrastructure/macos/uri_opener.py` con `MacOpenUriOpener` que ejecuta `open <uri>` como subprocess detached.
- [x] 3.5 `backend/catodo/infrastructure/macos/spotify_client.py` con `DbusslessSpotifyClient`: `is_available()` siempre `False`, resto de métodos no-op con `log.debug("spotify_client: not available on this platform")`. Log único al construir.

## 4. Backend — factory

- [x] 4.1 `backend/catodo/infrastructure/factory.py` con `build_mixer()`, `build_input_injector()`, `build_uri_opener()`, `build_spotify_client()`. Cada uno chequea `platform.IS_MACOS` y devuelve el adapter de la plataforma correcta. Cachea el resultado en variable de módulo (singleton por proceso).
- [x] 4.2 Test en `backend/tests/test_factory.py`: monkeypatching `platform.IS_MACOS` verifica que cada factory devuelve el adapter esperado.

## 5. Backend — composition root

- [x] 5.1 En `backend/catodo/main.py:44 lifespan()`, agregar después del bloque existente: `app.state.mixer = build_mixer(); app.state.input_injector = build_input_injector(); app.state.uri_opener = build_uri_opener(); app.state.spotify_client = build_spotify_client()`.
- [x] 5.2 En `backend/catodo/manager.py:build_default_registry()`, antes de incluir `SpotifyChannel`, consultar `app.state.spotify_client.is_available()` (pasando el port como param al registry builder desde lifespan, o vía un módulo-level `set_spotify_client()` setter del composition root). Si False, omitir y log único "Spotify channel disabled: SpotifyClientPort reports not available".

## 6. Backend — refactor consumers a fachadas

- [x] 6.1 En `backend/catodo/mixer.py`: reducir a fachada que delega a `request.app.state.mixer` (vía un helper `_get_mixer(request)`). Mantener `get_volume`, `set_volume`, `adjust_volume`, `set_default_sink`, `has_mixer` con mismas firmas y semántica para no tocar call sites.
- [x] 6.2 En `backend/catodo/mouse.py`: idem, `move`/`click`/`scroll`/`key`/`type_text` delegan a `request.app.state.input_injector`. Los endpoints FastAPI siguen leyendo `request` así que el cambio queda contenido.
- [x] 6.3 En `backend/catodo/channels/spotify.py`: el `SpotifyChannel` recibe un `SpotifyClientPort` por constructor (en lugar de instanciar el cliente DBus internamente). Cuando `is_available()` es False, `_read_state` retorna `{"available": False}` y los demás métodos no-op.
- [x] 6.4 Verificar que los tests existentes (`tests/test_volume.py`, `tests/test_mixer.py` si existe, etc.) siguen pasando con las fachadas (mockeando `app.state.*`).

## 7. Backend — pyproject gating

- [x] 7.1 `backend/pyproject.toml`: agregar `; sys_platform == 'linux'` al spec de `pygobject`. Regenerar `uv.lock` con `uv lock`.
- [x] 7.2 Smoke test: `uv pip list | grep -i pygobject` en macOS no muestra la dependencia.

## 8. Backend — tests para los nuevos adapters y factory

- [x] 8.1 `backend/tests/test_macos_mixer.py`: mockea `asyncio.create_subprocess_exec` para verificar que `OsascriptMixer.set_volume(70)` invoca `osascript -e "set volume output volume 70"`.
- [x] 8.2 `backend/tests/test_macos_input_injector.py`: mockea subprocess, cubre `CliclickInjector.move(100,-50)` → `cliclick m:100,-50` y fallback a `OsascriptInjector` cuando `cliclick` no está.
- [x] 8.3 `backend/tests/test_dbusless_spotify.py`: `DbusslessSpotifyClient.is_available()` es `False`; `play/pause/etc.` son no-op sin excepción.
- [x] 8.4 `backend/tests/test_manager_gating.py`: con `app.state.spotify_client` monkeypatched a `DbusslessSpotifyClient`, el registry no incluye Spotify.

## 9. Scripts — `_lib.sh` portable

- [x] 9.1 Crear `scripts/_lib.sh` con `current_pid()` y `backend_stale()` que branch por OS (Linux: `ss`+`/proc/<pid>/stat`+`stat -c %Y`; macOS: `lsof`+`ps -o lstart=`+`stat -f %m`).
- [x] 9.2 `run-dev.sh` y `run-prod.sh`: reemplazar definiciones inline por `source "$ROOT_DIR/scripts/_lib.sh"`. Verificar zero-diff de comportamiento en Linux con `bash scripts/check.sh` + smoke manual.

## 10. Scripts — install.sh rama macOS

- [x] 10.1 Al inicio de `install.sh` (antes de PM detection): `if [ "$(uname -s)" = "Darwin" ]; then ...`. En la rama: mapa bin→brew formulae (`brew`, `python3`, `uv`, `node`, `npm`, `cliclick` opcional, `ffmpeg` opcional); nunca `sudo`; nunca unit systemd.
- [x] 10.2 Al final de la rama macOS: imprimir bloque "macOS autostart: agregá ./run-prod.sh a System Settings → General → Login Items" con instrucciones exactas.
- [x] 10.3 Verificar `bash install.sh --check` en macOS reporta requisitos faltantes con `brew install <pkg>`.

## 11. castLabs — install portable

- [x] 11.1 `scripts/install_castlab.sh`: detectar OS con `uname -s`. En Linux mantener el flujo actual (asset `linux-${ARCH}.zip`, extracción a `usr/lib/electron-castlab/`, wrapper bash, `linux-app-id.js`, `chrome-sandbox` chmod).
- [x] 11.2 En macOS: asset `darwin-${ARCH}.zip`, extracción directa a `frontend/electron-castlab/` (el zip de castLabs contiene `Electron.app/`), sin wrapper bash, sin `chrome-sandbox` chmod. Mismo control de idempotencia y `--force`.
- [x] 11.3 Verificar `bash scripts/install_castlab.sh` en macOS produce `frontend/electron-castlab/Electron.app/Contents/MacOS/Electron` ejecutable.
- [x] 11.4 Verificar que el flujo Linux no se rompe (regression guard).

## 12. castLabs — dev launcher portable

- [x] 12.1 `run-dev.sh:111`: reemplazar la detección actual por branch por OS. macOS busca `frontend/electron-castlab/Electron.app/Contents/MacOS/Electron`; Linux mantiene el path actual. Si no existe, `CASTLAB_ELECTRON=""` y warning de hoy.
- [x] 12.2 Verificar `./run-dev.sh` en macOS con castLabs instalado arranca el shell desde `Electron.app/Contents/MacOS/Electron`.
- [x] 12.3 Verificar fallback a `npx electron` en macOS sin castLabs (warning visible).

## 13. Frontend — mac target electron-builder

- [x] 13.1 `frontend/package.json:build`: agregar `"mac": { "target": ["dir", "zip"], "icon": "../catodo.png", "category": "public.app-category.entertainment" }`.
- [x] 13.2 `build.sh`: detectar OS con `uname -s`. Linux → `npx electron-builder --linux AppImage deb` (actual); macOS → `npx electron-builder --mac dir zip`. Mantener la copia final a `release/`.
- [x] 13.3 Verificar `npm run electron:build:mac` produce `frontend/release/mac/catodo-frontend.app/` y `frontend/release/catodo-frontend-*.zip` en macOS.

## 14. Docs — sección macOS en README

- [x] 14.1 Agregar sección "macOS (Apple Silicon)" en `README.md`: requisitos (brew, python3 ≥3.12, uv, node 20+, cliclick opcional, ffmpeg opcional), paso a paso dev (`./run-dev.sh`), paso castLabs (`bash scripts/install_castlab.sh`), limitaciones (Spotify deshabilitado, DRM sólo en dev, sin autostart automático).
- [x] 14.2 Documentar el prompt TCC de macOS para `osascript`+accesibilidad (System Settings → Privacy & Security → Accessibility).
- [x] 14.3 Documentar el bypass de Gatekeeper para el `.app` empaquetado: "click derecho → Abrir" o `codesign --deep --sign -`.

## 15. Regression guard

- [x] 15.1 `scripts/check.sh` (ruff + pytest + tsc) pasa en Linux después de todos los cambios.
- [x] 15.2 `backend/tests/test_volume.py` y otros tests de subsistema siguen pasando con las fachadas (sin cambios funcionales observables).