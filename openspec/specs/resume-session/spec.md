# resume-session Specification

## Purpose
Retoma el último canal activo al encender el kiosk, para que Cátodo se comporte como una TV que vuelve a donde la dejaste.
## Requirements
### Requirement: Retomar el último canal
El sistema SHALL abrir el último canal activo al arrancar si está habilitado.

#### Scenario: Último canal disponible
- **WHEN** el kiosk arranca con `resume_last_channel` habilitado y existe un `last_channel_id` válido
- **THEN** se abre ese canal automáticamente en lugar de mostrar el Home

#### Scenario: Canal ya no existe
- **WHEN** el `last_channel_id` guardado ya no está en la lista de canales
- **THEN** el kiosk muestra el Home sin error

#### Scenario: Desactivado
- **WHEN** `resume_last_channel` está deshabilitado
- **THEN** el kiosk arranca siempre en el Home

### Requirement: Configuración
El sistema SHALL permitir configurar el comportamiento de resume.

#### Scenario: Config persistente
- **WHEN** se guarda `resume_last_channel` vía config/API
- **THEN** el comportamiento de arranque lo respeta

