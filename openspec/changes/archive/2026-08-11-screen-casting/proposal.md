## Why

Cátodo convierte cualquier monitor en una "smart TV", pero hoy solo reproduce canales internos. Queremos que también funcione como pantalla inalámbrica: que cualquier navegador de la red pueda proyectar su pantalla hacia el TV, sin depender de protocolos propietarios.

## What Changes

- Nuevo canal **Screen Cast** que muestra en pantalla completa el stream WebRTC entrante (elemento `<video>` en el frontend).
- El backend sirve una página **`/cast`** (la "fuente"): el dispositivo la abre, comparte su pantalla con `getDisplayMedia()` y el stream llega por WebRTC al canal.
- **Signaling** WebRTC (offer/answer/ICE) sobre el WebSocket existente (`/api/ws`) o un endpoint dedicado.
- Auto-descubrimiento en LAN: la página `/cast` detecta Cátodo en la red (mDNS/DNS-SD o barrido del gateway).
- Control desde el remote: pestaña/acción "Cast" para iniciar/finalizar sesiones y ver estado.
- Overlay en el TV mientras hay una sesión activa (indicador de proyección + botón para cortar).

## Capabilities

### New Capabilities
- `screen-casting`: recepción de proyección de pantalla vía WebRTC, canal de visualización, signaling y página de origen `/cast`.

### Modified Capabilities
<!-- No hay cambios de requisitos en specs existentes: el canal Cast es un canal más de tipo app/web. -->

## Non-goals

- Receivers de **AirPlay / Miracast / Google Cast** (protocolos propietarios, fuera de alcance).
- Espejo de pantalla desde **celulares** (Android/iOS no exponen `getDisplayMedia`).
- Sincronización de audio más allá de lo que da WebRTC por defecto.
- Proyección de contenido con DRM (Widevine) hacia el stream.

## Impact

- **Backend**: nuevo router `/api/cast` (estado, session token) + página estática `/cast` + integración con el broker de eventos WS.
- **Frontend (Electron)**: canal `screen-cast` (vista React con `<video>`, client WebRTC), registro en `ChannelView`, home y remote.
- **Remote**: pestaña Cast con estado y control de sesión.
- **Dependencias**: ninguna nueva librería de terceros (WebRTC nativo de Chromium); posible helper de descubrimiento en LAN.
- **Config**: `data_dir` guarda sesiones/estado persistente (opcional).
