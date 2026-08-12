# arcade-boxart Specification

## Purpose
Descarga automáticamente las carátulas de los juegos del canal Arcade desde Libretro Thumbnails y las guarda como sidecar al lado de la ROM, para que el launcher muestre carátulas aunque el usuario no las tenga.
## Requirements
### Requirement: Descarga automática de carátulas
Al escanear el canal Arcade, el sistema SHALL intentar descargar la carátula de cada juego que no la tenga.

#### Scenario: Juego sin carátula al escanear
- **WHEN** el canal Arcade escanea y un juego no tiene carátula local
- **THEN** se intenta descargar su boxart desde Libretro Thumbnails en segundo plano, sin bloquear la grilla

#### Scenario: Descarga exitosa
- **WHEN** la carátula se descarga correctamente
- **THEN** se guarda como `<ROM>.png` al lado de la ROM y la grilla la muestra sin reescaneo manual

#### Scenario: Sin carátula disponible
- **WHEN** la carátula no existe en la fuente
- **THEN** el juego sigue mostrando su placeholder y no se vuelve a intentar de inmediato en cada escaneo

### Requirement: Mapeo de sistemas a RetroArch
El sistema SHALL traducir el nombre de carpeta del sistema al nombre oficial de RetroArch para armar la URL de Libretro Thumbnails.

#### Scenario: Sistema conocido
- **WHEN** la carpeta del sistema tiene un mapeo (ej. `snes` → `Nintendo - Super Nintendo Entertainment System`)
- **THEN** se usa el nombre oficial en la URL de descarga

#### Scenario: Sistema sin mapeo
- **WHEN** la carpeta del sistema no está en el mapa
- **THEN** se intenta con el nombre de la carpeta tal cual, y si falla se saltea ese sistema

### Requirement: Descargas controladas
El sistema SHALL evitar repetir descargas fallidas y no saturar la fuente.

#### Scenario: No repetir fallos
- **WHEN** un intento de descarga falla
- **THEN** ese juego no se vuelve a intentar automáticamente dentro del mismo ciclo (cache en memoria) hasta un retry manual o reinicio

#### Scenario: Lote serializado
- **WHEN** hay varias carátulas pendientes
- **THEN** las descargas se procesan de a una con un pequeño delay, sin lanzarse en paralelo

### Requirement: Retry manual
El sistema SHALL permitir forzar la descarga de carátulas puntuales o de todo el lote.

#### Scenario: Descargar un juego puntual
- **WHEN** se envía el comando `fetch_boxart` con un `game`
- **THEN** se descarga (o re-intenta) la carátula de ese juego y se publica el evento `boxart_fetched`

#### Scenario: Forzar lote
- **WHEN** se envía el comando `fetch_boxarts`
- **THEN** se procesan todas las carátulas faltantes y se publica `boxarts_synced` al terminar

