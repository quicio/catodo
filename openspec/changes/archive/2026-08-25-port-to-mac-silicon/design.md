## Context

Cátodo es una shell multimedia que en su forma actual asume Linux en cada subsistema OS-touched: `pygobject` para DBus/MPRIS (Spotify), `wpctl`/`pactl` para volumen, `xdotool`/`ydotool` para inyección de input, `xdg-open`/`gio` para URIs, `ss`+`/proc/<pid>/stat` en launchers, `/etc/os-release` en el instalador, unit `systemd` para autostart y packaging `--linux` en electron-builder. A esto se suma `scripts/install_castlab.sh` que descarga únicamente assets `linux-${ARCH}` para el Electron con Widevine — los canales DRM (Movistar TV, HBO Max) sólo funcionan en Linux.

La primera versión de este change proponía un módulo `catodo/platform.py` con branches `if platform.IS_MACOS:` dispersos por cada subsistema. Esa solución resuelve el problema de port pero acumula condicionales en el código de dominio — cuando se sume Windows o un nuevo subsistema OS-touched, el patrón se vuelve spaghetti. Este diseño revisado adopta **arquitectura hexagonal (ports & adapters) + DDD-ish** en la capa OS-touched: el dominio expone contratos abstractos; los adapters viven en `infrastructure/{linux,macos}/`; un factory selecciona según OS; el composition root inyecta vía `app.state`. Los consumers existentes quedan como fachadas finas — sin cambios en API, tests ni call sites.

## Goals / Non-Goals

**Goals:**

- Backend FastAPI corre idéntico en Linux y macOS Apple Silicon con un único `uv run`.
- El mismo frontend Electron build arranca en ambos OS; el switch `process.platform === 'darwin'` ya está cubierto en `main.cjs:352`.
- Auto-detección al arranque: si el OS no provee DBus/MPRIS, el canal Spotify se omite del registro sin error y aparece como "no disponible" en el frontend.
- castLabs Electron install + dev launcher portables por plataforma; misma garantía de DRM en dev que en Linux hoy.
- `install.sh` distingue Linux (paquetes del sistema + systemd) de macOS (brew + skip autostart) y reporta requisitos faltantes específicos de cada plataforma.
- `./run-dev.sh` y `./run-prod.sh` funcionan en macOS con heurísticas portables (`lsof` en lugar de `ss`, `ps -o lstart=` en lugar de `/proc/<pid>/stat`, `stat -f %m` en lugar de `stat -c %Y`).
- `pyproject.toml` deja `pygobject` como dependencia gated por `sys_platform == 'linux'`.
- README documenta requisitos, pasos, castLabs, permisos TCC y limitaciones específicas de Mac.

**Non-Goals:**

- Implementar control de Spotify en macOS vía AppleScript/osascript — `DbusslessSpotifyClient` (Null) y el canal se omite; queda como follow-up.
- Notarización Apple ni packaging `.dmg` firmado — target `dir`/`zip` de electron-builder es suficiente para dev.
- Soporte de Windows.
- Reemplazar el unit `systemd` por un plist `launchd` para autostart en macOS — fuera de alcance del MVP; el usuario usa `./run-prod.sh` manualmente o lo agrega a Login Items.
- castLabs bundled dentro del `.app` empaquetado en macOS — requiere notarización aparte; sólo en dev launcher.

## Decisions

### 1. Arquitectura hexagonal en la capa OS-touched

Cuatro **ports** definidos como `Protocol` PEP 544 en `backend/catodo/domain/ports.py`:

| Port | Métodos |
|---|---|
| `MixerPort` | `get_volume() -> int \| None`, `set_volume(level) -> bool`, `set_default_sink(name) -> bool`, `is_available() -> bool` |
| `InputInjectorPort` | `move(dx, dy)`, `click(button)`, `scroll(dy)`, `key(name, shift=False)`, `type_text(text)`, `is_available() -> bool` |
| `UriOpenerPort` | `open(uri) -> bool` |
| `SpotifyClientPort` | `is_available() -> bool`, `play()`, `pause()`, `next()`, `previous()`, `set_volume(level)`, `open_uri(uri)`, `get_state() -> dict` |

**Adapters** en `backend/catodo/infrastructure/{linux,macos}/`:

| Port | Linux | macOS |
|---|---|---|
| `MixerPort` | `WpctlPactlMixer` (mueve la lógica actual de `mixer.py`) | `OsascriptMixer` (`osascript -e "set volume output volume N"`, get con `output volume of (get volume settings)`) |
| `InputInjectorPort` | `YdotoolInjector`, `XdotoolInjector` (mueve la lógica actual de `mouse.py`) | `CliclickInjector` (preferido), `OsascriptInjector` fallback (`System Events`) |
| `UriOpenerPort` | `XdgUriOpener` (`xdg-open` o `gio open`) | `MacOpenUriOpener` (`open <uri>`) |
| `SpotifyClientPort` | `DbusSpotifyClient` (mueve la lógica DBus/MPRIS actual de `channels/spotify.py`) | `DbusslessSpotifyClient` (Null: `is_available()` siempre `False`, resto no-op con log) |

