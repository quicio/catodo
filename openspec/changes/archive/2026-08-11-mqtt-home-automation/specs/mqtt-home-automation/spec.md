## Purpose

Conecta Cátodo con la domótica vía MQTT (incluyendo Zigbee a través de zigbee2mqtt): recibe comandos de control y publica el estado actual para automatizaciones.

## ADDED Requirements

### Requirement: Conexión a broker MQTT
El sistema SHALL conectarse a un broker MQTT configurado y no fallar si no está configurado.

#### Scenario: Broker configurado
- **WHEN** `mqtt_host` está configurado
- **THEN** el backend se conecta al broker con las credenciales dadas

#### Scenario: Sin broker
- **WHEN** no hay `mqtt_host`
- **THEN** el bridge no arranca y el sistema funciona normal

### Requirement: Comandos entrantes
El sistema SHALL aceptar comandos publicados en `catodo/cmd/#`.

#### Scenario: Abrir canal
- **WHEN** se publica `catodo/cmd/channel` con un id o nombre de canal
- **THEN** se abre ese canal

#### Scenario: Navegación y volumen
- **WHEN** se publica `next`, `prev`, `volume` (con nivel o +/-, `play`, `pause` o `home`)
- **THEN** se ejecuta la acción correspondiente

#### Scenario: Comando desconocido
- **WHEN** el tópico/mensaje no se reconoce
- **THEN** se ignora sin error

### Requirement: Estado saliente
El sistema SHALL publicar su estado actual en `catodo/state`.

#### Scenario: Publicación de estado
- **WHEN** cambia el canal, el volumen o la reproducción
- **THEN** se publica `catodo/state` con `{channel, volume, playing}`

#### Scenario: Estado al conectar
- **WHEN** el bridge se conecta al broker
- **THEN** publica el estado actual (para que las automatizaciones sincronicen)
