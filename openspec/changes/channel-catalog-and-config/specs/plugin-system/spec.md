# Spec Delta — plugin-system

## ADDED Requirements

### Requirement: Catálogo de plugins disponibles

El sistema SHALL exponer el catálogo del repositorio separado de los plugins instalados, indicando por entrada si está instalada, habilitada y su versión disponible.

#### Scenario: Catálogo incluye no instalados

- **WHEN** `GET /api/plugins/catalog` se consulta y el índice tiene una entrada con `bundled: false`
- **THEN** la entrada aparece con `installed: false` y no se siembra en `plugins/` al arrancar

#### Scenario: Bundled se siembra solo si corresponde

- **WHEN** el índice tiene una entrada con `bundled: true` que no está instalada
- **THEN** el arranque la copia a `plugins/<id>/` y el catálogo la reporta como instalada

#### Scenario: Estado del catálogo

- **WHEN** un plugin está instalado y deshabilitado
- **THEN** el catálogo lo reporta `installed: true`, `enabled: false` y conserva la versión del manifest instalado

#### Scenario: Índice inválido no rompe el catálogo

- **WHEN** `index.json` falta o no es JSON válido
- **THEN** el catálogo responde una lista vacía y el resto de los canales sigue funcionando

### Requirement: Instalación con registro inmediato

`POST /api/plugins/install` SHALL copiar el plugin, habilitarlo y registrar su canal en el manager sin requerir un reinicio.

#### Scenario: Instalar habilita el canal

- **WHEN** se instala un manifest válido desde el catálogo
- **THEN** `GET /api/channels` incluye el canal en la misma sesión y se publica `plugins_changed`

#### Scenario: Manifest inválido no se registra

- **WHEN** se intenta instalar un plugin cuyo manifest no valida
- **THEN** responde 4xx, no registra el canal y no deja el estado como habilitado

#### Scenario: Reinstalar preserva el estado

- **WHEN** se reinstala un plugin ya instalado con una versión nueva
- **THEN** se actualizan los archivos del repo y se preservan la habilitación, el orden y la sesión del usuario

### Requirement: Desinstalación de plugins

`DELETE /api/plugins/{id}` SHALL eliminar un plugin instalado no-bundled, su estado y su canal; los plugins bundled SHALL rechazarse.

#### Scenario: Desinstalar plugin no-bundled

- **WHEN** se desinstala un plugin con origen `repo` o `local`
- **THEN** se borran `plugins/<id>/` y su entrada de estado, el canal desaparece de `/api/channels` y se publica `plugins_changed`

#### Scenario: Desinstalar el canal activo

- **WHEN** se desinstala el plugin del canal actual
- **THEN** el manager queda sin canal actual y los clientes reciben el cambio para volver al Home

#### Scenario: Bundled no se desinstala

- **WHEN** se intenta desinstalar un plugin `bundled`
- **THEN** responde 409 y el plugin sigue instalado; el operador puede deshabilitarlo

#### Scenario: Plugin inexistente

- **WHEN** se desinstala un id que no está instalado
- **THEN** responde 404 sin tocar el filesystem

### Requirement: Orden configurable de canales de plugin

El estado del plugin SHALL aceptar un override de orden entero que reemplace el `order` del manifest y se aplique al orden de canales, barra y hotkeys.

#### Scenario: Fijar orden

- **WHEN** se persiste un `order` para un plugin
- **THEN** `GET /api/channels`, la barra de canales y los hotkeys usan ese orden sin reiniciar

#### Scenario: Quitar override

- **WHEN** el `order` del plugin se borra
- **THEN** el canal vuelve al `order` del manifest

#### Scenario: Orden inválido

- **WHEN** se envía un `order` no entero
- **THEN** responde 400 y el orden anterior se conserva

#### Scenario: Orden persiste tras reiniciar

- **WHEN** el backend reinicia después de fijar un `order`
- **THEN** el orden configurado sigue vigente
