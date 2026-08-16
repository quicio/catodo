## Context

Cátodo es un kiosk local que hoy expone su backend sólo en LAN o loopback (HTTP en `:8765`/`8767`) y, opcionalmente, HTTPS con cert self-signed en `:8766` para `/cast`. El remote PWA se sirve estático y el pairing codifica una IP LAN en el QR — nada funciona desde internet, nada tiene cert válido, y el remote no se puede instalar como app en el celular. Ver `proposal.md` para la motivación.

El backend es FastAPI con un lifespan explícito (ver `catodo/main.py:43-93`), ya tiene un `EventBroker` para WebSockets y un `runtime_config` con persistencia atómica + eventos `config_changed`. Esas dos primitivas son los anclajes del diseño.

## Goals / Non-Goals

**Goals:**
- Abstracción `TunnelProvider` que aísla Cloudflare, Tailscale, ngrok u otros del resto del sistema.
- Manager único (`TunnelManager`) que orquesta el provider activo, persiste estado y publica eventos.
- API REST uniforme: `start`/`stop`/`status`/`health`/`providers`.
- Reescritura del pairing para emitir URL pública cuando hay dominio.
- Remote PWA realmente instalable (manifest + service worker + meta Apple).
- Token enforcement automático cuando el túnel está activo.

**Non-Goals:**
- Crear/editar registros DNS vía API del proveedor.
- Firmar certs locales (acme.sh, etc.).
- Tocar el kiosko Electron — sigue hablando `127.0.0.1`.
- Reemplazar `make_cert.sh` por ahora: queda como fallback si alguien quiere HTTPS sin túnel; el spec de `screen-casting` deja de exigirlo.

## Decisions

### 1. Interfaz `TunnelProvider` con `typing.Protocol`

```python
# catodo/tunnel/provider.py
class TunnelProvider(Protocol):
    name: str

    def validate_config(self) -> list[str]: ...   # → [] si OK
    def start(self) -> TunnelHandle: ...          # subprocess.Popen-like
    def stop(self, handle, timeout: float = 5.0) -> None: ...
    def is_running(self, handle) -> bool: ...
    def health(self) -> dict: ...                 # {reachable, latency_ms|last_error}
```

**Por qué Protocol y no ABC**: `Protocol` es duck-typing explícito, no requiere herencia, y permite que un test inyecte un `FakeTunnelProvider` sin heredar nada. Coincide con el estilo "Clean Architecture light" del proyecto.

**Por qué `validate_config` devuelve `list[str]` y no bool/exception**: el endpoint `/api/tunnel/providers` necesita reportar *qué* falta (binario, token, dominio). Una lista de mensajes es directa y testeable.

**Alternativas consideradas:**
- `abc.ABC` con métodos concretos → descartado: fuerza herencia, complica mocking.
- Subproceso único parametrizado por flag → descartado: mete branches `if provider == "cloudflare"` en todos lados.

### 2. `TunnelHandle` opaco

```python
@dataclass
class TunnelHandle:
    pid: int
    proc: subprocess.Popen            # privado al provider; el manager solo ve pid
    started_at: float
```

El manager almacena el `pid` y `started_at`; el `Popen` real vive encapsulado en el provider. Esto evita que el manager haga `proc.terminate()` directo (que tendría que saber la señal correcta — TERM vs KILL vs signal HTTP de ngrok) y deja cada provider definir su ciclo de shutdown.

**Alternativa descartada:** pasar el `Popen` al manager. Acopla el manager a `subprocess` y rompe cuando agreguemos un provider que no usa subproceso (ej. un Tailscale que se conecte por socket nativo).

### 3. Factory basada en registry, no en dict cerrado

```python
# catodo/tunnel/__init__.py
_REGISTRY: dict[str, type[TunnelProvider]] = {}

def register(cls): _REGISTRY[cls.name] = cls
def get_provider(name: str) -> TunnelProvider | None:
    cls = _REGISTRY.get(name)
    return cls() if cls else None
def available() -> list[str]: return list(_REGISTRY)
```

`CloudflareTunnelProvider` se auto-registra al importarse (`@register`). Cada provider nuevo es `providers/<name>.py` + import en `__init__.py`. **Sin branches en el manager.**

