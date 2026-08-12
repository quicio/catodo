## Context

Ver proposal.md. La auditoría encontró: un único path absoluto (`/home/hugo/...` en `build.sh:50`), el unit `catodo.service` con rutas fijas `%h/projects/catodo` y `%h/.local/bin/uv`, `install.sh` sin detección de distro ni de dependencias, y `127.0.0.1:8765` duplicado en 5 lugares de `frontend/electron/main.cjs` + `vite.config.ts`. El repo ya usa env vars con default (config.py) y runtime config persistido en `~/.local/share/catodo/config.json`.

## Goals / Non-Goals

**Goals:**
- `install.sh` que detecte distro/gestor de paquetes y verifique/instale dependencias.
- Unit de systemd generado con rutas reales detectadas.
- Una sola fuente de verdad para la URL del backend en el shell/electron.
- Eliminar el path absoluto de `build.sh`.

**Non-Goals:**
- Empaquetar distribuciones nativas (.deb/.rpm/.pacman) — se mantiene el AppImage/deb de electron-builder.
- Soporte no-Linux (el proyecto es Linux-only).
- **Soporte macOS** — postergado. El backend depende de PyGObject/MPRIS (D-Bus), PipeWire/PulseAudio y systemd; un port requeriría reescribir esas capas (Spotify API, CoreAudio, lanzador propio). Posible cambio futuro separado.
- Instalación automática de Electron castLabs/Widevine vía paquete de distro (se resuelve con `scripts/install_castlab.sh` descargando el binario oficial).

## Decisions

### 1. Detección de distro y gestor de paquetes
`install.sh` detecta via `cat /etc/os-release` (`ID_LIKE`/`ID`) y mapea a gestor:
- `arch` → `pacman`
- `debian`/`ubuntu` → `apt`
- `fedora`/`rhel`/`centos` → `dnf`
- `opensuse` → `zypper`
Cada gestor tiene un mapa de nombres de paquete (ej. pygobject: `python-gobject` en Arch, `python3-gi` en Debian).
*Alternativa considerada*: paquetes por distro mantenidos a mano — descartado por costo de mantenimiento; el mapa de nombres en un solo lugar es suficiente para KISS.

### 2. Resolución de rutas en tiempo de instalación
- `PROJECT_DIR` = dirname del script (`$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)`), no requiere estar en el repo para correr.
- `UV_BIN="$(command -v uv || true)"`, `NODE_BIN="$(command -v node || true)"` — se reportan si faltan.
- El unit se genera con un heredoc que interpola `PROJECT_DIR` y `UV_BIN` → nuevo `backend/systemd/catodo.service.in` (template) o generación directa en `install.sh` a `~/.config/systemd/user/catodo.service`.
- `install.sh` borra el template de rutas fijas; el source del repo queda como `.in`.

### 3. Verificación de dependencias (modo `--check`)
Función `require <bin> <pkg-arch> <pkg-debian> ...` que valida con `command -v` y acumula faltantes en un listado; `--check` imprime y sale 0 si todo OK, 1 si falta algo. `install.sh` sin `--check` instala las faltantes con el gestor detectado (con confirmación o flag `--yes`).

### 4. Single source of truth para backend URL
- `frontend/electron/main.cjs`: reemplazar los 5 literales por una constante `BACKEND_HOST` derivada: `process.env.CATODO_BACKEND_URL` → si no, autodetect http/https contra `127.0.0.1:<port>` donde `<port>` sale de `CATODO_PORT` (default 8765). Todas las llamadas `/api/*` usan esa base.
- `frontend/vite.config.ts`: el proxy `/api` target usa `process.env.CATODO_BACKEND_URL || "http://127.0.0.1:8765"` (mantiene el default documentado en backend-api spec).
- `frontend/src/api/ws.ts`: eliminar el fallback literal `127.0.0.1:1420`; derivarlo de `location.host` (ya lo hace) y si no hay `window`, del mismo env que el shell.

### 5. Eliminar path absoluto en `build.sh`
El heredoc Python recibe el target por variable (`"$BACKEND_DIR/static/noise.png"`) en vez de la ruta fija.

### 6. README vs. scripts
`install.sh` implementa autostart real: `systemctl --user enable --now` (ya lo hace) + flag `--autostart` que crea/enable con `--now` explícito, y README se corrige para describir exactamente lo que hace el script.

## Risks / Trade-offs

- [Instalar dependencias automáticamente requiere sudo] → El instalador usa sudo solo si corre sin `--check` y con confirmación; `--check` es la vía no-privilegiada recomendada.
- [Nombres de paquete por distro pueden quedar desactualizados] → Mapa centralizado y fácil de editar; `--check` no rompe si un nombre no existe.
- [CATODO_BACKEND_URL si el backend está en otra máquina] → Es el caso de uso intencional (kiosk); el default loopback cubre el 99% de los casos.
- [Electron castLabs queda fuera del instalador automático] → Documentado como paso opcional post-instalación en README (binario privado AUR).
