## Why

Una TV se controla naturalmente por voz. Cátodo no tiene ningún canal de comandos de voz; con un endpoint de texto a comando, cualquier STT (Vosk offline, un push desde el celular, un mando con micrófono) puede controlar la TV.

## What Changes

- **Endpoint de comando por voz**: `POST /api/voice` recibe texto transcrito y lo convierte en acciones: abrir canal por nombre/número, siguiente/anterior, volumen +/-, play/pause, Home, pantalla (cast), etc.
- **Matcher de intenciones** en backend: matching por nombre de canal (`available_channels`), números (`"canal 2"`, `"canal dos"`), y verbos (`siguiente`, `atrás`, `sube el volumen`, `baja el volumen`, `pausa`, `play`, `home`, `pantalla`).
- **Eventos de feedback**: publica `voice_command {recognized}` para que el frontend muestre qué se entendió (overlay breve).
- **Frontend**: overlay de feedback de voz (texto reconocido + acción) que se oculta solo.

## Capabilities

### New Capabilities
- `voice-control`: interpretación de comandos de voz (texto) y ejecución de acciones de Cátodo.

### Modified Capabilities
- Ninguna.

## Impact

- **Backend**: módulo `catodo/voice.py` (matcher de intenciones) + endpoint `POST /api/voice` que ejecuta en `ChannelManager` y publica el evento.
- **Frontend**: overlay de feedback en `App.tsx` (maneja `voice_command`).
- **Config**: sin claves nuevas (el STT queda fuera del scope).
- **Otros**: tests del matcher (canales, números, verbos), README.

## Non-goals

- No incluye el reconocimiento de voz (STT) en sí; recibe texto ya transcrito.
- No wake-word, no streaming de audio.
- No es un asistente conversacional (solo comandos directos).
