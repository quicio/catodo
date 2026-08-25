## Why

Hoy el kiosko se controla desde el control remoto web (`/remote`) o un teclado físico. Falta una capa de control siempre-visible y nativa del sistema operativo para acciones rápidas (cambiar de "modo", pausar lo que esté sonando) sin tener que abrir un navegador ni configurar inputs globales. Aprovechamos la infraestructura de pairing ya existente para no reinventar autenticación.

## What Changes

- Nuevo subproyecto `clients/tray/` con una app Tauri (Rust + webview liviano) que corre como icono en la barra del sistema (macOS menu bar, Windows system tray, Linux status notifier).
- La app se empareja reusando la misma auth que el remote web (`CATODO_TOKEN` o `token` runtime config): obtiene el code vía `GET /api/pair/info` (mismo QR + URL que muestra el TV) y guarda el token localmente. Sin `CATODO_TOKEN` configurado el backend queda abierto y el cliente funciona sin pairing.
- Mantiene una conexión WebSocket persistente (`/api/ws`) para reflejar estado del kiosko en el menú y para enviar comandos.
- El menú del tray expone: presets de "modo" (combo de `theme` + `home_layout_id` + `ui_scale` + canales favoritos), toggle play/pause del canal actual, volumen, y "abrir control remoto" como deep link al `/remote`.
- Backend agrega endpoints nuevos para listar, crear y aplicar presets de modo (CRUD en runtime config).
- Los presets de modo aplican atómicamente: una sola llamada al backend cambia el set de claves en `runtime_config` y broadcastea `config_changed` como cualquier otro cambio.

## Capabilities

### New Capabilities

- `system-tray-client`: app Tauri multiplataforma (macOS / Windows / Linux) con icono persistente, menú nativo, WebSocket contra el backend y sub-menú de modos preestablecidos.
- `mode-presets`: persistencia y aplicación de presets de configuración (combo de theme + layout + ui_scale + canales favoritos) editables desde el panel de config del kiosko y aplicables desde el tray.

### Modified Capabilities

- `remote-control`: la página `/remote` agrega un botón "abrir cliente de bandeja" / deep link si el cliente está disponible. Solo cambia UI, no requisitos de protocolo.

## Impact

- **Nuevo subproyecto**: `clients/tray/` (Rust + Tauri 2.x), con su propio `Cargo.toml`, `tauri.conf.json`, build pipeline. No comparte binario con Electron (que sigue siendo solo del kiosko).
- **Backend**: nuevo módulo `catodo/modes.py` (CRUD de presets en `runtime_config`), dos endpoints nuevos `GET/POST /api/modes` y `POST /api/modes/<id>/apply`, sin cambios al WS existente (reusa el evento `config_changed`).
- **Frontend kiosko**: el panel de config (tab General) gana un sub-panel "Modos" para crear / renombrar / borrar / aplicar presets.
- **Dependencias nuevas**: Rust toolchain + `cargo` (build), `tauri` 2.x runtime, `tokio` para el cliente WS. No toca dependencias Python ni Node existentes.
- **Distribución**: se distribuye como `.app` (mac), `.msi` / `.exe` (Windows), `.deb` / `.AppImage` (Linux). Por ahora no automatizamos la firma de código — fuera de scope para esta change.

## Non-goals

- Notificaciones push del SO (NSUserNotification / Windows toast) para eventos del kiosko. La notificación "bidireccional" aquí significa solo comunicación cliente↔backend vía WS; las notificaciones nativas del SO quedan para una change futura.
- Sincronización entre múltiples clientes de bandeja (uno por máquina). Cada cliente es independiente.
- Control remoto completo desde el tray (drag de volumen, etc.). El tray expone acciones de un click; para control fino se deep-linkea al `/remote`.
- Auto-update del binario del tray. Se distribuye manualmente o vía package manager del SO.