## Why

Hoy Cátodo expone el remote sólo por LAN y `/cast` por un puerto HTTPS con cert self-signed: el QR no anda fuera del WiFi, los celulares no pueden instalar el remote como PWA sobre HTTP, y cada visita al cast pide aceptar el certificado. Queremos una URL pública estable con HTTPS válido que unifique QR, remote y cast — sin atarnos a un proveedor: la primera implementación es Cloudflare Tunnel, pero la arquitectura admite Tailscale Funnel, ngrok u otros detrás de una misma interfaz.

## What Changes

- Nuevo paquete `catodo/tunnel/`:
  - `provider.py`: interfaz `TunnelProvider` (`name`, `start`, `stop`, `is_running`, `health`, `validate_config`). Una implementación por proveedor.
  - `manager.py`: `TunnelManager` orquesta el provider activo y publica `tunnel_state`.
  - `providers/cloudflare.py`: implementa `TunnelProvider` sobre `cloudflared tunnel --no-autoupdate run --token-file <path>`. Tailscale/ngrok es drop-in (archivo + registro en la factory).
- Factory `get_provider(name) -> TunnelProvider | None` resuelve el provider según `tunnel_provider` (default `cloudflare`).
- Nuevas keys de runtime config: `public_domain`, `tunnel_enabled`, `tunnel_provider`, `tunnel_token_path`, `tunnel_require_token`.
- `pair.py`: `pair_url()` devuelve `https://<public_domain>/remote?code=…` cuando hay dominio; `/api/pair/info` expone LAN y pública.
- Nuevo spec `remote-pwa`: `/remote/` gana `manifest.webmanifest`, `sw.js`, íconos y meta Apple.
- Si `tunnel_enabled && tunnel_require_token` (default), `/api/*` exige `CATODO_TOKEN` por header o query.
- `:8766` con cert self-signed queda obsoleto; `screen-casting` se actualiza.

**BREAKING**: activar el túnel sin `CATODO_TOKEN` deja `/api/*` anónimo cerrado (opt-out: `tunnel_require_token: false`).

## Capabilities

### New Capabilities

- `public-domain-tunnel`: módulo que gestiona el túnel vía `TunnelProvider`, expone start/stop/health/status y publica `tunnel_state`. La elección del provider es dato, no branch.
- `remote-pwa`: convierte `/remote` en una PWA realmente instalable (manifest, service worker, íconos, meta Apple).

### Modified Capabilities

- `runtime-config`: agrega las cinco keys nuevas al whitelist de `KEYS`.
- `remote-control`: el pairing prefiere URL pública; el remote guarda el token en `localStorage` tras el primer login.
- `screen-casting`: el canal ya no necesita cert self-signed; `/cast` opera sobre el dominio público.

## Impact

- **Backend**: paquete `catodo/tunnel/`, cambios chicos en `pair.py`, `main.py` (lifespan), `runtime_config.py`, `config.py`. Sin nuevas deps Python.
- **Frontend**: sección Settings + `RemotePWAInstaller`. Sin deps nuevas.
- **Sistema**: requiere `cloudflared` en `PATH` para el provider por defecto (lo trae `install.sh`). Requiere dominio propio + CNAME al tunnel (paso manual documentado).
- **APIs nuevas**: `POST /api/tunnel/{start,stop}`, `GET /api/tunnel/{status,health,providers}`, `GET /remote/manifest.webmanifest`, `GET /remote/sw.js`.
- **APIs modificadas**: `/api/pair/info` agrega `public_url`; `/api/config` acepta las cinco keys nuevas.

## Non-goals

- No se automatiza la creación del CNAME / DNS vía APIs de proveedores.
- No se reemplaza el remote LAN: si el túnel está apagado o caído, el remote sigue por IP local.
- No se agrega integración con APIs de DNS (Cloudflare API, Route53, etc.).
- No se firma nada con cert local; el cert lo maneja el provider.
- No se modifica el kiosko Electron: el TV sigue hablando `127.0.0.1` directo.
