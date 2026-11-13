## 1. Configuración centralizada del backend URL

- [x] 1.1 Reemplazar los 5 literales `127.0.0.1:8765` de `frontend/electron/main.cjs` por una constante derivada de `CATODO_BACKEND_URL`/`CATODO_PORT` con autodetección HTTP/HTTPS.
- [x] 1.2 Hacer que `frontend/vite.config.ts` use `CATODO_BACKEND_URL` (o default `http://127.0.0.1:8765`) como target del proxy.
- [x] 1.3 Eliminar el fallback literal `127.0.0.1:1420` de `frontend/src/api/ws.ts`, derivándolo de `location.host` (o env en ausencia de `window`).
- [x] 1.4 Eliminar el path absoluto `/home/hugo/projects/catodo/...` de `build.sh:50` usando `$BACKEND_DIR`.
- [x] 1.5 Verificar: `npm run build` en frontend y `bash build.sh` en el repo.

## 2. Instalador con detección de SO y dependencias

- [x] 2.1 Añadir a `install.sh` detección de distro vía `/etc/os-release` con mapeo a `pacman`/`apt`/`dnf`/`zypper`.
- [x] 2.2 Definir en `install.sh` el mapa de paquetes por gestor para: python3≥3.12, uv, node/npm, pygobject (gir1.2-glib), openssl, xdotool/ydotool, pipewire/pulseaudio, iproute2.
- [x] 2.3 Implementar `require <bin> <pkg...>` y el modo `install.sh --check` que reporta OK/faltante sin modificar el sistema.
- [x] 2.4 Hacer que `install.sh` sin `--check` instale las dependencias faltantes con el gestor detectado (con confirmación).
- [x] 2.5 Resolver `PROJECT_DIR` desde la ubicación real del script y `UV_BIN`/`NODE_BIN` con `command -v`, reportando si faltan.
- [x] 2.6 Generar el unit de systemd con rutas resueltas: template `backend/systemd/catodo.service.in` + generación en `install.sh`, o generación directa a `~/.config/systemd/user/catodo.service`.
- [x] 2.7 Mantener `enable --now` y añadir flag `--autostart` explícito; verificar idempotencia corriendo `install.sh` dos veces.
- [x] 2.8 Verificar: `install.sh --check` en la máquina actual reporta todo OK o lista lo faltante.

## 3. Scripts auxiliares y consistencia de docs

- [x] 3.1 Alinear `scripts/check.sh` con las nuevas rutas (detectar uv/node por PATH, sin asumir ubicación del repo).
- [x] 3.2 Revisar `scripts/make_cert.sh` y `run-dev.sh` para que no dependan de `~/projects/catodo` (usar resolución por `$0`/`$BASH_SOURCE`).
- [x] 3.3 Actualizar README: instalación real (incl. autostart), requisitos por distro, y paso opcional de Electron castLabs para Widevine.
- [x] 3.4 Ejecutar `scripts/check.sh` completo (ruff + pytest + tsc) y confirmar que pasa.

## 4. Validación final

- [x] 4.1 Probar instalación limpia en la máquina de desarrollo: `bash install.sh --check` y `bash install.sh`.
- [x] 4.2 Confirmar `systemctl --user status catodo.service` activo y `curl /api/health` OK con la nueva config.
- [x] 4.3 Confirmar que el AppImage se genera y la app carga el backend con la URL detectada.
