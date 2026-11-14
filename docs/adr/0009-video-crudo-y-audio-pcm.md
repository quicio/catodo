# 0009 — Video crudo y audio PCM por WebSocket

- Estado: aceptada
- Fecha: 2026-11-14
- Supersede: parte de [0008](0008-libretro-embebido.md) (el camino H.264/AAC del player)

## Contexto

El player embebido usaba H.264 en fMP4 + MSE para el video y AAC/MSE para el
audio. En una misma máquina eso agrega GOP, fragmentos y el rebuffering de
Chromium: la latencia quedaba en ~2-3 s y el audio se desincronizaba. Los
intentos de bajar el GOP y ajustar MSE no alcanzaron para que un juego de
plataformas fuera jugable.

## Decisión

- El video del player viaja como **frames RGB565 por WebSocket**
  (`/api/channels/{id}/frames`) y se dibuja directo en WebGL.
- El audio viaja como **PCM s16le estéreo** por `/api/channels/{id}/audio-frames`
  y se reproduce con un **AudioWorklet** con un prebuffer chico.
- El camino H.264 (`/api/channels/{id}/stream`) queda **sólo como fallback** si
  WebGL no está disponible.
- El emulador se mantiene a 60 fps en macOS; el `sleep` de un proceso de fondo
  se estira por coalescencia y se cierra con un spin corto + QoS.
- La autenticación de los WebSockets pasa por el mismo middleware de la API.

## Consecuencias

- Latencia de video de 1-2 frames en localhost; audio sincronizado.
- Más ancho de banda local (RGB565 ~6,9 MB/s a 60 fps) y más CPU en el hilo de
  audio/WebGL, aceptable para el kiosko.
- Requiere WebGL2; si falla, el fallback H.264 sigue funcionando.
- El audio PCM es de un solo consumidor; no está pensado para varios clientes
  simultáneos.

## Alternativas descartadas

- Seguir con H.264/MSE y buffers más grandes: la latencia no baja de ~2 s.
- WebRTC: menor latencia pero infraestructura y dependencias nuevas.
- Mantener audio AAC: se desincroniza respecto del video crudo.
