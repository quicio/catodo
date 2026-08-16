## Context

Cátodo hoy se controla desde un kiosko Electron (fullscreen) y un remote web estático en `/remote`. Falta una capa de control nativa del SO para acciones rápidas siempre visibles. Reusamos la auth ya existente (`CATODO_TOKEN` + `GET /api/pair/info`) y el broker WebSocket — el cliente sólo agrega presentación.

El backend ya tiene `runtime_config` (FastAPI + WebSocket broker) y endpoints REST maduros. El kiosko React ya escucha `config_changed` y refleja cambios en caliente — agregar presets reusa ese mismo evento, sin lógica nueva en el frontend del kiosko más allá del panel de edición.

## Goals / Non-Goals

**Goals:**
- App Tauri 2.x con un solo proceso, icono persistente y menú nativo.
- Emparejamiento que reuse el mismo modelo de token que `/remote`.
- Submenú de presets que aplica atómicamente vía un endpoint nuevo y se refleja en el kiosko vía `config_changed`.
- Distribución por SO sin code forks.

**Non-Goals:**
- Notificaciones nativas del SO (NSUserNotification / toast). Diferido.
- Sincronización entre múltiples instancias del cliente tray en distintas máquinas.
- Control remoto completo desde el tray (drag de volumen, etc.) — eso sigue en `/remote`.
- Auto-update del binario del tray.

## Decisions

### D1. Tauri 2.x (Rust) sobre Electron

**Por qué**: el tray es un proceso background que sólo abre un menú y mantiene un WS. Electron arrastra un Chromium entero (~150 MB RAM) para algo que casi no renderiza. Tauri usa el webview del SO (~10–20 MB), tiene APIs nativas de tray maduras (`tauri-plugin-positioner`, `tauri::tray::TrayIconBuilder`) y build por SO nativo.

**Alternativas**:
- *Electron*: reusaría infra pero heavyweight y arrastra Node + Chromium innecesarios.
- *GTK/Qt nativo*: cero web, pero perderíamos el render del QR y todo el form parsing se hace a mano. Más trabajo para lo mismo.

### D2. Token storage con keyring del SO

**Por qué**: el cliente necesita persistir el token entre reinicios. Usamos el plugin `tauri-plugin-stronghold` (o `keyring` crate directo) para guardarlo cifrado con el llavero del SO (Keychain en mac, Credential Manager en Windows, Secret Service en Linux). Si no hay llavero disponible (headless Linux), fallback a un archivo en `~/.config/catodo/tray-token` con permisos `0600`.

**Alternativa**: archivo plano en `~/.config/catodo/tray-token` siempre. Más simple pero el token queda en disco sin cifrar.

### D3. Endpoint `POST /api/modes/<id>/apply` con escritura múltiple

**Por qué**: cada preset toca N claves de `runtime_config`. Hacer N POSTs separados a `/api/config` introduce race conditions y N broadcasts de `config_changed`. Un endpoint dedicado que itera el payload del preset y publica un evento por clave mantiene el contrato actual (eventos `config_changed` por clave) pero agrupados en una sola llamada.

**Alternativa**: dejar que el cliente iterere y haga N `POST /api/config`. Más simple de implementar pero rompe la atomicidad (si una falla, ¿quedan las otras aplicadas?).

### D4. Submenú de presets sin polling

**Por qué**: el menú se reconstruye ante dos eventos: `config_changed` con `key` igual a `mode_presets` (lista cambió) y al recibir el snapshot inicial del WS (caso `state_snapshot`). Sin polling. El menú también muestra un ítem placeholder "(sin modos)" si la lista está vacía.

**Alternativa**: polling cada N segundos. Más simple pero gasta ancho de banda y latencia peor.

### D5. Acciones rápidas vía endpoints existentes

**Por qué**: toggle play/pause usa `POST /api/channels/<current_id>/command` con `{command: "toggle"}` — el mismo endpoint que usa `/remote`. Volumen usa `POST /api/volume?level=+/-`. No inventamos endpoints nuevos para cosas que ya existen.

**Alternativa**: un endpoint RPC genérico `POST /api/action` con un set fijo de acciones. Más limpio teóricamente pero reinventa lo que ya está.

### D6. Build sin cross-compilation

**Por qué**: Tauri 2 usa `cargo tauri build` que produce el binario nativo del host. Para distribuir a otro SO el dev debe buildear en ese SO (o usar GitHub Actions con runners por SO). No agregamos CI en esta change.

**Alternativa**: cross-compile con `cargo-zigbuild`. Más complejo, requiere Zig toolchain, valor marginal para un proyecto chico.

## Risks / Trade-offs

- **[R1] El usuario pierde el token y no puede re-pairar** → Mitigación: el menú siempre tiene "Volver a emparejar" que borra el token guardado y muestra la ventana de pairing. El backend sigue mostrando el QR en `/api/pair/qr` (no cambiamos ese endpoint).
- **[R2] El WS se cae y el menú queda mostrando estado viejo** → Mitigación: ícono cambia a "desconectado" y los comandos se deshabilitan. Reconexión automática con backoff (1s, 2s, 5s, 10s, 30s cap).
- **[R3] Tauri requiere Rust toolchain instalada en cada máquina de dev** → Mitigación: documentar en `clients/tray/README.md`. El kiosko Electron no se ve afectado — sigue funcionando sin Rust.
- **[R4] Plugin `tauri-plugin-stronghold` está marcado experimental** → Mitigación: si la API rompe, fallback a `keyring` crate o archivo `0600`. El path de fallback se decide en implementación, no requiere cambiar specs.
- **[R5] El endpoint `apply` puede recibir claves no permitidas y dejarse abierta una superficie de config** → Mitigación: la spec exige whitelist (`theme`, `home_layout_id`, `ui_scale`, `favorite_channels`) y rechazo con HTTP 400. Tests cubren cada clave.

## Migration Plan

No hay migration de datos (la feature es 100% aditiva). El deploy es:

1. Merge del backend (nuevo módulo `catodo/modes.py`, endpoint router registrado en `main.py`).
2. Merge del kiosko (panel "Modos" en `AppearanceSettings.tsx`, link en `/remote`).
3. Build del cliente tray en cada SO desde `clients/tray/` y subida de los instaladores a GitHub Releases.

Rollback = quitar el router en `main.py` y los componentes nuevos en el kiosko. No toca esquemas persistidos: `runtime_config` ya soporta claves nuevas sin migration.

## Open Questions

- ¿El "Deep link to full remote" (spec system-tray-client, requirement `Deep link to full remote`) debe abrirse con `open` del SO o levantar el webview interno de Tauri? Decisión menor de UX — el webview interno permite mantener al usuario en el tray sin cambiar de app, pero suma complejidad (otro handle de ventana, posible conflicto con `tauri-plugin-positioner`). Resolver en implementación, no afecta specs ni tasks.
- ¿El listado de favoritos (`favorite_channels`) se persiste también en `runtime_config` como key nueva, o vive sólo dentro del preset? Si vive suelto, podríamos querer un endpoint `PATCH /api/favorites` independiente. Por ahora la spec lo ata al preset; si hace falta exponerlo aparte, se agrega en una change futura sin romper nada.