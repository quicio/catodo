# Design

## Context

`WebChannel` pausaba `video/audio` sólo en el frame principal; Pluto usa iframes
cross-origin/WebAudio. Los webviews conviven por keep-alive.

## Decisions

- **Mute central** con `webContents.setAudioMuted(!active)` para cada webview;
  corta audio de cualquier frame/origen.
- **Pause best-effort en todos los frames** desde el main process:
  `contents.mainFrame` + `frame.frames` recursivo, `executeJavaScript`.
- **Aplicación redundante** al cambiar de canal, `dom-ready`, `did-navigate` y
  `did-finish-load`; un segundo pause a 1200 ms cubre autoplay tardío.
- **Renderer fallback** con `webview.setAudioMuted` y pause del frame principal.
- Al volver, desmutea sin reanudar para respetar “quede pausado”.

## Risks

- Players con workers/WebAudio sin `<video>`: el mute garantiza silencio; el
  pause puede no aplicar.
- El keep-alive conserva CPU/red de la página; eliminarlo requeriría destruir y
  recargar el webview.
