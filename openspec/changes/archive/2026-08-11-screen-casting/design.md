# Design — screen-casting

## Context

See `proposal.md` — Why. Cátodo es un shell Electron + backend FastAPI con un broker de eventos WebSocket y la abstracción de canales. El objetivo es recibir proyecciones WebRTC desde cualquier navegador de la red y mostrarlas a pantalla completa como un canal.

## Goals / Non-Goals

- **Goal**: canal `screen-cast` que muestra un stream WebRTC entrante; página `/cast` de origen; signaling; control desde el remote.
- **Non-Goal**: receivers AirPlay/Miracast/Cast; espejo de pantalla desde celulares; SFU/multicast; audio sincronizado más allá de WebRTC.

## Decisions

### 1. El peer de recepción vive en Electron (Chromium), no en el backend
Chromium tiene WebRTC nativo y puede adjuntar un stream a un `<video>`. El backend Python no decodifica video.
- **Alternativa considerada**: `aiortc` en el backend como gateway de medios → dependencia pesada y cuello de botella para un 1:1. Descartada.

### 2. Señalización: relay por WebSocket dedicado, medios P2P
Flujo:

```
  dispositivo                backend :8765                 Electron
  ──────────                  ──────────────                ────────
  /cast (getDisplayMedia)                                    CastReceiver (App root)
        │                        │                              │
        ├──WS /api/cast/ws───────┤  (registra "source")         │
        │                        ├──WS /api/cast/ws◄────────────┤  (registra "receiver")
        │  createOffer(SDP/ICE)  │  relay signal                │  createAnswer
        │◄──────────────────────►│──────────────────────────────►│
        │                                                       │
        └───────────  P2P WebRTC (video+audio)  ───────────────►│  → <video>
```

- El backend solo **relaya** mensajes de signaling entre los dos peers (no es media server).
- El receiver (Electron) es el `answerer`; el origen es el `offerer` (quien llama a `getDisplayMedia`).
- **Alternativa**: reusar `/api/ws` (broker global) → es unidireccional (fan-out) y no sirve para relay bidireccional. Se usa un endpoint WS dedicado `/api/cast/ws`.

### 3. El receiver se monta siempre en el root de la app
El `CastReceiver` (hook/componente a nivel App) mantiene el peer y el stream aun cuando el canal no está abierto; el canal `screen-cast` solo lo consume cuando se abre. Así una proyección iniciada "por afuera" no se pierde aunque nadie haya abierto el canal.
- **Alternativa**: crear el peer solo al abrir el canal → se pierden ofertas tempranas. Descartada.

### 4. Descubrimiento "automático" = el host que sirvió `/cast`
Si el dispositivo abrió `/cast`, esa página la sirvió el propio Cátodo → `location.host` ES el destino. La "detección en LAN" se reduce a pre-rellenar `location.host` (con campo editable). No hace falta mDNS.

### 5. ICE para LAN
Sin STUN para LAN pura; se agrega STUN público de Google como fallback para redes con NAT. Sin TURN (fuera de alcance; se documenta la limitación).

### 6. Sesión única + token
Una sola sesión activa. El origen genera un token de sesión; el backend lo valida en el relay para emparejar source↔receiver. El remote puede forzar el fin de sesión (evento al source y cierre del peer).

### 7. Modelo de estado en el backend
`CastManager` con estado en memoria: `{ status: idle|signaling|active|failed, source_label, started_at }`. Publica `cast_session_started` / `cast_session_ended` al broker. `GET /api/cast` expone el estado.

## Risks / Trade-offs

- **El origen y el TV en redes aisladas (sin STUN/TURN)** → el P2P puede fallar. Mitigación: STUN público + mensaje claro en `/cast`; TURN queda como extensión futura.
- **Electron en renderer con contexto aislado**: WebRTC nativo no necesita node; el `<video>` y `RTCPeerConnection` funcionan en el renderer sin IPC. Si hiciera falta señal más profunda, usar `preload` (ya existe el bridge).
- **getDisplayMedia pide permiso por sesión** → flujo esperado; la página `/cast` explica el permiso.
- **Sesión activa reemplazada por otra** → decisión de producto: se documenta en spec como "reemplaza o rechaza"; se elige **reemplazar** y notificar el fin de la anterior.

## Migration Plan

- Aditivo: se agrega el canal y la página `/cast` sin tocar canales existentes.
- Rollback: quitar el router y el componente; no hay migración de datos.

## Open Questions

- Nada que cambie specs/approach pendiente de resolver.
