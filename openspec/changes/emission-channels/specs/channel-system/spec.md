# Spec Delta — channel-system

## MODIFIED Requirements

### Requirement: Channel registration

El sistema SHALL registrar canales desde una lista mínima de built-ins, los plugins instalados y habilitados, y las bibliotecas de emisión configuradas. Plugins y canales de emisión SHALL NOT requerir cambios de código ni rebuild.

#### Scenario: Adding a new channel

- **WHEN** se instala un plugin web o se crea una biblioteca de emisión válida
- **THEN** el canal queda disponible vía `GET /api/channels` sin cambios en otros módulos

#### Scenario: Built-in channels

- **WHEN** el sistema arranca sin plugins instalados
- **THEN** los built-ins mínimos (Spotify, Arcade, IPTV, Screen Cast) están registrados; YouTube requiere su plugin bundled y TV/Anime no existen por defecto

#### Scenario: Emission channel from config

- **WHEN** existe una entrada válida en la configuración de bibliotecas
- **THEN** su canal de emisión se registra con nombre, ruta, modo, icono, color y orden declarados

#### Scenario: Invalid plugin does not block startup

- **WHEN** un plugin tiene un manifest inválido o un id duplicado
- **THEN** se omite, se loguea, y el resto de canales sigue cargando

#### Scenario: Disabled plugin

- **WHEN** un plugin está deshabilitado
- **THEN** su canal no se registra ni aparece en `GET /api/channels`

### Requirement: Reference channel plugins

El sistema SHALL incluir los canales de referencia Spotify, YouTube (plugin bundled), Arcade, IPTV y Screen Cast, y SHALL permitir canales de emisión configurables sin hardcodear Anime ni TV.

#### Scenario: Spotify channel

- **WHEN** el canal Spotify se abre
- **THEN** envía Play por MPRIS/DBus y expone now-playing con metadata y posición

#### Scenario: YouTube channel

- **WHEN** el plugin YouTube está instalado y el canal se abre
- **THEN** renderiza un `<webview>` apuntando a una URL configurable (default `https://www.youtube.com/tv`) con user-agent Android TV

#### Scenario: Arcade and IPTV channels

- **WHEN** el sistema arranca con sus directorios/playlists configurados
- **THEN** Arcade e IPTV están disponibles como canales nativos

#### Scenario: Screen cast channel

- **WHEN** el canal Screen Cast se abre
- **THEN** queda disponible para recibir una sesión de casting

#### Scenario: Anime channel

- **WHEN** no existe una biblioteca de emisión para Anime
- **THEN** no se registra un canal Anime por defecto; el operador lo crea desde Ajustes si lo necesita

#### Scenario: TV channel

- **WHEN** el plugin TV no está instalado
- **THEN** no se registra un canal TV por defecto; se instala desde el catálogo

#### Scenario: Emission channel instead of Anime

- **WHEN** el operador quiere ver una biblioteca de series o videos
- **THEN** crea un canal de emisión con nombre y carpeta propios; no hay un canal Anime implícito
