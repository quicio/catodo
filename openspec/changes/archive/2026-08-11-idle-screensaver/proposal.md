## Why

Cátodo corre 24/7 como kiosk, pero si queda sin input se queda pegado en el canal actual con la pantalla encendida. Queremos comportamiento de "TV real": tras inactividad pasar a un screensaver (wallpapers/reloj), opcionalmente apagar la pantalla (sleep), y volver al canal anterior con cualquier actividad.

## What Changes

- **Detección de inactividad en el backend**: `IdleManager` con reloj de actividad (monotónico) y timers configurables; publica eventos WS `idle_screensaver_on`, `idle_sleep_on`, `idle_off`.
- **Actividad**: middleware que toca el reloj en cada llamada API (excepto health) + endpoint `POST /api/activity` para que el frontend avise de input local (mouse/teclado del kiosk).
- **Screensaver en el frontend**: overlay a pantalla completa con wallpapers + reloj (reusa el estilo del Home) al entrar en `idle_screensaver_on`; vuelve al canal anterior con `idle_off`. Actividad local (mousemove/keydown/touch) lo cierra al instante y avisa al backend (throttle).
- **Sleep**: tras `idle_sleep_seconds` (configurable, default desactivado) la pantalla se apaga/oscurece; cualquier actividad la enciende.
- **Config**: `idle_screensaver_seconds` y `idle_sleep_seconds` en `runtime_config`, editables desde **Settings** del remote.

## Capabilities

### New Capabilities
- `idle-screensaver`: detección de inactividad, pantalla de reposo, vuelta al canal y apagado de pantalla configurable.

### Modified Capabilities
<!-- No cambian requisitos de specs existentes. -->

## Non-goals

- Control **HDMI-CEC** físico (encender/apagar el monitor real) — queda como extensión futura.
- Detección de presencia (sensor de movimiento).
- Suspensión del sistema operativo / `systemctl suspend`.
- Screensavers configurables por plugin en esta fase.

## Impact

- **Backend**: nuevo `catodo/idle.py` (IdleManager + middleware + `/api/activity`), eventos WS, claves de config.
- **Frontend**: `IdleScreensaver` overlay en el root de la app, ping de actividad local, gestión de estados.
- **Remote**: sección en Settings para configurar tiempos.
- **Tests**: IdleManager (transiciones + config) y endpoint `/api/activity`.
