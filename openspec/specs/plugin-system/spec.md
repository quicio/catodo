# plugin-system Specification

## Purpose
Permite instalar, gestionar y cargar canales como plugins declarativos (manifest + repo + API), de modo que agregar un canal no requiera tocar código ni rebuildear. Los plugins no ejecutan código de terceros.
## Requirements
### Requirement: Manifest de plugin
Cada plugin SHALL declarar un `manifest.json` con su identidad, versión y configuración.

#### Scenario: Manifest válido
- **WHEN** un plugin contiene un `manifest.json` con `id`, `name`, `version`, `type` e `icon`
- **THEN** el sistema lo reconoce como plugin instalable y lo expone como canal (si `type` es soportado)

#### Scenario: Manifest inválido
- **WHEN** un plugin carece de campos obligatorios o tiene un `id` duplicado
- **THEN** el plugin se rechaza y se registra un error legible en los logs sin romper el arranque

### Requirement: Tipos de plugin declarativos
El sistema SHALL soportar al menos canales declarativos de tipo `web` definidos por manifest.

#### Scenario: Canal web por manifest
- **WHEN** un manifest declara `type: web` con `url`, `user_agent` y `partition`
- **THEN** el canal se crea y el frontend lo renderiza en un `<webview>` con esos parámetros (comportamiento igual a los canales web actuales)

### Requirement: Directorio de plugins
El sistema SHALL cargar plugins desde `~/.local/share/catodo/plugins/<id>/` y SHALL sembrar los plugins bundled desde `plugins-repo/` al arrancar.

#### Scenario: Detección al arranque
- **WHEN** Cátodo inicia
- **THEN** escanea el directorio de plugins y registra todos los plugins habilitados y válidos

#### Scenario: Instalación en directorio
- **WHEN** se instala un plugin
- **THEN** se copia a `plugins/<id>/` y se habilita por defecto

#### Scenario: Id inválido
- **WHEN** `POST /api/plugins/install` recibe un id que no cumple `[a-z0-9-]+`
- **THEN** responde 400 y no toca el filesystem

### Requirement: Gestión por API
El sistema SHALL ofrecer endpoints para gestionar plugins: listar, obtener, instalar, habilitar y deshabilitar.

#### Scenario: Listar plugins
- **WHEN** se consulta `GET /api/plugins`
- **THEN** se muestra cada plugin con id, nombre, versión, estado (habilitado/deshabilitado) y origen

#### Scenario: Instalar desde repo
- **WHEN** se ejecuta `POST /api/plugins/install` con `{"id": "<id>"}`
- **THEN** se copia desde el repo configurado y se instala

#### Scenario: Habilitar / deshabilitar
- **WHEN** se ejecuta `POST /api/plugins/{id}/enable` o `/disable`
- **THEN** el plugin se marca como habilitado/deshabilitado y no se carga si está deshabilitado

### Requirement: Repositorio de plugins
El sistema SHALL cargar plugins desde un repo local con un índice JSON configurable (`plugins-repo/index.json` o `CATODO_PLUGINS_REPO`).

#### Scenario: Índice del repo
- **WHEN** se consulta el repo
- **THEN** el índice devuelve para cada plugin: `id`, `version`, `url` o path, y `bundled`

### Requirement: Sin código ni dependencias de terceros
Los plugins SHALL ser sólo declarativos. El sistema SHALL NOT ejecutar código de terceros, instalar paquetes pip ni crear un venv de plugins.

#### Scenario: Manifest con dependencies
- **WHEN** un manifest declara `dependencies`
- **THEN** el campo se ignora y no se instala nada

#### Scenario: Plugin inválido en runtime
- **WHEN** un plugin tiene un manifest roto
- **THEN** el backend lo descarta con un log y el resto de canales sigue funcionando

### Requirement: API de gestión
El backend SHALL exponer los plugins y su estado por API.

#### Scenario: Listar plugins por API
- **WHEN** se consulta `GET /api/plugins`
- **THEN** responde la lista de plugins con id, nombre, versión y estado

#### Scenario: Instalar por API
- **WHEN** se ejecuta `POST /api/plugins/install` con un `id`
- **THEN** instala el plugin desde el repo y devuelve el plugin instalado (o un error 4xx si no existe)
