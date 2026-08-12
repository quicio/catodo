## Context

El backend ya tiene `ChannelManager.open/next/previous`, `set_volume/adjust_volume`, comandos por canal (`play/pause/toggle`) y el broker de eventos WS. El matcher de voz es una capa que traduce texto → llamadas del manager + evento.

## Goals / Non-Goals

**Goals:**
- Traducir texto transcrito a acciones.
- Feedback de qué se entendió.

**Non-Goals:**
- STT (recibe texto), wake-word, diálogo.

## Decisions

### 1. `catodo/voice.py` — matcher de intenciones
Función `match(text, channels) -> Intent` con:
- **Canal por nombre**: substring normalizado (minúsculas, sin acentos) contra `available_channels[].name`. Prioridad al nombre más largo que matchee.
- **Canal por número**: regex `canal\s+(uno|dos|tres|cuatro|cinco|seis|\d+)` → posición.
- **Verbos**: mapa de frases → acción (`siguiente/adelante` → `next`; `atrás/anterior/volver` → `previous`; `sube/arriba el volumen|más volumen` → volume +; `baja/bajo` → volume -; `pausa`/`pause`; `play/reproducí`; `home/inicio`; `pantalla` → open `screen-cast`).

### 2. Endpoint `POST /api/voice`
Body `{text}`. Llama `match`, ejecuta la acción en el manager (o `manager.open`), y publica `voice_command {text, recognized, action}`. Devuelve `{ok, recognized}`.

### 3. Overlay en el frontend
En `App.tsx` se maneja `voice_command` → un estado `voiceFeedback` (texto + reconocido) que se muestra ~3s (overlay estilo TV). El evento ya se disparcha al store.

## Risks / Trade-offs

- **Falsos positivos en nombres de canal** → matching por nombre más largo + verbo primero (si el texto empieza con verbo "poné/abre", restar el verbo antes de matchear canal).
- **Español rioplatense** → el matcher incluye variantes comunes; se extiende con un diccionario simple.
