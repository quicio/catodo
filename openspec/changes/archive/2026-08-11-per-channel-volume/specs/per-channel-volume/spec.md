## Purpose

Hace que cada canal recuerde su propio volumen y, opcionalmente, salga por un dispositivo de audio distinto, como en una TV real.

## ADDED Requirements

### Requirement: Volumen por canal
El sistema SHALL recordar un nivel de volumen por canal y aplicarlo al cambiar de canal.

#### Scenario: Recordar el volumen
- **WHEN** el usuario cambia el volumen estando en un canal
- **THEN** ese nivel se guarda para ese canal y no afecta a los demás

#### Scenario: Cambio de canal
- **WHEN** se abre otro canal
- **THEN** se aplica el volumen guardado de ese canal (o el default si no tiene)

#### Scenario: Volver al canal anterior
- **WHEN** se vuelve a un canal con volumen guardado
- **THEN** se restaura su volumen anterior

#### Scenario: Desactivado
- **WHEN** `per_channel_volume_enabled` está deshabilitado
- **THEN** el volumen es global como antes

### Requirement: Persistencia
El sistema SHALL persistir los volúmenes por canal.

#### Scenario: Reinicio
- **WHEN** el backend se reinicia
- **THEN** los volúmenes guardados se mantienen

### Requirement: Routing de audio por canal
El sistema SHALL poder mover el audio del canal a un sink de PulseAudio configurado.

#### Scenario: Sink configurado
- **WHEN** `channel_audio_sinks` mapea el canal activo a un sink existente
- **THEN** el stream del sistema se mueve a ese sink al abrir el canal

#### Scenario: Sin PulseAudio o sink inexistente
- **WHEN** no hay PulseAudio o el sink no existe
- **THEN** se ignora el routing sin error y el canal suena por el sink por defecto