### 4. Cloudflare provider: binario + token file + ping al dominio

`catodo/tunnel/providers/cloudflare.py` envuelve:
- `shutil.which("cloudflared")` para `validate_config`.
- `subprocess.Popen(["cloudflared", "tunnel", "--no-autoupdate", "run", "--token-file", path])` con `start_new_session=True` (process group, para que SIGTERM al backend mate al hijo y nietos).
- `health()` hace `urllib.request.urlopen(f"https://{public_domain}/api/health", timeout=3)` y mide latencia.
- `stop()` envía SIGTERM al process group, espera `timeout`, escalando a SIGKILL.

**Alternativa descartada:** usar `cloudflared login` + cert local → requiere interacción, no aplica a un kiosk desatendido.

### 5. Persistencia de estado efímero en runtime config

El estado del proceso (PID, started_at, last_error) es **runtime**, no config. Se guarda en un JSON separado en `DATA_DIR`:

```
~/.local/share/catodo/
├── config.json         ← overrides persistentes (NO toca)
└── tunnel_state.json   ← {provider, pid, state, started_at, last_error}
```

`TunnelManager` lee/escribe ahí con el mismo patrón atómico de `runtime_config._save_inner`. Si el archivo no existe al boot, asume `stopped`.

**Por qué no usar `config.json`**: ese archivo es para overrides editables por el usuario; mezclarle estado de proceso lleva a races entre `POST /api/config` y el ciclo de vida del túnel.

### 6. Token enforcement derivado de config, no de env

Hoy `_token = os.getenv("CATODO_TOKEN", "")` se evalúa en `main.py:36` y nunca cambia. Lo cambiamos a:

```python
def _is_token_required() -> bool:
    if os.getenv("CATODO_TOKEN"):
        return True                   # env var sigue teniendo prioridad
    cfg = runtime_config.get_effective()
    return bool(cfg.get("tunnel_enabled")) and bool(cfg.get("tunnel_require_token"))
```

El middleware pasa a leer `_is_token_required()` en cada request (es barato). El token se resuelve de `os.getenv` (no se guarda en `config.json` por seguridad — si el archivo se filtra, no queda el secreto).

### 7. Reescritura mínima de `pair.py`

`pair_url()` hoy lee `lan_ip()` y `settings.port`. Lo cambiamos a:

```python
def pair_urls() -> dict[str, str]:
    pub = runtime_config.get("public_domain")
    enabled = runtime_config.get("tunnel_enabled")
    token = _token
    q = f"?code={token}" if token else ""
    if pub and enabled:
        return {"public": f"https://{pub}/remote{q}", "lan": f"http://{lan_ip()}:{settings.port}/remote{q}"}
    return {"lan": f"http://{lan_ip()}:{settings.port}/remote{q}"}
```

`/api/pair/info` devuelve `{lan, public, primary}`. `primary` es `"public"` si existe, si no `"lan"`. El QR usa `primary` salvo que el query param `?which=lan` lo pida (el botón del Home ya tiene ese toggle en la UI nueva).

### 8. PWA: manifest + service worker mínimo

`/remote/` está montado como estático desde el backend. Agregamos dos archivos servidos como static:

- `/remote/manifest.webmanifest` — `name`, `short_name`, `start_url: "/remote/"`, `display: "standalone"`, `theme_color`, `background_color`, íconos 192/512/maskable.
- `/remote/sw.js` — versión-stamped cache del shell (HTML + CSS + JS), network-first para `/api/*`.

El frontend React agrega:
- `<link rel="manifest" href="/remote/manifest.webmanifest">` y meta Apple (`apple-mobile-web-app-capable`, `apple-touch-icon`) en `index.html` (que también sirve al remote porque comparte bundle).
- `RemotePWAInstaller` que registra el SW si `location.protocol === "https:"` y muestra un banner "Instalar como app" cuando `beforeinstallprompt` dispara.

**Por qué service worker mínimo y no Workbox**: cero deps nuevas. Caching del shell + network-first para `/api/*` cabe en 30 líneas.

### 9. UI Settings: una sección, no un módulo aparte

