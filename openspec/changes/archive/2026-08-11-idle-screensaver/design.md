# Design — idle-screensaver

## Context

Cátodo es un kiosk Electron + FastAPI con broker WS. El frontend ya tiene el Home (wallpapers + reloj) reutilizable como pantalla de reposo. Se necesita un reloj de inactividad compartido entre backend (que ve las llamadas API) y frontend (que ve el input local del kiosk).

## Goals / Non-Goals

- **Goal**: estados `active → screensaver → sleep`, eventos WS, overlay de reposo, config de tiempos, aviso de actividad local.
- **Non-Goal**: CEC físico, suspensión del OS, sensores de presencia.

## Decisions

### 1. El reloj vive en el backend; el frontend reporta actividad local
El backend no ve el mouse/teclado local del Electron, y el frontend no ve las llamadas API del remote. Solución: `IdleManager` en el backend con `touch()`, y el frontend hace `POST /api/activity` (throttle ~5s) al detectar input local. El middleware de FastAPI toca el reloj en toda petición `/api/*` (excepto health y `/api/activity` para no auto-reiniciarse por su propio ping).

### 2. Un único task de fondo evalúa las transiciones
`IdleManager.start()` lanza un `asyncio.Task` que cada segundo compara `now - last_activity` contra los umbrales y publica eventos solo en los cambios de estado (evita spam de WS). Estados: `active`, `screensaver`, `sleep`.

### 3. El frontend decide el overlay; el backend decide el estado
El backend solo publica eventos; el frontend (componente `IdleScreensaver` montado en el root de App) muestra/oculta el overlay y lo cierra al instante con input local, avisando al backend. Así la reactivación es inmediata (sin esperar el tick del backend).

### 4. Config por `runtime_config`
`idle_screensaver_seconds` (default 240) y `idle_sleep_seconds` (default 0 = desactivado). Editables vía `/api/config` y desde Settings del remote.

## Risks / Trade-offs

- **Throttle del ping de actividad** → puede haber hasta ~5s de lag en el backend antes de "ver" la actividad local. El overlay se cierra al instante en el frontend, así que la UX no sufre; el backend solo usa el ping para no volver a entrar en reposo. → Mitigación: throttle corto (2s) y close local inmediato.
- **Screensaver sobre el canal que reproduce** → el audio seguiría sonando debajo. Decisión: en screensaver no se pausa el canal (comportamiento tipo TV). Se puede pausar en el futuro.
- **Eventos repetidos** → solo se publican en transición de estado.

## Migration Plan

- Aditivo: middleware + IdleManager + overlay. No toca canales existentes.
- Rollback: quitar el middleware y el componente; config ignorada si se deja el valor por defecto.

## Open Questions

- Ninguna que cambie specs/approach.
