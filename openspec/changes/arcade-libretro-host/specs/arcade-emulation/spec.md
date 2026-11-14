## ADDED Requirements

### Requirement: Host libretro embebido

El canal Arcade SHALL ejecutar los juegos dentro del backend con un core libretro
cargado en proceso, sin abrir ventanas externas.

#### Scenario: Jugar dentro del kiosko

- **WHEN** el usuario elige un juego en el launcher Arcade
- **THEN** el backend carga el core del sistema, corre el juego y lo sirve como stream al kiosko, sin lanzar otra aplicación

#### Scenario: Sin core disponible

- **WHEN** el sistema del juego no tiene core instalado y no hay red para descargarlo
- **THEN** el estado del canal reporta `core_missing` con el sistema y la UI muestra el error sin romper el launcher

### Requirement: Cores on-demand

El backend SHALL resolver el core de cada sistema y descargarlo desde el buildbot
público a `~/.local/share/catodo/cores/` cuando falte, cacheándolo para usos
posteriores. Los cores NO SHALL empaquetarse en los artefactos.

#### Scenario: Primer uso de un sistema

- **WHEN** se lanza un juego NES y no existe `fceumm_libretro`
- **THEN** el backend descarga el zip del buildbot, extrae la librería y la carga

#### Scenario: Core cacheado

- **WHEN** se vuelve a lanzar el mismo sistema
- **THEN** se usa el core local sin volver a descargarlo

### Requirement: Streaming de video y audio

El juego SHALL servirse como fMP4 por `GET /api/channels/arcade/stream`, con video
H.264 y audio AAC en el mismo mux, reusando el patrón de streaming del canal IPTV.

#### Scenario: Stream reproducible

- **WHEN** hay una sesión activa
- **THEN** el endpoint responde `video/mp4` y el `<video>` del kiosko reproduce el juego con audio

#### Scenario: Cambio de juego

- **WHEN** se lanza otro juego
- **THEN** la sesión anterior se detiene y se libera su core y su ffmpeg antes de iniciar la nueva

### Requirement: Input del juego

El canal SHALL aceptar comandos de input y traducirlos al estado de botones del
core, incluyendo teclado y gamepad desde el kiosko.

#### Scenario: Botón presionado

- **WHEN** llega `press` con un botón
- **THEN** el core lo ve presionado en el siguiente frame y `release` lo suelta

#### Scenario: Mapeo del gamepad

- **WHEN** el usuario usa un mando en el player embebido
- **THEN** los botones se mapean por posición al RetroPad (el A físico de Xbox
  abajo → B, el B de la derecha → A, X/Y se cruzan), el D-pad y el stick
  izquierdo mueven las direcciones, los gatillos L2/R2 y Start/Select llegan al
  core, y el HUD muestra el nombre del mando detectado

#### Scenario: Reset

- **WHEN** llega `reset`
- **THEN** el juego vuelve al inicio sin cerrar la sesión

### Requirement: Savestates

El canal SHALL permitir guardar y cargar estados por slot.

#### Scenario: Guardar y cargar

- **WHEN** se guarda en un slot y luego se carga
- **THEN** el juego retoma el estado exacto guardado

### Requirement: Upscaling configurable

El sistema SHALL permitir salida a 720p o 1080p. Para 2D SHALL escalar en GPU en
el kiosko (`nearest`, `crt`, `xbr`); para 3D SHALL usar la resolución interna del
core cuando esté disponible.

#### Scenario: 2D a 1080p

- **WHEN** `arcade_output_height` es 1080 y el juego es 2D
- **THEN** el canvas del kiosko renderiza a 1920×1080 con el shader configurado, sin blur

#### Scenario: 3D con resolución interna

- **WHEN** el core soporta resolución interna y `arcade_internal_scale` es `2x`
- **THEN** el core rasteriza a 2x y el stream conserva ese detalle
