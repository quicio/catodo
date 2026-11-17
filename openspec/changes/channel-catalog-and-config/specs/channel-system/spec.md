# Spec Delta — channel-system

## ADDED Requirements

### Requirement: Registro dinámico de canales

Los cambios de estado de un plugin SHALL reflejarse en `GET /api/channels` sin reiniciar el backend y SHALL notificar a los clientes conectados.

#### Scenario: Habilitar un canal

- **WHEN** se habilita un plugin instalado
- **THEN** su canal aparece en `/api/channels` en la misma sesión y se publica un evento de cambio

#### Scenario: Deshabilitar un canal

- **WHEN** se deshabilita un plugin instalado
- **THEN** su canal desaparece de `/api/channels` y de la barra de canales

#### Scenario: Deshabilitar el canal actual

- **WHEN** se deshabilita o desinstala el plugin del canal actual
- **THEN** el estado reporta `current_channel_id: null` y los clientes vuelven al Home

#### Scenario: Hotkeys con más de seis canales

- **WHEN** hay más de seis canales disponibles
- **THEN** los hotkeys siguen cubriendo los seis primeros del orden vigente y el resto es accesible por barra, Home o gamepad

### Requirement: URL configurada por canal

Cada canal web SHALL resolver su URL desde un override por canal en runtime, exponiendo la URL efectiva en su estado.

#### Scenario: URL por defecto

- **WHEN** el canal no tiene override
- **THEN** su estado reporta la URL del manifest como `configured_url`

#### Scenario: Override inmediato

- **WHEN** se persiste una URL para el canal
- **THEN** la siguiente lectura de estado y apertura del canal usan la URL nueva sin reiniciar

#### Scenario: URL inválida

- **WHEN** se intenta persistir una URL que no es `http`/`https` absoluta
- **THEN** se rechaza y el canal conserva la URL anterior

### Requirement: Canales nativos en la configuración

La vista de configuración SHALL incluir los canales nativos (Spotify, Anime, Arcade, IPTV) junto a los de plugin, sin ofrecer instalar ni desinstalar para ellos.

#### Scenario: Nativo listado

- **WHEN** se consulta la configuración de canales
- **THEN** los canales nativos aparecen marcados como nativos y sin acciones de instalación

#### Scenario: Ajuste aplicable a nativo

- **WHEN** el canal nativo expone un ajuste configurable, como la playlist de IPTV
- **THEN** el ajuste se edita desde la misma vista y se persiste como clave local-only

#### Scenario: Nativo no se deshabilita por catálogo

- **WHEN** el operador intenta desinstalar un canal nativo
- **THEN** la acción no está disponible y el canal sigue registrado