**Factory** en `backend/catodo/infrastructure/factory.py`: cuatro funciones `build_mixer()`, `build_input_injector()`, `build_uri_opener()`, `build_spotify_client()`. Cada una inspecciona `platform.IS_MACOS` y devuelve el adapter. Único punto que conoce el mapeo OS→adapter.

**Composition root** en `backend/catodo/main.py:44 lifespan()` (ya existe el contexto async). Agregar al inicio del bloque:

```python
app.state.mixer = build_mixer()
app.state.input_injector = build_input_injector()
app.state.uri_opener = build_uri_opener()
app.state.spotify_client = build_spotify_client()
```

Único lugar que invoca el factory. La lógica de "qué canal registrar" en `manager.py:build_default_registry()` consulta `app.state.spotify_client.is_available()` (o equivalente pasado como param) para omitir `SpotifyChannel` cuando es False.

**Consumers** (`mixer.py`, `mouse.py`, `channels/spotify.py`): se vuelven fachadas de una línea que delegan al port via un helper `get_mixer(request)` que devuelve `request.app.state.mixer`. Las funciones públicas mantienen su firma y semántica → los call sites en `api.py`, routes, tests existentes no cambian.

**Justificación Protocol sobre ABC**: PEP 544 `Protocol` da duck typing estructural sin forzar herencia — los adapters no necesitan declarar `class OsascriptMixer(MixerPort)`, basta con que tengan los métodos correctos. Esto reduce ceremony y permite tests sin subclassing. **Alternativa considerada**: ABC con `abstractmethod`. **Descartado**: fuerza `class X(MixerPort)` en cada adapter; mismo efecto en runtime, más verbosidad.

**Justificación fachada sobre DI explícita**: hacer que cada route reciba `mixer: MixerPort = Depends(...)` sería lo más "limpio" pero toca todos los call sites del backend (~15 routes). Las fachadas preservan zero-diff en `api.py`, `mouse.py`, etc. **Alternativa**: DI por Depends. **Descartada en este MVP** por el diff surface — anotado como follow-up de clean-up si se quiere pureza máxima.

### 2. Spotify gating via port en composition root

`DbusslessSpotifyClient.is_available()` devuelve `False`. En `manager.py:build_default_registry()`, `SpotifyChannel` se registra sólo si el `SpotifyClientPort` configurado reporta `is_available()`. Cuando es False: log único "Spotify channel disabled: SpotifyClientPort reports not available" y no se incluye en `GET /api/channels`. El frontend ve el slot como "no disponible en esta plataforma".

El check **NO** es `platform.IS_MACOS` sino `is_available()` — defensa en profundidad: si en Linux DBus no está accesible, el `DbusSpotifyClient` también reportará `False` y el canal se omite. Una sola fuente de verdad para la decisión.

### 3. `pyproject.toml`: PEP 508 marker

```toml
dependencies = [
    "fastapi>=0.115",
    ...
    "pygobject>=3.56.3 ; sys_platform == 'linux'",
    ...
]
```

En macOS `uv sync` no resuelve `pygobject`. Los `try/except ImportError` que ya tiene `channels/spotify.py` y `mixer.py` absorben el resto. **Alternativa**: `[project.optional-dependencies] linux = [...]` con `--extra linux`. **Descartado**: complica `uv sync` y rompe paridad; marker PEP 508 es estándar.

### 4. `install.sh`: rama macOS con brew formulae

Mismo flujo que el diseño previo. Detección con `uname -s == Darwin` salta PM detection; usa mapa de binarios→brew formulae. Nunca `sudo`. Nunca genera unit systemd; imprime instrucciones de Login Items al final. Documentado en README.

### 5. `scripts/_lib.sh`: helpers portables

`current_pid()` y `backend_stale()` extraídos de los dos scripts (DRY que ya existía). Branch por OS:

- Linux: `ss -tlnp | grep ":$PORT " | grep -oP 'pid=\K[0-9]+'` + `/proc/<pid>/stat` + `stat -c %Y`.
- macOS: `lsof -nP -iTCP:$PORT -sTCP:LISTEN -t` + `ps -p PID -o lstart=` (parseado a epoch) + `stat -f %m`.

`run-dev.sh` y `run-prod.sh` hacen `source "$ROOT_DIR/scripts/_lib.sh"`. Verificación de no-regresión en Linux vía `scripts/check.sh`.

### 6. castLabs Electron install portable

`scripts/install_castlab.sh` detecta OS con `uname -s` y elige la variante:

**Linux** (flujo actual preservado):
- Asset: `electron-${VERSION}-linux-${ARCH}.zip`
- Extracción a `frontend/electron-castlab/usr/lib/electron-castlab/`
- Crea wrapper `usr/bin/electroncastlab` (bash) con flags XDG
- Crea `linux-app-id.js` con switch `if (process.platform === 'linux')` (no-op en otros OS)
- `chmod +x chrome-sandbox` (sandbox SUID Linux)

