# Spec Delta — emission-channels

## Purpose

Motor de canales de medios configurables: cada canal escanea una carpeta local y expone series con temporadas/episodios o videos planos, con identidad visual y orden propios.

## ADDED Requirements

### Requirement: Canal de emisión configurable

El sistema SHALL crear un canal de emisión por cada entrada de la configuración de bibliotecas, con `id`, `name`, `path`, `kind` (`series` o `videos`), `icon`, `color` y `order`.

#### Scenario: Modo series

- **WHEN** un canal de emisión con `kind: series` apunta a una carpeta con subcarpetas de series/temporadas
- **THEN** su estado agrupa episodios por serie y temporada, con nombre y ruta relativa

#### Scenario: Modo videos

- **WHEN** un canal de emisión con `kind: videos` apunta a una carpeta plana de videos
- **THEN** su estado los agrupa como una lista de videos sin temporadas

#### Scenario: Identidad y orden

- **WHEN** la entrada define `name`, `icon`, `color` u `order`
- **THEN** el canal aparece en Home y la barra con esos valores y en esa posición

#### Scenario: Carpeta inexistente o vacía

- **WHEN** el `path` no existe o no tiene videos
- **THEN** el estado reporta `count: 0` y `current: null` sin romper el resto de canales

### Requirement: Múltiples canales de emisión

El sistema SHALL permitir varias entradas de bibliotecas activas a la vez y SHALL actualizarlas sin reiniciar el backend.

#### Scenario: Alta en caliente

- **WHEN** se crea una biblioteca válida
- **THEN** el canal aparece en `/api/channels` en la misma sesión

#### Scenario: Edición en caliente

- **WHEN** se edita nombre, ruta, modo, icono, color u orden de una biblioteca
- **THEN** el canal refleja el cambio sin reiniciar

#### Scenario: Borrado del canal actual

- **WHEN** se borra la biblioteca del canal actual
- **THEN** el canal desaparece y los clientes vuelven al Home

### Requirement: Gestión local de bibliotecas

La API de bibliotecas SHALL aceptar alta, edición y borrado, y SHALL rechazar cambios desde un origen externo.

#### Scenario: Alta

- **WHEN** `POST /api/libraries` recibe `name`, `path` y `kind` válidos
- **THEN** se persiste la entrada, se genera un `id` único y se registra el canal

#### Scenario: Edición

- **WHEN** `PATCH /api/libraries/{id}` recibe campos válidos
- **THEN** se actualizan los campos, se re-registra el canal y se publica un evento

#### Scenario: Borrado

- **WHEN** `DELETE /api/libraries/{id}` borra una biblioteca existente
- **THEN** se elimina de la configuración y se desregistra su canal

#### Scenario: Origen externo

- **WHEN** un origen externo intenta crear, editar o borrar una biblioteca
- **THEN** responde 403 y no cambia nada

#### Scenario: Campos inválidos

- **WHEN** falta `name`/`path` o `kind` no es `series`/`videos`
- **THEN** responde 4xx y no toca la configuración

### Requirement: Escaneo y reproducción genéricos

Cada canal de emisión SHALL escanear recursivamente su carpeta, exponer los videos con nombres y rutas, seleccionar el actual y servir el archivo con soporte de `Range`.

#### Scenario: Extensiones de video

- **WHEN** la carpeta contiene `.mp4`, `.mkv`, `.avi`, `.webm` o `.mov`
- **THEN** aparecen como episodios/videos del canal

#### Scenario: Navegación

- **WHEN** se envían `set_episode`, `next`, `prev` o `refresh`
- **THEN** el canal actualiza el actual/episodios y publica `episode_changed` cuando corresponde

#### Scenario: Seek por HTTP

- **WHEN** el reproductor pide un rango de bytes
- **THEN** el endpoint responde 206/416 con los headers correctos

### Requirement: Progreso por canal

Cada canal de emisión SHALL guardar el progreso por video y exponer `position_seconds` y `watched` en sus episodios.

#### Scenario: Guardar posición

- **WHEN** llega `seek` con posición y duración
- **THEN** el progreso se persiste para ese canal y esa ruta

#### Scenario: Reanudar

- **WHEN** se reabre un video con progreso guardado
- **THEN** el reproductor arranca en esa posición y muestra el indicador de reanudación

#### Scenario: Aislamiento entre canales

- **WHEN** dos canales tienen un video con la misma ruta relativa
- **THEN** el progreso de uno no pisa el del otro

### Requirement: Compatibilidad con bibliotecas existentes

El sistema SHALL cargar las entradas `libraries` existentes y SHALL tratar `movies` como `videos`; `anime_dir` no creará un canal automáticamente.

#### Scenario: Entrada legacy movies

- **WHEN** una entrada existente usa `kind: movies`
- **THEN** se comporta como `kind: videos`

#### Scenario: Sin Anime implícito

- **WHEN** no existe una entrada de biblioteca para Anime
- **THEN** no se registra un canal `anime` aunque `anime_dir` esté configurado
