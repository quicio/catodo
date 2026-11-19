# Spec Delta — frontend-kiosk

## REMOVED Requirements

### Requirement: Channel bar

**Reason**: una barra fija que se revela con cualquier input interfiere con los controles de webviews y del player.

**Migration**: usar `Tab` para abrir el menú vertical de canales.

## ADDED Requirements

### Requirement: Channel menu

La UI SHALL ofrecer un menú vertical de canales que se abre y cierra con `Tab`, y SHALL NOT mostrarse automáticamente por movimiento de mouse, teclas o touch.

#### Scenario: Abrir con Tab

- **WHEN** el usuario presiona `Tab` en el kiosko
- **THEN** aparece el menú vertical con todos los canales y el actual marcado

#### Scenario: Cerrar sin elegir

- **WHEN** el menú está abierto y se presiona `Tab`, `Esc` o se hace click fuera
- **THEN** el menú se cierra y el canal actual no cambia

#### Scenario: Elegir un canal

- **WHEN** el usuario elige un canal con click, ↑/↓ + Enter o D-pad + A
- **THEN** el canal se abre, el menú se cierra y el OSD muestra el número nuevo

#### Scenario: No interferir con el canal

- **WHEN** el menú está cerrado
- **THEN** no hay ningún overlay de canales sobre el contenido y los inputs van al canal

#### Scenario: Legibilidad

- **WHEN** el menú está abierto
- **THEN** cada canal muestra número, icono y nombre con contraste de texto normal, no pills translúcidas diminutas
