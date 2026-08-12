## Why

Comportamiento tipo TV: al encender, Cátodo debería retomar donde quedaste en vez de arrancar siempre en el Home. El backend ya persiste `last_channel_id`; solo falta que el frontend lo use al arrancar.

## What Changes

- Al bootear, si hay un `last_channel_id` guardado y `resume_last_channel` está habilitado, el kiosk abre ese canal automáticamente.
- Nueva clave de config `resume_last_channel` (default `true`).
- Si el canal guardado ya no existe (plugin removido), cae al Home sin error.
- El backend expone `last_channel_id` en `/api/state` (ya lo hace vía `manager.state()`); el frontend lo lee en el snapshot inicial.

## Capabilities

### New Capabilities
- `resume-session`: retomar el último canal activo al encender el kiosk.

### Modified Capabilities
- Ninguna.

## Impact

- **Backend**: clave `resume_last_channel` en `runtime_config` (default `true`). Sin cambios de API (ya está `last_channel_id` en el state).
- **Frontend**: en `App.tsx`, tras cargar el estado inicial y la lista de canales, si `resume_last_channel` y `last_channel_id` existen → `api.open(last_channel_id)`.
- **Otros**: test frontend o smoke, README.

## Non-goals

- No persiste por canal individual (posiciones por canal, etc.).
- No maneja "cerrar sesión/volver al Home siempre" (se desactiva con la config).
