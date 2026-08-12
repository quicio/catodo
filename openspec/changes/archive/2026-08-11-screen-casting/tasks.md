# Tasks — screen-casting

## 1. Backend — estado y sesiones

- [x] 1.1 Crear `CastManager` con estado `idle | signaling | active | failed`, sesión única (token + origen + `started_at`) y helpers para transiciones.
- [x] 1.2 Publicar eventos `cast_session_started` / `cast_session_ended` en el broker WS.
- [x] 1.3 Endpoint `GET /api/cast` que expone el estado de la sesión (y 200 con sesión vacía).
- [x] 1.4 Tests unitarios de `CastManager`: ciclo de vida, reemplazo de sesión activa, eventos emitidos.

## 2. Backend — signaling y página de origen

- [x] 2.1 Endpoint WS `/api/cast/ws`: registrar peers `source` y `receiver` y relajar mensajes de signaling (offer/answer/ICE) entre ambos.
- [x] 2.2 Manejo de desconexión: si el source o el receiver se desconectan, finalizar la sesión y notificar.
- [x] 2.3 Página estática `/cast` (HTML/JS) con `getDisplayMedia()` + `RTCPeerConnection` (offerer), destino pre-rellenado con `location.host` y campo editable, estados de error (sin soporte / fallo ICE / sesión rechazada).
- [x] 2.4 Prueba de humo: script de tests que verifica el relay de signaling entre dos clientes WS simulados.

## 3. Frontend — receiver y canal

- [x] 3.1 Componente/hook `CastReceiver` a nivel App: conexión WS a `/api/cast/ws`, `RTCPeerConnection` como answerer, y exposición del stream + estado (vía context/estado global).
- [x] 3.2 Canal `screen-cast` (vista React con `<video>`): estados "Esperando proyección…", activo, fallido; registrar en `ChannelView`, home (icono/color) y remote.
- [x] 3.3 Control en el remote: indicador "Proyectando", origen y botón "Detener proyección" (`POST /api/cast/stop` o comando de canal).
- [x] 3.4 Verificación E2E manual: abrir `/cast` en otro navegador, compartir pantalla, confirmar video+audio en el TV y fin de sesión desde el remote.

## 4. Pulido

- [x] 4.1 Manejo de `getDisplayMedia` denegado / `NotAllowedError` en `/cast` con mensaje claro.
- [x] 4.2 Overlay en el TV mientras se proyecta (indicador + acción de cortar), sin interferir con los hotkeys existentes.
- [x] 4.3 Documentar en README el flujo de proyección y la limitación de celulares.
