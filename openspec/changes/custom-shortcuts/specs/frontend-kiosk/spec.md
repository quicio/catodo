# Spec Delta — frontend-kiosk

## REMOVED Requirements

### Requirement: Hotkeys

**Reason**: los dígitos `1–6` chocan con formularios y teclados numéricos dentro de los webviews (login, PIN, contraseñas).

**Migration**: usar `Tab` para el menú de canales o el prefijo `Alt+C` + número para el salto directo; `F11` y `Esc` siguen cubiertos por sus requisitos existentes.

## ADDED Requirements

### Requirement: Salto de canal por combinación y número

El kiosko SHALL permitir abrir un canal por su número usando una combinación
configurable (default `Alt+C`) seguida de uno o más dígitos.

#### Scenario: Canal de un dígito

- **WHEN** el usuario presiona `Alt+C` y luego `3`
- **THEN** el canal 3 se abre y el HUD muestra el número ingresado

#### Scenario: Canal de varios dígitos

- **WHEN** el usuario presiona `Alt+C`, `1`, `1` y espera o presiona Enter
- **THEN** se abre el canal 11 sin cambiar la UI del webview

#### Scenario: Canal inexistente

- **WHEN** el número ingresado supera la cantidad de canales
- **THEN** no se cambia de canal y el HUD se cierra

#### Scenario: Cancelar

- **WHEN** el usuario presiona Escape durante el ingreso
- **THEN** se cancela el salto y no se abre ningún canal

#### Scenario: Dígitos sin prefijo

- **WHEN** el usuario presiona un número sin haber activado el prefijo
- **THEN** no se cambia de canal y la tecla llega normalmente al canal o webview

### Requirement: Atajos personalizados

Ajustes SHALL incluir una pestaña Atajos para cambiar el prefijo del salto y
crear, editar y borrar combos personalizados.

#### Scenario: Cambiar el prefijo del salto

- **WHEN** el usuario captura una combinación nueva con Alt
- **THEN** se persiste en `channel_jump_combo` y se aplica sin reiniciar

#### Scenario: Crear un atajo de canal

- **WHEN** el usuario elige un canal y captura `Alt+P`
- **THEN** `Alt+P` abre ese canal y el atajo queda listado

#### Scenario: Atajo de menú o Ajustes

- **WHEN** el usuario asigna un combo a “menú de canales” o “Ajustes”
- **THEN** el combo abre el menú o navega al Home con Ajustes abierto

#### Scenario: Borrar un atajo

- **WHEN** el usuario borra un atajo personalizado
- **THEN** el combo deja de responder y se quita de `shortcuts`

#### Scenario: Conflicto o combo inválido

- **WHEN** el combo no incluye Alt, está duplicado o usa una tecla reservada
- **THEN** la UI muestra el error y no lo guarda

#### Scenario: Webview enfocado

- **WHEN** el foco está dentro de un webview y se presiona un atajo con Alt
- **THEN** el kiosko lo recibe y el webview no cambia su foco ni su UI
