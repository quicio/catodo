## Context

Hoy `ChannelManager` tiene `_volume` global y `mixer.get/set_volume` (pactl) más `adjust_volume`. El volumen se aplica al sistema y a comandos `volume` de canales. El estado `/api/state` expone `volume`. La persistencia usa el store (`catodo/store.py`) con archivos JSON.

## Goals / Non-Goals

**Goals:**
- Volumen por canal persistido y aplicado en el switch.
- Routing opcional a sinks.

**Non-Goals:**
- Mezcla simultánea de canales, EC, EQ.

## Decisions

### 1. Mapa persistido `channel_id → volumen`
`ChannelManager` guarda `_per_channel: dict[str, int]` cargado desde store `per_channel_volume`. `open(channel_id)` guarda el volumen del canal actual y aplica el del nuevo: `mixer.set_volume` si el canal no tiene volumen propio, o `channel.command("volume", level=…)` (Spotify usa `_set("Volume")`). `set_volume`/`adjust_volume` actualizan tanto el global como el del canal activo y persisten.

### 2. Config
`per_channel_volume_enabled` (default true), `per_channel_volume_default` (50), `channel_audio_sinks` (map canal→sink). Si está deshabilitado, el comportamiento queda global.

### 3. Routing a sinks
En `open()`, si `channel_audio_sinks[channel_id]` existe, se mueve el sink por defecto del sistema a ese sink con `pactl set-default-sink <sink>` (o `pacmd`). Se detecta PulseAudio una vez (cache); si no está, no se intenta. Errors logueados y silenciosos.

## Risks / Trade-offs

- **Aplicar volumen por canal puede sorprender** → default activado pero con `per_channel_volume_default` razonable y fácil de desactivar.
- **pactl con pipes distintas** → se detecta `PULSE_SERVER`/usuario del servicio; si falla, se loguea y se mantiene el volumen global.