**macOS** (nuevo):
- Asset: `electron-${VERSION}-darwin-${ARCH}.zip`
- Extracción directa a `frontend/electron-castlab/` → produce `frontend/electron-castlab/Electron.app/` con layout macOS estándar (`Contents/MacOS/Electron`, `Contents/Frameworks/`, `Info.plist`)
- **NO wrapper bash**: el wrapper Linux usa paths FHS que no aplican en macOS; los flags se pasan directo como argv al invocar el binario
- **NO `chrome-sandbox` chmod**: macOS no usa sandbox SUID; usa permisos firmados del propio `.app`
- `linux-app-id.js` se preserva pero su branch Linux no se ejecuta en macOS (correcto, no-op)

`run-dev.sh:111` resuelve `CASTLAB_ELECTRON` por OS:

```bash
if [[ "$OSTYPE" == "darwin"* ]]; then
    CASTLAB_BIN="$FRONTEND_DIR/electron-castlab/Electron.app/Contents/MacOS/Electron"
else
    CASTLAB_BIN="$FRONTEND_DIR/electron-castlab/usr/lib/electron-castlab/electron"
fi
if [ ! -x "$CASTLAB_BIN" ]; then
    CASTLAB_ELECTRON=""  # warning + fallback a npx electron
else
    CASTLAB_ELECTRON="$CASTLAB_BIN"
fi
```

`scripts/check.sh` no se toca — no inspecciona el binario.

**Packaging en build.sh**: NO bundlea castLabs dentro del `.app`. Es un `.app` stock Electron + frontend built. Sin DRM out-of-the-box en macOS empaquetado — documentado como limitación. **Alternativa**: bundlear. **Descartado**: requiere notarización y resign del `.app`, fuera del MVP.

### 7. `build.sh` y electron-builder targets

`frontend/package.json:build` agrega:

```json
"mac": {
    "target": ["dir", "zip"],
    "icon": "../catodo.png",
    "category": "public.app-category.entertainment"
}
```

`build.sh` decide con `uname -s`: Linux → `--linux AppImage deb`; macOS → `--mac dir zip`. Sin firmas.

### 8. Data dir sin cambio

Se mantiene `~/.local/share/catodo/`. Sub-óptimo según Apple HIG pero respeta portabilidad cross-OS del state y evita migración. Follow-up documentado.

## Risks / Trade-offs

- **`osascript` con permisos TCC** → la primera invocación que toca accesibilidad (mouse/teclado vía `System Events`) dispara un prompt del sistema pidiendo permiso al usuario. Sin firma digital de la app no hay bypass; el usuario debe aprobar manualmente. Mitigation: README documenta el flujo exacto (System Settings → Privacy & Security → Accessibility → permitir Terminal/iTerm/lo que corresponda).
- **Spotify es la pérdida más visible** → Ch1 queda deshabilitado en Mac. Mitigation: el spec de `spotify-channel` declara explícitamente la condición; el frontend muestra el slot con mensaje "no disponible en esta plataforma".
- **DRM/Widevine sólo en dev** → castLabs Electron está en el launcher dev, no bundleado en `.app`. Mitigation: README explica; usuario corre `bash scripts/install_castlab.sh` una vez y usa `./run-dev.sh` para DRM. Empaquetado DRM queda como follow-up con notarización.
- **Autostart no automatizado en macOS** → el usuario debe agregar `./run-prod.sh` a Login Items. Mitigation: `install.sh` imprime las instrucciones exactas al final.
- **Notarización Apple ausente** → Gatekeeper bloquea primera apertura con warning. Mitigation: documentado "click derecho → Abrir" para bypass de identidad; alternativa `codesign --deep --sign -` ad-hoc.
- **`pygobject` con marker PEP 508 puede fallar en uv antiguo** → si uv < 0.4 trata de instalar pygobject en macOS (que requiere glib de brew). Mitigation: `install.sh --check` corre `uv --version` y avisa si < 0.4.
- **`DbusslessSpotifyClient` extiende el modelo con un Null adapter** → nuevo tipo en producción aunque siempre reporta `False`. Mitigation: log explícito una sola vez al construir; tests verifican el comportamiento. Si macOS nunca sumará un Spotify adapter real, este adapter se queda como YAGNI latente — desicionado aceptarlo por simetría con los otros ports.

## Migration Plan

Sin datos a migrar. `~/.local/share/catodo/config.json` es forward-compatible. Usuario Linux no nota el cambio. Usuario macOS arranca desde cero con `git clone` + `bash install.sh` + `bash scripts/install_castlab.sh` + `./run-dev.sh`. Rollback: `git revert` del PR. Sin feature flag — la detección de OS es estática por proceso.

## Open Questions

- ¿Vale la pena un `scripts/install_macos_deps.sh` que instale brew formulae en una sola línea para usuarios menos técnicos? **Decisión deferible**: si el primer usuario macOS reporta fricción, se agrega. Por ahora, las instrucciones están en README.
- ¿Tiene sentido convertir las fachadas en `Depends(...)` para DI explícita en un follow-up de clean-up? **Decisión deferible**: anotado como refactor opcional cuando se toque `api.py` por otra razón. No es bloqueante para el port.