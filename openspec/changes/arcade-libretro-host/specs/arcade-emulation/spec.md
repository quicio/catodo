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

#### Scenario: Resolución cambiante y pitch con padding

- **WHEN** el core reporta filas más largas que el ancho visible (pitch con padding) o cambia entre modo hi-res y normal (ej. 512x224 → 256x224)
- **THEN** el host compacta cada fila y reescala al tamaño base declarado por el core, y el stream mantiene un tamaño estable sin corromper la imagen

#### Scenario: Reproducción estable en vivo

- **WHEN** el player reproduce el stream durante una sesión larga
- **THEN** video y audio van por el mismo `MediaSource` (MSE), los chunks se
  agregan sin descartarse cuando el `SourceBuffer` está ocupado, el buffer se
  acota detrás del playhead y la reproducción no se reinicia ni se desincroniza

#### Scenario: Aspecto de pantalla

- **WHEN** el core declara una relación de aspecto de pantalla (ej. 4:3)
- **THEN** el player respeta esa relación y letterboxea dentro del área disponible en vez de estirar la imagen a todo el ancho

#### Scenario: Frames crudos para el player

- **WHEN** el player embebido se abre con un juego corriendo
- **THEN** el video se entrega como frames RGBA por WebSocket
  (`/api/channels/{id}/frames`) y se dibuja directo en WebGL, sin encoder
  H.264/MSE, manteniendo la latencia en 1-2 frames

#### Scenario: Audio PCM sincronizado

- **WHEN** el player reproduce el juego embebido
- **THEN** el audio viaja como PCM s16le por WebSocket
  (`/api/channels/{id}/audio-frames`) y se reproduce con WebAudio con un
  colchón chico, manteniendo la sincronía con los frames crudos

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

### Requirement: HUD no intrusivo del player

El player embebido SHALL ocultar automáticamente su HUD (datos de core/fps/mando y botones de sesión) tras unos segundos sin interacción y SHALL mostrarlo al mover el mouse o tocar la pantalla.

#### Scenario: Auto-ocultar el HUD

- **WHEN** el player lleva unos segundos abierto o sin movimiento de mouse
- **THEN** el HUD se desvanece y el juego ocupa toda el área del player

#### Scenario: Reaparecer el HUD

- **WHEN** el usuario mueve el mouse o toca la pantalla
- **THEN** el HUD vuelve a mostrarse y reinicia su temporizador de auto-ocultado

#### Scenario: Input del juego no revela el HUD

- **WHEN** el usuario presiona teclas o botones del mando durante el juego
- **THEN** esos inputs van al core y no fuerzan la aparición del HUD

### Requirement: Marco de monitor retro configurable

El player embebido SHALL envolver el juego en un marco de monitor CRT cuando `arcade_monitor_frame` sea `true`, y SHALL mostrarlo a pantalla completa cuando sea `false`.

#### Scenario: Monitor activado

- **WHEN** `arcade_monitor_frame` es `true` y el player embebido se abre
- **THEN** el player se ve como un televisor CRT (carcasa, pantalla levemente curvada, parlante, LED y perillas), la pantalla muestra el juego con un borde negro fino y el HUD queda sobre el tubo

#### Scenario: Monitor desactivado

- **WHEN** `arcade_monitor_frame` es `false`
- **THEN** el juego ocupa todo el área del player sin carcasa

#### Scenario: Cambio en caliente

- **WHEN** se cambia `arcade_monitor_frame` mientras hay una partida embebida
- **THEN** el marco aparece o desaparece sin reiniciar el juego

### Requirement: Ajustes de monitor en vivo

El player embebido SHALL exponer un panel de ajustes del monitor (encendido, curvatura y borde negro) accesible con el botón TV o la tecla F1, y SHALL persistir `arcade_monitor_frame`, `arcade_monitor_curvature`, `arcade_monitor_black_border` y `arcade_monitor_rounded`.

#### Scenario: Ajustar curvatura en vivo

- **WHEN** el usuario mueve el control de curvatura con una partida abierta
- **THEN** el tubo cambia su curvatura inmediatamente, sin reiniciar el juego

#### Scenario: Ajustar borde negro en vivo

- **WHEN** el usuario mueve el control de borde negro
- **THEN** el grosor del borde alrededor de la pantalla cambia inmediatamente

#### Scenario: Persistencia

- **WHEN** se ajustan los parámetros y se cierra el panel
- **THEN** los valores quedan guardados en el runtime config y se aplican en la próxima partida

#### Scenario: Input del juego durante el ajuste

- **WHEN** el panel de ajustes está abierto
- **THEN** el teclado y el mando no envían inputs al core hasta cerrarlo

### Requirement: Frame de imagen personalizado

El player SHALL poder usar una imagen PNG/JPEG/WebP con la pantalla transparente como marco del juego, subible en runtime y con la zona de pantalla calibrable.

#### Scenario: Frame incluido

- **WHEN** `arcade_monitor_mode` es `image` y no hay una imagen subida
- **THEN** se usa el frame vintage incluido y el juego se ve a través de su pantalla transparente

#### Scenario: Subir un frame

- **WHEN** el operador sube una imagen PNG/JPEG/WebP desde Ajustes → Arcade o desde el panel TV
- **THEN** la imagen se guarda en el data dir, se sirve por `/api/arcade/frame` y se activa el modo imagen

#### Scenario: Subida local-only

- **WHEN** un origen externo intenta subir o borrar el frame
- **THEN** responde 403 y la imagen no cambia

#### Scenario: Calibrar la pantalla

- **WHEN** se ajustan izquierda/arriba/ancho/alto de la pantalla
- **THEN** el juego se reposiciona sobre el agujero del frame en vivo y los valores persisten

#### Scenario: Quitar el frame subido

- **WHEN** se borra la imagen subida
- **THEN** se vuelve al frame CSS y al frame vintage incluido como fallback

#### Scenario: Borde curvo del video

- **WHEN** la curvatura es mayor que cero
- **THEN** el contenido se deforma en barril y el contorno visible del video se curva, dejando un pequeño margen negro alrededor
