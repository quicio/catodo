# idle-screensaver Specification

## Purpose

Le da a Cátodo comportamiento de TV real: detectar inactividad, mostrar una pantalla de reposo con wallpapers/reloj, opcionalmente apagar la pantalla, y volver al canal anterior ante cualquier actividad.

## Requirements

### Requirement: Detección de inactividad
El backend SHALL rastrear la última actividad y entrar en estados de reposo configurables.

#### Scenario: Entrar en screensaver
- **WHEN** no hay actividad durante `idle_screensaver_seconds`
- **THEN** se publica el evento `idle_screensaver_on`

#### Scenario: Entrar en sleep
- **WHEN** `idle_sleep_seconds` está configurado (> 0) y no hay actividad durante ese tiempo tras el screensaver
- **THEN** se publica el evento `idle_sleep_on`

#### Scenario: Reactivar
- **WHEN** hay actividad estando en screensaver o sleep
- **THEN** se publica `idle_off` y se reinicia el contador

#### Scenario: Sleep desactivado
- **WHEN** `idle_sleep_seconds` es 0
- **THEN** nunca se entra en sleep (solo screensaver)

### Requirement: Fuentes de actividad
Toda interacción del usuario SHALL reiniciar el contador de inactividad.

#### Scenario: Llamadas a la API
- **WHEN** se recibe cualquier petición a `/api/*` (excepto health y el propio activity)
- **THEN** el contador se reinicia

#### Scenario: Aviso de actividad local
- **WHEN** el frontend llama a `POST /api/activity` (input local del kiosk: mouse/teclado/touch)
- **THEN** el contador se reinicia

#### Scenario: Reproducción en curso
- **WHEN** hay un video/audio reproduciéndose (webview del canal web, video local o Spotify en Playing)
- **THEN** el contador se reinicia mientras dura la reproducción, para que el screensaver no se active viendo contenido

### Requirement: Pantalla de reposo en el frontend
El frontend SHALL mostrar un overlay de reposo a pantalla completa al entrar en screensaver y ocultarlo al reactivar.

#### Scenario: Mostrar reposo
- **WHEN** llega `idle_screensaver_on`
- **THEN** se muestra un overlay con wallpapers y reloj, y el canal actual queda en pausa visual debajo

#### Scenario: Ocultar por evento
- **WHEN** llega `idle_off`
- **THEN** el overlay se oculta y se vuelve al canal anterior

#### Scenario: Ocultar por input local
- **WHEN** hay input local (mousemove/mousedown/keydown/touchstart) durante el reposo
- **THEN** el overlay se oculta al instante y el frontend avisa al backend por `/api/activity`

### Requirement: Apagado de pantalla
El frontend SHALL oscurecer la pantalla al entrar en sleep y restaurarla al reactivar.

#### Scenario: Pantalla apagada
- **WHEN** llega `idle_sleep_on`
- **THEN** el overlay queda completamente negro (pantalla "apagada")

#### Scenario: Restaurar pantalla
- **WHEN** hay actividad estando en sleep
- **THEN** la pantalla se restaura y el overlay de reposo desaparece

### Requirement: Configuración de tiempos
El sistema SHALL permitir configurar los tiempos de reposo.

#### Scenario: Config persistente
- **WHEN** se guardan `idle_screensaver_seconds` y `idle_sleep_seconds` vía config/API
- **THEN** se persisten en el runtime config y los timers los respetan
