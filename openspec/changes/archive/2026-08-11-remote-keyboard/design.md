## Context

El remote (PWA en `/remote/`) ya tiene `simple-keyboard` y un `POST /api/mouse/type` que usa `xdotool` a nivel del sistema. El kiosk es Electron con `<webview>` para canales web, y ya existe el patrón `media_key` WS → `catodo.mediaKey` (preload) → `activeWebview.sendInputEvent`.

## Goals / Non-Goals

**Goals:**
- Tipear en el webview activo sin depender del foco de X11.
- Búsqueda guiada desde el remote.

**Non-Goals:**
- IME/composición avanzada, teclado del OS, autocompletar.

## Decisions

### 1. `POST /api/type` → evento WS `type_text`
El backend publica `{event: "type_text", text}` en el broker. Se reusa el mecanismo de eventos existente (el frontend ya escucha `media_key`).

### 2. Electron: `insertText`
- `preload.cjs`: expone `catodo.insertText(text)` → `ipcRenderer.send("insert-text", text)`.
- `main.cjs`: `ipcMain.on("insert-text", …)` → `activeWebview.insertText(text)` si hay webview activo y no está destruido.
- El texto se procesa antes de inyectar: `{ENTER}` → `sendInputEvent` Enter (retorno de carro) y `{BACKSPACE}` → tecla Backspace; el resto se inserta literal.

### 3. Frontend maneja `type_text`
En `App.tsx` `handleEvent`: si `event.event === "type_text"` → `catodo.insertText(text)`. Si `catodo` no existe (dev sin Electron) no hace nada.

### 4. Remote: campo "Buscar"
En `app.js` del remote, un campo de texto que al enviar llama a `POST /api/type` con `{text}`. Mantiene el teclado existente.

## Risks / Trade-offs

- **Webview sin foco en campo editable** → `insertText` inserta donde esté el cursor; para buscar en YouTube el usuario primero enfoca (click/remote). Documentado en README.
- **Retro-compat** → se conserva `/api/mouse/type` como fallback.
