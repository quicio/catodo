# Tasks — idle-screensaver

## 1. Backend — IdleManager

- [x] 1.1 Crear `catodo/idle.py`: `IdleManager` con `touch()`, estados `active|screensaver|sleep`, umbrales desde `runtime_config`, y task de fondo que publica `idle_screensaver_on` / `idle_sleep_on` / `idle_off` solo en transiciones.
- [x] 1.2 Integrar en `main.py`: instanciar `IdleManager` en lifespan, arrancar/detener su task, y middleware HTTP que toca el reloj en `/api/*` (excepto `/api/health` y `/api/activity`).
- [x] 1.3 Endpoint `POST /api/activity` que llama a `idle.touch()`.
- [x] 1.4 Claves `idle_screensaver_seconds` y `idle_sleep_seconds` en `runtime_config.KEYS`.

## 2. Tests backend

- [x] 2.1 Tests de `IdleManager`: transiciones active→screensaver→sleep, sleep desactivado (0), y `touch()` reinicia.
- [x] 2.2 Test del endpoint `/api/activity` (reinicia el contador) y del middleware (una petición `/api/channels` toca el reloj).

## 3. Frontend — overlay de reposo

- [x] 3.1 Componente `IdleScreensaver` (root de App): escucha `idle_screensaver_on`/`idle_sleep_on`/`idle_off`; overlay a pantalla completa con wallpapers + reloj (reusa estilo Home) y estado sleep (negro).
- [x] 3.2 Cierre inmediato por input local (mousemove/mousedown/keydown/touchstart) + ping `POST /api/activity` throttled.
- [x] 3.3 Al reactivar, restaurar el canal anterior sin recargar (el overlay solo cubre; el canal sigue montado).

## 4. Remote — settings

- [x] 4.1 Sección en Settings del remote: inputs para `idle_screensaver_seconds` e `idle_sleep_seconds` + guardar vía `/api/config`.

## 5. Verificación

- [x] 5.1 E2E: dejar inactivo → screensaver aparece; mover el mouse → se cierra y vuelve el canal; con sleep configurado → pantalla negra y reactiva.
- [x] 5.2 README: documentar la inactividad/reposo y sus claves de config.

## 6. Reproducción cuenta como actividad

- [x] 6.1 Electron (`main.cjs`): detectar video/audio en reproducción dentro del webview activo y avisar al backend con `POST /api/activity` periódico.
- [x] 6.2 Frontend (`App.tsx`): ping de actividad mientras hay un `<video>` local en reproducción o Spotify está en `Playing`.
