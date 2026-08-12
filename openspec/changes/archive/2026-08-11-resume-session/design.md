## Context

El backend ya persiste `last_channel_id` (store `last_state.json`) y lo expone en `/api/state` (`manager.state()` → `last_channel_id`). El frontend arranca siempre en el Home (`goHome` inicial). Falta solo la decisión de arranque en el kiosk.

## Goals / Non-Goals

**Goals:**
- Abrir el último canal al boot si `resume_last_channel` y existe un canal válido.
- No romper si el canal ya no existe.

**Non-Goals:**
- Persistencia por canal de otros estados, sesiones múltiples.

## Decisions

### 1. Config `resume_last_channel` en `runtime_config`
Clave nueva con default `true` (comportamiento tipo TV). El `manager.state()` ya incluye `last_channel_id`; no se toca backend salvo la clave de config.

### 2. Frontend decide al arrancar
En `App.tsx`, el snapshot inicial (WS) o `api.state()` trae `last_channel_id`. Tras cargar `channels`, si `runtime_config.get("resume_last_channel")` (vía `/api/config` en el snapshot inicial, o se cachea una vez) y `last_channel_id` está en la lista → `api.open(last_channel_id)`. Como el estado llega por WS, se hace cuando llega el primer `state_snapshot`.

### 3. Canal inexistente
Se valida contra `available_channels` del snapshot; si no está, no se abre y queda el Home.

## Risks / Trade-offs

- **Arranque en un canal web sin listo el webview** → el open es el mismo que al tocar un hotkey; sin cambio de riesgo.
- **Config remota vs kiosk** → se lee una vez del `/api/config` inicial; si cambia, aplica al próximo boot.
