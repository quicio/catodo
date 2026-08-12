## Purpose

Permite controlar Cátodo por voz: recibe texto transcrito, lo interpreta (canal, volumen, navegación) y ejecuta la acción, mostrando feedback de lo que entendió.

## ADDED Requirements

### Requirement: Comandos de voz
El sistema SHALL interpretar texto transcrito y ejecutar acciones de Cátodo.

#### Scenario: Abrir canal por nombre
- **WHEN** se envía texto que contiene el nombre de un canal (ej. "poné YouTube")
- **THEN** se abre ese canal y se publica `voice_command` con lo reconocido

#### Scenario: Abrir canal por número
- **WHEN** se envía "canal 2" (o "canal dos")
- **THEN** se abre el canal en esa posición de la barra

#### Scenario: Navegación y volumen
- **WHEN** se envía "siguiente", "atrás", "sube el volumen", "baja el volumen", "pausa", "play" o "home"
- **THEN** se ejecuta la acción correspondiente y se publica el feedback

#### Scenario: Sin reconocer
- **WHEN** el texto no coincide con ninguna intención
- **THEN** se publica `voice_command` con reconocido falso y no se ejecuta nada

### Requirement: Feedback en el kiosk
El sistema SHALL mostrar un overlay breve con el comando interpretado.

#### Scenario: Overlay de voz
- **WHEN** se publica `voice_command`
- **THEN** el kiosk muestra el texto reconocido unos segundos y lo oculta
