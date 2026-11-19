# Design

## Context

`App.tsx` maneja hotkeys fijos (`Tab`, `F11`, `Esc`, volumen) y los webviews
reenvían F11/Escape/Tab y Alt+tecla. Los dígitos directos se retiraron porque
chocaban con formularios; no hay salto a canales > 6 sin el prefijo.

## Decisions

### 1. Prefijo + buffer numérico

`channel_jump_combo` (default `Alt+C`) abre un modo de salto. Los dígitos se
acumulan (máx. 3), se muestran en un HUD y se abre el canal con Enter o tras
1200 ms sin teclas. Se cancela con Escape.

### 2. Esquema de atajos

`shortcuts: [{ combo, action, channel? }]`. Acciones:
`channel`, `home`, `settings`, `menu`, `volume_up`, `volume_down`, `next`,
`previous`, `fullscreen`. El `combo` debe incluir Alt para que los webviews lo
reenvíen; se rechazan duplicados y teclas reservadas (Tab/Esc/F11/Enter). Los dígitos no
son atajos directos.

### 3. Motor único en App

App lee `channel_jump_combo`/`shortcuts`, los normaliza y evalúa en el keydown
global antes de los hotkeys fijos. Ejecuta acciones con `api.open`, `goHome`,
apertura del menú, eventos de Ajustes y comandos de volumen/canal.

### 4. Captura en Ajustes

Nueva pestaña Atajos con captura real de teclas. Mientras captura, un flag
global hace que App ignore el keydown; el capturador exige Alt y normaliza el
combo (`Ctrl+Alt+C`). Se guarda por `POST /api/config` y se aplica por
`config_changed`.

### 5. Reenvío desde webviews

`main.cjs` reenvía keydowns con Alt y teclas permitidas (letras, dígitos,
F1–F12) y todos los dígitos cuando el guest no está en un campo editable. El
`forwardKey` incluye los modifiers para que App reconozca Ctrl/Alt/Shift.

## Risks / Trade-offs

- **Alt+tecla puede ser un acceso de la página** → el kiosko lo intercepta;
  se documenta. Los campos editables conservan el tipeo de dígitos.
- **Combo reservado** → la captura lo rechaza.
- **Auto-open por timeout** → 1200 ms; Enter abre antes si el foco está en el
  kiosko. Desde un webview, el timeout garantiza el salto sin reenviar Enter.
