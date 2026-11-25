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

### Requirement: Gestión de la lista desde Ajustes

El frontend SHALL exponer una pestaña `IPTV` en Ajustes para cargar una lista M3U/M3U8 subiendo un archivo o indicando una URL/ruta. El backend SHALL aceptar `POST /api/iptv/playlist` con el contenido de la lista, guardarlo bajo `<data_dir>/iptv/playlist.m3u`, actualizar `iptv_playlist` y refrescar el canal. `DELETE /api/iptv/playlist` SHALL quitar la lista activa. Ambos endpoints SHALL ser local-only.

#### Scenario: Subir una lista
- **WHEN** el usuario elige un `.m3u`/`.m3u8` y pulsa "Subir y activar"
- **THEN** la lista queda guardada en el data dir, pasa a ser la fuente del canal IPTV y Ajustes muestra la cantidad de canales y grupos.

#### Scenario: Lista inválida
- **WHEN** el archivo subido está vacío o no contiene entradas M3U válidas
- **THEN** el backend responde 400 y la lista anterior no se modifica.

#### Scenario: Lista por URL o ruta
- **WHEN** el usuario guarda una URL o una ruta local en la pestaña IPTV
- **THEN** `iptv_playlist` se actualiza y el canal recarga la lista.

#### Scenario: Quitar la lista
- **WHEN** el usuario pulsa "Quitar lista"
- **THEN** se borra el archivo administrado, `iptv_playlist` queda vacío y el canal reporta cero canales.

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

#### Scenario: Recuperación al cambiar de canal
- **WHEN** un canal falla y el usuario elige otro que sí responde
- **THEN** el error del canal anterior se limpia y el nuevo canal reproduce sin recargar la app

### Requirement: Verificación de disponibilidad

El backend SHALL verificar los canales de la lista en background al abrir el canal IPTV, al recargar la playlist y al recibir el comando `check`, usando `ffprobe` con timeout corto y concurrencia limitada. El estado SHALL exponer por canal `available` y el error; el zapping (`next`/`prev`) SHALL saltar los canales no disponibles y `set_channel` SHALL rechazarlos. El frontend SHALL ocultar por defecto los canales caídos, ofrecer un toggle para mostrarlos deshabilitados y un botón `Verificar`.

#### Scenario: Verificación automática
- **WHEN** el usuario abre el canal IPTV o recarga la lista
- **THEN** comienza la verificación en background y el estado muestra el progreso (`checked`/`total`)

#### Scenario: Canales caídos ocultos
- **WHEN** termina la verificación y hay canales que no respondieron
- **THEN** desaparecen de la lista y del zapping, y el header indica cuántos quedaron caídos

#### Scenario: Mostrar caídos
- **WHEN** el usuario activa `CAÍDOS`
- **THEN** ve esos canales marcados como `CAÍDO`, deshabilitados y con el motivo en el tooltip

#### Scenario: Verificar de nuevo
- **WHEN** el usuario pulsa `Verificar`
- **THEN** se vuelve a comprobar la lista y se actualizan los disponibles sin recargar la app

#### Scenario: Elegir mientras la verificación sigue
- **WHEN** el usuario elige un canal que todavía no fue verificado
- **THEN** el backend lo prueba antes de cambiar; si responde lo selecciona y cachea sus codecs, y si falla lo marca caído y no lo selecciona
