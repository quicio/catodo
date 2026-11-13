## Why

Cátodo solo se puede instalar en la máquina de desarrollo: `install.sh` y el unit de systemd asumen `~/projects/catodo` y `~/.local/bin/uv`, hay una ruta absoluta (`/home/hugo/...`) en `build.sh`, y el puerto/IP del backend están duplicados en 5 lugares del frontend. En otra PC, sin detección de distro ni de dependencias, la instalación falla o queda incompleta (p. ej. sin Widevine para los canales DRM).

## What Changes

- **Instalador replicable** (`install.sh`): detección de SO/distro, gestor de paquetes (`pacman`/`apt`/`dnf`/`zypper`), verificación e instalación de dependencias del sistema (python3, uv, node/npm, pygobject/gir1.2, openssl, xdotool/ydotool, pipewire/pulseaudio, iproute2, systemd), y descubrimiento de `uv`/`node` por PATH.
- **Unit de systemd parametrizado**: `catodo.service` generado con las rutas reales del repo y de `uv` detectadas en la instalación, sin asumir `~/projects/catodo` ni `~/.local/bin/uv`.
- **Eliminar ruta absoluta** de `build.sh:50` (noise.png) → ruta derivada de `BACKEND_DIR`.
- **Centralizar configuración del backend** en el frontend/electron: el host/puerto del backend deja de estar hardcodeado en `main.cjs` y `vite.config.ts`; se resuelve vía env (`CATODO_BACKEND_URL`) con default coherente, derivado de un solo lugar.
- **Check pre-instalación** (`scripts/check.sh` + nuevo `install.sh --check`): valida requisitos y reporta qué falta con el comando para instalarlo.
- **Consistencia README vs. scripts**: el autostart documentado pasa a implementarse (unit instalado con `enable --now` + opción `--autostart`).

## Capabilities

### New Capabilities

- `installation`: instalación reproducible en cualquier distro Linux — detección de SO, gestión de dependencias del sistema, generación de unit de systemd, y verificación de requisitos.

### Modified Capabilities

- `systemd-integration`: el unit se genera con rutas detectadas en instalación (repo, uv) en lugar de asumir `~/projects/catodo`.
- `backend-api`: el host/puerto del backend se vuelve configurable de forma consistente y se documenta el contrato de `CATODO_BACKEND_URL`.

## Impact

- Scripts: `install.sh`, `build.sh`, `scripts/check.sh`, `scripts/make_cert.sh`, `run-dev.sh`.
- Backend: `catodo/config.py`, `backend/systemd/catodo.service` (generado), `build.sh` (path de noise.png).
- Frontend: `frontend/electron/main.cjs` (5 ocurrencias de `127.0.0.1:8765`), `frontend/vite.config.ts`, `frontend/src/api/ws.ts`.
- Docs: `README.md` (sección instalación).
- Sin cambios de API pública ni de formato de datos persistidos.