Extiende el panel ⚙ existente. Sección nueva **DOMINIO PÚBLICO** con: dominio (input), provider (select poblado de `/api/tunnel/providers`), ruta del token (input + file picker), toggles `enabled` / `require_token`, botones **Iniciar/Detener**, **Copiar URL pública**, **Ver logs**, indicador en vivo (latencia del health check cada 5s).

No agregamos ruta nueva en el router — el panel ya tiene tabs/secciones.

### 10. `install.sh` agrega `cloudflared` (provider por defecto)

Tres opciones evaluadas:
- **(a)** `install.sh` baja el binario oficial desde `github.com/cloudflare/cloudflared/releases` y lo pone en `~/.local/share/catodo/bin/cloudflared` → portable, sin root.
- **(b)** Paquete del sistema (`apt install cloudflared`) → atado a distro, requiere root.
- **(c)** Cátodo lo baja on-demand la primera vez que se inicia el túnel → mágico, falla silenciosa si no hay red en ese momento.

**Elegido (a)** con flag `--no-cloudflared` para opt-out y checksum verificado contra el publicado en el release JSON. El path se agrega a `PATH` del usuario en el `.profile` o vía `~/.local/bin` que ya está en PATH por convención FHS.

## Risks / Trade-offs

- **Latencia WebSocket a través del túnel** (~10-30ms en Cloudflare) → el remote puede sentirse "menos inmediato" arrastrando sliders. → Mitigación: el toggle "modo LAN" en el Settings sigue dando el atajo por IP local cuando estás en casa; medir el delta en el MVP y decidir.

- **`cloudflared` como dep externa** (~30 MB, hay que actualizarlo) → Mitigación: `install.sh --no-cloudflared` para opt-out; el provider puede no estar disponible y la API lo reporta (`configured: false`) sin romper nada.

- **Túnel + kiosko en la misma máquina** → si la TV pierde internet, el remote fuera de casa se cae. → Mitigación: el remote LAN sigue funcionando; el estado `degraded` aparece en el Home con un toast.

- **CNAME al tunnel es paso manual** (crearlo en el panel de Cloudflare) → Mitigación: el Settings abre el link directo a la página del dominio con instrucciones paso-a-paso; no se automatiza por seguridad (no queremos pedir API tokens de Cloudflare).

- **Service worker del PWA puede interferir con deploys** (caché de HTML viejo) → Mitigación: estrategia de cache-bust por `?v=` en el SW y `no-cache` header en `index.html` que ya existe en `main.py:153`.

- **El token guardado en `localStorage` del PWA es visible desde JS** → aceptable: ya está en la URL del QR; el aislamiento real lo da HTTPS del túnel + Same-Origin Policy. No usar storage persistente cifrado (complejidad sin beneficio).

- **Provider switch sin stop explícito** → un usuario podría cambiar `tunnel_provider` mientras corre el anterior. → Mitigación: `config_changed` con `tunnel_provider` triggea stop-then-start en el manager si está running; idempotente.

## Migration Plan

1. Merge de los archivos de `catodo/tunnel/` + deltas en `pair.py`, `main.py`, `runtime_config.py`. Sin deploy, no cambia comportamiento (provider default es Cloudflare pero `tunnel_enabled=false`).
2. Build del frontend con la nueva sección Settings (oculta si `tunnel_enabled=false`).
3. `install.sh` actualiza el binario `cloudflared` para usuarios existentes.
4. Deploy: nadie ve cambios hasta que activamente configure dominio + túnel.
5. Rollback: borrar el paquete `catodo/tunnel/`, revertir deltas. `config.json` mantiene las keys nuevas (ignoradas); no hay migración de datos.

## Open Questions

- ¿Conviene que el provider Cloudflare intente crear el registro CNAME vía API de Cloudflare si hay un token disponible? → Decidido que **no** en esta iteración (acopla a un proveedor y requiere scope de OAuth). Queda como futuro.
- ¿`/cast` sigue aceptando LAN además del túnel? → Sí: el spec de `screen-casting` no cambia el caso LAN, solo elimina la obligación del cert self-signed. El canal funciona por túnel Y por LAN; la UI del Settings le ofrece al usuario cuál prefiere.
