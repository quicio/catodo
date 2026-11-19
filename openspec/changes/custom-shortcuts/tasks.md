# Tasks

- [x] 1.1 Agregar `channel_jump_combo` y `shortcuts` a `config.rs` con defaults y verificar `cargo test -p catodo-server`.
- [x] 1.2 Implementar en App el modo salto (combo + dígitos + timeout/Enter/Escape) y el HUD; verificar los canales 3, 11 y un número inválido.
- [x] 1.3 Implementar el motor de `shortcuts` y ejecutar cada acción; verificar canal, Home, menú, Ajustes, volumen, next/prev y fullscreen.
- [x] 1.4 Reenviar desde `main.cjs` Alt+tecla y dígitos con modifiers; verificar que Tab/atajos no muevan el foco del webview.
- [x] 1.5 Crear la pestaña Atajos con captura, alta/baja, duplicados/reservados y persistencia; verificar en `./run-dev.sh`.
- [x] 1.6 Quitar los hotkeys numéricos directos y el reenvío de dígitos fuera del modo salto; verificar que un login webview pueda tipear números.
- [x] 1.7 Actualizar README/HANDOFF y correr typecheck, build y `./scripts/check.sh`.
