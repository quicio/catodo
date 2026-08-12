## Purpose

Convierte Cátodo en un receptor IPTV: un canal que lee una playlist M3U/M3U8 (local o por URL), agrupa los canales libres por categoría y los reproduce vía un proxy ffmpeg en el backend, con zapping tipo TV.

## ADDED Requirements

### Requirement: Canal IPTV con playlist configurable
El sistema SHALL exponer un canal tipo `iptv` que lee una playlist M3U/M3U8 configurada por `iptv_playlist`.

#### Scenario: Playlist local
- **WHEN** `iptv_playlist` apunta a un archivo `.m3u` local
- **THEN** el canal parsea sus entradas y las expone como canales

#### Scenario: Playlist remota
- **WHEN** `iptv_playlist` es una URL de playlist
- **THEN** el canal descarga la lista (con TTL) y la expone como canales

#### Scenario: Recargar la lista
- **WHEN** se envía el comando `refresh`
- **THEN** se vuelve a leer/descargar la playlist y se actualizan los canales

### Requirement: Agrupación y estado
El sistema SHALL agrupar los canales por su categoría (`group-title`) y exponer el estado del canal IPTV.

#### Scenario: Canales por grupo
- **WHEN** se consulta el estado
- **THEN** se devuelven los canales agrupados por `group-title` con nombre, logo (`tvg-logo`) y el canal actual

#### Scenario: Sin grupo
- **WHEN** una entrada no tiene `group-title`
- **THEN** se agrupa bajo un grupo "Otros"

### Requirement: Reproducción vía proxy ffmpeg
El sistema SHALL reproducir el canal seleccionado a través de un proxy ffmpeg en el backend.

#### Scenario: Seleccionar canal
- **WHEN** se envía `set_channel` con un canal
- **THEN** el stream de ese canal queda disponible en `/stream`, servido por ffmpeg (probea el formato y transcodifica si hace falta)

#### Scenario: Zapping
- **WHEN** se envían `next`/`prev`
- **THEN** se selecciona el canal siguiente/anterior dentro del grupo y el stream cambia

#### Scenario: Un solo stream activo
- **WHEN** se cambia de canal o se cierra el canal IPTV
- **THEN** el proceso ffmpeg anterior se detiene (no quedan streams huérfanos)

### Requirement: Stream no disponible
El sistema SHALL manejar streams que fallan sin romper el canal.

#### Scenario: Canal caído
- **WHEN** el stream no responde o es inválido
- **THEN** se publica un evento de error y la UI muestra un mensaje, dejando el resto del canal operable
