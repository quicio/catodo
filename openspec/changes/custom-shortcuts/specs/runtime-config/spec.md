# Spec Delta — runtime-config

## ADDED Requirements

### Requirement: Claves de atajos

El runtime config SHALL aceptar y exponer `channel_jump_combo` (string) y
`shortcuts` (array de `{combo, action, channel?}`) para personalizar los atajos.

#### Scenario: Defaults

- **WHEN** no hay overrides
- **THEN** `channel_jump_combo` es `"Alt+C"` y `shortcuts` es `[]`

#### Scenario: Cambio en caliente

- **WHEN** se persisten `channel_jump_combo` o `shortcuts`
- **THEN** los clientes reciben `config_changed` con el valor nuevo

#### Scenario: Valor inválido

- **WHEN** `shortcuts` no es un array de objetos con `combo` y `action`
- **THEN** el frontend lo descarta y sigue con la lista vacía sin romper el kiosko
