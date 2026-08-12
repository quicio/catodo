## Why

El remote ya trae un teclado (simple-keyboard) que tipea con `xdotool` a nivel del sistema (`/api/mouse/type`): es frágil (depende del foco de la ventana X) y no hay una búsqueda guiada. Con el kiosk Electron se puede inyectar texto directo al webview activo de forma confiable.

## What Changes

- **Tipeo confiable en el kiosk**: nuevo endpoint `POST /api/type` que publica el evento WS `type_text`; el kiosk Electron lo recibe e inyecta el texto en el webview activo (`webContents.insertText`). `/api/mouse/type` (xdotool) queda como fallback para apps fuera del webview.
- **Teclas útiles en la inyección**: soporta `{ENTER}`/`\n` y `{BACKSPACE}` para buscar y corregir.
- **Búsqueda desde el remote**: un campo "Buscar" con atajos (YouTube, web, etc.) que enfoca el webview, tipea el texto y envía Enter — el canal web (YouTube) responde con su buscador.

## Capabilities

### New Capabilities
- `remote-keyboard`: inyección de texto y búsqueda desde el remote hacia el webview activo del kiosk.

### Modified Capabilities
- Ninguna.

## Impact

- **Backend**: endpoint `POST /api/type` (publica evento WS `type_text`). Se mantiene `/api/mouse/type`.
- **Electron**: preload expone `insertText`; main inyecta en `activeWebview.insertText`.
- **Frontend**: `App.tsx` maneja `type_text` y lo reenvía por IPC.
- **Remote**: campo de búsqueda que usa el teclado existente + `POST /api/type`.
- **Otros**: tests backend del endpoint/evento, README.

## Non-goals

- No es un teclado físico virtual del OS.
- No autocompletar ni corrección ortográfica.
- No un motor de búsqueda dentro de Cátodo (solo tipea y envía al canal enfocado).
