## Why

Hoy el volumen es global (mixer del sistema). En una TV, cada canal debería recordar su propio volumen (un canal web con audio bajo no debería tocar el volumen de Spotify, etc.) y opcionalmente salir por un dispositivo distinto (p.ej. Spotify por los parlantes y el resto por el TV).

## What Changes

- **Volumen por canal**: cada canal recuerda su nivel de volumen (0-100), persistido (`per_channel_volume.json`). Al cambiar de canal, el volumen activo pasa a ser el del canal nuevo; al volver, se restaura el anterior.
- **Config**: `per_channel_volume_enabled` (default `true`); `per_channel_volume_default` (default 50) para canales sin nivel guardado.
- **Routing de audio por canal (opcional)**: `channel_audio_sinks` mapea canal → sink de PulseAudio (por nombre); al abrir el canal, el stream del sistema se mueve a ese sink (`pactl`). Si no hay PulseAudio/sink, se ignora sin error.
- El estado global expone el volumen del canal actual (ya es `/api/state`), sin cambios de contrato para el frontend.

## Capabilities

### New Capabilities
- `per-channel-volume`: volúmenes por canal y (opcional) routing de audio a sinks de PulseAudio.

### Modified Capabilities
- Ninguna.

## Impact

- **Backend**: `ChannelManager` mantiene un mapa `channel_id → volumen` persistido; al `open()` de un canal aplica su volumen (mixer o comando `volume` del canal); al `close()`/switch restaura. `set_volume`/`adjust_volume` escriben en el canal activo.
- **Config**: claves `per_channel_volume_enabled`, `per_channel_volume_default`, `channel_audio_sinks`.
- **Frontend**: sin cambios (lee `state.volume`).
- **Otros**: tests (persistencia, switch de volumen, sinks), README.

## Non-goals

- No mezcla simultánea de audio de varios canales a la vez.
- No EC controlado por app (solo sinks existentes).
- No equalizador.
