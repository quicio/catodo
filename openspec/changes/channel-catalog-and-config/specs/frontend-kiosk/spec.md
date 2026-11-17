# Spec Delta — frontend-kiosk

## ADDED Requirements

### Requirement: Pestaña Canales en Ajustes

El panel de Ajustes SHALL incluir una pestaña "Canales" con los canales instalados y el catálogo de canales disponibles.

#### Scenario: Lista de instalados

- **WHEN** el usuario abre la pestaña Canales
- **THEN** ve cada canal instalado con nombre, origen, versión y estado (habilitado/deshabilitado)

#### Scenario: Acciones de plugin

- **WHEN** el canal es de plugin
- **THEN** la fila ofrece habilitar/deshabilitar, desinstalar (si no es bundled) y editar su URL cuando es web

#### Scenario: Catálogo disponible

- **WHEN** el repo tiene canales no instalados
- **THEN** la pestaña los lista con un botón Instalar y, al instalarlos, pasan a la lista de instalados sin recargar la app

#### Scenario: Canales nativos

- **WHEN** el canal es nativo (Spotify, Anime, Arcade, IPTV)
- **THEN** se muestra sin acciones de instalar/desinstalar y expone sus ajustes aplicables, como la playlist IPTV

#### Scenario: Aviso de DRM

- **WHEN** un canal declara que requiere Widevine
- **THEN** la UI muestra un aviso de que la reproducción depende del soporte DRM del runtime y del proveedor

### Requirement: Orden de canales desde la UI

La pestaña Canales SHALL permitir reordenar los canales y reflejar el nuevo orden en la barra y los hotkeys.

#### Scenario: Reordenar

- **WHEN** el usuario cambia el orden de un canal
- **THEN** se persiste el override y la barra de canales y los hotkeys se actualizan sin reiniciar

#### Scenario: Restaurar orden del manifest

- **WHEN** el usuario quita el override de orden
- **THEN** el canal vuelve a la posición declarada en su manifest

### Requirement: Refresco por eventos de plugins

La UI SHALL reconciliar canales y catálogo al recibir eventos de cambio de plugins o de estado, sin polling ni recarga manual.

#### Scenario: Cambio desde otro cliente

- **WHEN** otro cliente instala, habilita, deshabilita o desinstala un canal
- **THEN** la pestaña Canales, el Home y la barra reflejan el cambio por evento

#### Scenario: Error de acción

- **WHEN** una acción de instalar, desinstalar o cambiar URL falla
- **THEN** la UI muestra el mensaje del backend y conserva el estado anterior

### Requirement: Hotkeys acordes al orden vigente

El kiosk SHALL mapear los hotkeys `1`–`6` a los seis primeros canales del orden vigente y SHALL NOT abrir canales inexistentes.

#### Scenario: Canal reordenado

- **WHEN** un canal pasa a la primera posición
- **THEN** el hotkey `1` abre ese canal

#### Scenario: Menos de seis canales

- **WHEN** hay menos de seis canales disponibles
- **THEN** los hotkeys sin canal asociado no tienen efecto
