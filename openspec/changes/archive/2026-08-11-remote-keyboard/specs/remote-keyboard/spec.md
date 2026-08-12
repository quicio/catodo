## Purpose

Permite escribir texto y buscar desde el remote del celular de forma confiable, inyectándolo directo al webview activo del kiosk Electron.

## ADDED Requirements

### Requirement: Inyección de texto al kiosk
El sistema SHALL aceptar texto del remote e inyectarlo en el webview activo.

#### Scenario: Escribir en el canal web
- **WHEN** el remote envía `POST /api/type` con un texto y hay un webview activo
- **THEN** el texto se inyecta en el campo enfocado del webview (evento WS `type_text` → Electron `insertText`)

#### Scenario: Teclas de control
- **WHEN** el texto incluye `{ENTER}` o `{BACKSPACE}`
- **THEN** se envían las teclas correspondientes (buscar/confirmar, borrar)

#### Scenario: Sin webview activo
- **WHEN** no hay webview activo
- **THEN** el sistema cae al fallback `/api/mouse/type` (xdotool) o descarta sin error

### Requirement: Búsqueda desde el remote
El sistema SHALL permitir buscar desde el remote usando el canal web enfocado.

#### Scenario: Buscar en el canal activo
- **WHEN** el usuario escribe un término en el campo "Buscar" del remote
- **THEN** el webview activo recibe el texto y Enter para ejecutar la búsqueda del canal
