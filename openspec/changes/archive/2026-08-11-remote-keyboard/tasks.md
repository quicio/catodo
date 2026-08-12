## 1. Backend

- [x] 1.1 Endpoint `POST /api/type` que publica el evento WS `type_text {text}`.

## 2. Electron

- [x] 2.1 `preload.cjs`: exponer `catodo.insertText(text)` → IPC `insert-text`.
- [x] 2.2 `main.cjs`: handler `insert-text` → `activeWebview.insertText(text)` (con soporte de `{ENTER}`/`{BACKSPACE}` y guard de webview nulo).

## 3. Frontend

- [x] 3.1 En `App.tsx`, manejar `type_text` → `catodo.insertText(text)`.

## 4. Remote

- [x] 4.1 Campo "Buscar" en el remote que envía `POST /api/type` (reusa el teclado existente).

## 5. Verificación

- [x] 5.1 E2E: en YouTube TV, buscar un término desde el remote → aparece el resultado de búsqueda.
- [x] 5.2 Tests backend del endpoint (evento publicado).
- [x] 5.3 README: documentar `POST /api/type`.
