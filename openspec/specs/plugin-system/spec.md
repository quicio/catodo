# plugin-system Specification

## Purpose
Permite instalar, gestionar y cargar canales como plugins declarativos (manifest + repo + CLI), de modo que agregar un canal no requiera tocar código ni rebuildear.
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
El sistema SHALL cargar plugins desde `~/.local/share/catodo/plugins/<id>/`.

#### Scenario: Detección al arranque
- **WHEN** Cátodo inicia
- **THEN** escanea el directorio de plugins y registra todos los plugins habilitados y válidos

#### Scenario: Instalación en directorio
- **WHEN** se instala un plugin
- **THEN** se copia a `plugins/<id>/` y se habilita por defecto

### Requirement: Gestión por CLI
El sistema SHALL ofrecer un CLI `catodo plugin` para gestionar plugins.

#### Scenario: Listar plugins
- **WHEN** se ejecuta `catodo plugin list`
- **THEN** se muestra cada plugin con id, nombre, versión, estado (habilitado/deshabilitado) y origen

#### Scenario: Instalar desde repo
- **WHEN** se ejecuta `catodo plugin install <id>`
- **THEN** se descarga desde el repo configurado, se verifica el checksum y se instala

#### Scenario: Habilitar / deshabilitar
- **WHEN** se ejecuta `catodo plugin enable <id>` o `disable <id>`
- **THEN** el plugin se marca como habilitado/deshabilitado y no se carga si está deshabilitado

#### Scenario: Remover
- **WHEN** se ejecuta `catodo plugin remove <id>`
- **THEN** el plugin se deshabilita y su directorio se elimina

### Requirement: Repositorio de plugins
El sistema SHALL poder instalar plugins desde un índice JSON remoto configurable.

#### Scenario: Índice del repo
- **WHEN** se consulta el repo
- **THEN** el índice devuelve para cada plugin: `id`, `version`, `url` de descarga y `checksum`

#### Scenario: Verificación de integridad
- **WHEN** se descarga un plugin del repo
- **THEN** se verifica el checksum declarado; si no coincide, la instalación se aborta

#### Scenario: Compatibilidad de versión
- **WHEN** un plugin declara una versión de Cátodo requerida incompatible con la instalada
- **THEN** la instalación se rechaza con un mensaje de versión mínima/máxima

### Requirement: Dependencias externas (provisioning)
El sistema SHALL instalar las dependencias declaradas por los plugins en un entorno aislado compartido.

#### Scenario: Instalar dependencias
- **WHEN** un plugin declara `dependencies` (paquetes pip) y se instala o habilita
- **THEN** dichos paquetes se instalan en el venv de plugins del data dir

#### Scenario: Arranque en entorno limpio
- **WHEN** Cátodo arranca en un entorno sin las dependencias instaladas
- **THEN** se detectan las faltantes y se instalan automáticamente desde el venv de plugins, sin tocar el venv principal

### Requirement: API de gestión
El backend SHALL exponer los plugins y su estado por API.

#### Scenario: Listar plugins por API
- **WHEN** se consulta `GET /api/plugins`
- **THEN** responde la lista de plugins con id, nombre, versión y estado

#### Scenario: Instalar por API
- **WHEN** se ejecuta `POST /api/plugins/install` con un `id`
- **THEN** instala el plugin desde el repo y devuelve el plugin instalado (o un error 4xx si falla la verificación)

