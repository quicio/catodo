# Proposal

## Why

Los canales web quedan keep-alive para volver rápido, pero al cambiar de canal
el video/audio del webview anterior sigue sonando (Pluto TV, por ejemplo,
reproduce desde iframes/WebAudio y el pause del frame principal no lo alcanza).

## What Changes

- Al pasar un canal web a segundo plano, el webview se mutea a nivel Electron y
  se pausa el media de todos sus frames (incluidos iframes).
- El mute/pause se reaplica al cambiar de canal, en `dom-ready`, `did-navigate`
  y `did-finish-load` (autoplay tardío).
- Al volver al canal, se desmutea pero queda pausado; el keep-alive se conserva.

## Capabilities

### Modified Capabilities

- `frontend-kiosk`: los webviews en segundo plano no reproducen audio y pausan
  su media.

## Impact

- `frontend/electron/main.cjs` (webContents audio + frames).
- `frontend/src/channels/WebChannel.tsx` (fallback `setAudioMuted`).

## Non-goals

- Destruir/recargar webviews al cambiar de canal (se perdería la posición).
- Detener workers o polling de red de la página.
