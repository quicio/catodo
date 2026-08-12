## 1. Backend — volumen por canal

- [x] 1.1 En `ChannelManager`: mapa `channel_id → volumen` persistido en store (`per_channel_volume`), cargado al inicio y guardado al cambiar.
- [x] 1.2 `open()` aplica el volumen del canal nuevo (mixer o `channel.command("volume")`) y guarda el del canal saliente.
- [x] 1.3 `set_volume`/`adjust_volume` actualizan y persisten el volumen del canal activo; `state()` expone el volumen actual (sin cambio de contrato).

## 2. Backend — config y routing

- [x] 2.1 Claves `per_channel_volume_enabled`, `per_channel_volume_default`, `channel_audio_sinks` en `runtime_config`.
- [x] 2.2 En `open()`, mover el sink default con `pactl set-default-sink` si `channel_audio_sinks` lo indica y PulseAudio está disponible (con detección cacheada).

## 3. Tests backend

- [x] 3.1 Tests de persistencia y switch de volumen por canal (guardar, restaurar, default, disabled).
- [x] 3.2 Tests del routing de sink (mockeado pactl; sin PulseAudio → no falla).

## 4. Verificación

- [x] 4.1 E2E: subir volumen en Spotify, pasar a YouTube → el volumen cambia al de YouTube; volver a Spotify → se restaura.
- [x] 4.2 README: documentar las claves de config.
