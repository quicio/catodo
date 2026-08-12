## 1. Backend — matcher

- [x] 1.1 Crear `catodo/voice.py`: `match(text, channels)` con canal por nombre (normalizado, prioridad al nombre más largo), canal por número (regex con palabras y dígitos) y verbos (siguiente/anterior, volumen +/-, play/pause, home, pantalla).
- [x] 1.2 Normalización: minúsculas, sin acentos, y quitar verbos introductorios ("poné/abre") antes de matchear el canal.

## 2. Backend — endpoint

- [x] 2.1 `POST /api/voice` con `{text}`: ejecuta la intención en `ChannelManager` y publica `voice_command {text, recognized, action}`.

## 3. Frontend — feedback

- [x] 3.1 En `App.tsx`, manejar `voice_command` → overlay breve con el texto reconocido (y aviso si no se reconoció).

## 4. Tests backend

- [x] 4.1 Tests del matcher: canal por nombre, por número, verbos, texto sin match.
- [x] 4.2 Test del endpoint (publica el evento y ejecuta).

## 5. Verificación

- [x] 5.1 E2E: enviar "poné YouTube", "canal 3", "siguiente", "sube el volumen" → acciones correctas + overlay.
- [x] 5.2 README: documentar `POST /api/voice`.
