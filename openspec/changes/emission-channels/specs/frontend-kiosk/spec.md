# Spec Delta — frontend-kiosk

## ADDED Requirements

### Requirement: Sección Emisión en Ajustes

Ajustes SHALL incluir una sección Emisión para listar, crear, editar y borrar canales de emisión con nombre, carpeta, modo (`series`/`videos`), icono, color y orden.

#### Scenario: Listar canales de emisión

- **WHEN** el operador abre Ajustes → Emisión
- **THEN** ve cada biblioteca con nombre, carpeta, modo y acciones de editar/borrar

#### Scenario: Crear un canal

- **WHEN** completa nombre, carpeta y modo y guarda
- **THEN** el canal aparece en Ajustes, Home y barra sin recargar la app

#### Scenario: Editar un canal

- **WHEN** cambia nombre, carpeta, modo, icono, color u orden
- **THEN** el canal refleja los cambios en caliente

#### Scenario: Borrar un canal

- **WHEN** borra una biblioteca desde la UI
- **THEN** el canal desaparece y, si era el actual, la UI vuelve al Home

#### Scenario: Campos inválidos o ruta inaccesible

- **WHEN** falta la carpeta o el backend rechaza la operación
- **THEN** la UI muestra el error y conserva el estado anterior

#### Scenario: Sin canales de emisión

- **WHEN** no hay bibliotecas configuradas
- **THEN** la sección muestra un estado vacío con la acción de crear el primero

### Requirement: Metadatos del canal en Home y barra

Home y la barra SHALL usar el nombre, icono y color declarados por cada canal de emisión, con fallback genérico si faltan.

#### Scenario: Icono y color personalizados

- **WHEN** un canal de emisión declara `icon` y `color`
- **THEN** su tarjeta y su pill usan esos valores

#### Scenario: Sin metadatos

- **WHEN** el canal no declara icono o color
- **THEN** se usa el fallback de medios (clapperboard) sin romper el layout

#### Scenario: Sin Anime hardcodeado

- **WHEN** no existe un canal de emisión Anime
- **THEN** Home no reserva ni muestra una tarjeta Anime
