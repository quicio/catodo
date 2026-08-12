# arcade-launcher Specification

## Purpose
Permite usar Cátodo como máquina recreativa: un canal que lista una biblioteca local de juegos por sistema y lanza cada uno en un emulador externo a pantalla completa, volviendo al launcher al cerrar el emulador.
## Requirements
### Requirement: Canal launcher Arcade
El sistema SHALL exponer un canal tipo `launcher` que presenta una biblioteca local de juegos como una grilla navegable.

#### Scenario: El canal aparece en la lista de canales
- **WHEN** el sistema arranca con `arcade_dir` accesible
- **THEN** el canal Arcade aparece en la lista de canales con su nombre, ícono y tipo `launcher`

#### Scenario: Estado del canal
- **WHEN** se consulta el estado del canal
- **THEN** se devuelven los juegos agrupados por sistema, el sistema/género visible, la carátula de cada juego y el juego actualmente en reproducción (si lo hay)

### Requirement: Biblioteca local por sistemas
El sistema SHALL escanear `arcade_dir` (default `~/Arcade`) interpretando cada subdirectorio como un sistema y cada subdirectorio de ese sistema como un juego.

#### Scenario: Escaneo de juegos por sistema
- **WHEN** `~/Arcade/<Sistema>/<Juego>/` contiene un archivo de ROM y una imagen (`boxart.png`, `boxart.jpg` o `boxart.jpeg`)
- **THEN** el juego aparece en la grilla bajo su sistema con su carátula y su nombre

#### Scenario: Juego sin carátula
- **WHEN** un juego no tiene imagen de carátula
- **THEN** se muestra con una carátula placeholder y su nombre, sin romper la grilla

#### Scenario: Directorio vacío o inexistente
- **WHEN** `arcade_dir` no existe o no contiene juegos
- **THEN** el canal muestra una lista vacía con un mensaje y no falla

### Requirement: Lanzar juego con emulador externo
El sistema SHALL lanzar el juego seleccionado en un emulador externo a pantalla completa y volver al launcher al cerrarlo.

#### Scenario: Lanzar juego
- **WHEN** el usuario elige un juego y se envía el comando `launch`
- **THEN** se ejecuta el comando del emulador configurado para ese sistema (reemplazando `{rom}` por la ruta de la ROM), a pantalla completa, y se publica el evento `game_launched`

#### Scenario: Emulador por sistema
- **WHEN** el sistema del juego tiene un emulador mapeado en `arcade_emulators`
- **THEN** se usa ese comando para lanzar el juego

#### Scenario: Emulador default
- **WHEN** el sistema del juego no tiene mapeo pero existe un emulador default
- **THEN** se usa el emulador default

#### Scenario: Canal jugando
- **WHEN** un emulador está corriendo
- **THEN** el estado del canal lo refleja (juego actual + marcador de reproducción) y la UI del launcher muestra el juego activo

#### Scenario: Salida del emulador
- **WHEN** el emulador termina
- **THEN** se publica `game_exited`, el canal deja de estar "jugando" y el launcher queda listo para elegir otro juego

### Requirement: Configuración del canal
El sistema SHALL permitir configurar el directorio de juegos y los emuladores.

#### Scenario: Config persistente
- **WHEN** se guardan `arcade_dir` y `arcade_emulators` vía config/API
- **THEN** se persisten en el runtime config y el canal los respeta en el próximo escaneo

### Requirement: Reposo con emulador activo
El sistema SHALL tratar la ejecución de un emulador como actividad, para que el screensaver no se active mientras se juega.

#### Scenario: Juego en ejecución
- **WHEN** un emulador está corriendo
- **THEN** el sistema se mantiene en estado activo y no entra en screensaver

