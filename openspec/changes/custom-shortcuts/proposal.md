# Proposal

## Why

Hoy sólo se puede saltar a los primeros seis canales con `1–6`; con más canales
no hay una forma rápida de ir al 11 o al 12. Además, los atajos están fijados en
código y no se pueden adaptar a un remote, teclado o costumbre del operador.

## What Changes

- **Salto de canal configurable**: una combinación (default `Alt+C`) seguida de
  un número abre el canal N; acepta varios dígitos (`Alt+C`, `1`, `1` → canal 11)
  y abre al presionar Enter o tras una pausa corta.
- **Pestaña Atajos** en Ajustes para cambiar el prefijo del salto y crear/borrar
  combos personalizados para acciones: abrir un canal, Home, menú de canales,
  Ajustes, volumen, canal siguiente/anterior y pantalla completa.
- Los combos personalizados se guardan en runtime config y se aplican en caliente.
- Los webviews reenvían las combinaciones que incluyan Alt y los dígitos al
  kiosko, sin cambiar el foco de la página.

## Capabilities

### Modified Capabilities

- `frontend-kiosk`: salto de canal por combinación + número y motor de atajos
  personalizados, con UI de captura en Ajustes.
- `runtime-config`: nuevas claves `channel_jump_combo` y `shortcuts`.

## Impact

- `frontend/src/App.tsx`, `frontend/electron/main.cjs`,
  `frontend/src/components/AppearanceSettings.tsx` + nueva pestaña de atajos.
- `rust/crates/catodo-server/src/config.rs` (claves/defaults).
- README/HANDOFF y specs.

## Non-goals

- Reasignar los atajos fijos `Tab`, `Esc`, `F11`, `1–6`, volumen o las flechas.
- Macros, secuencias de más de una tecla o atajos globales del sistema operativo.
