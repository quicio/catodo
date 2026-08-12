## 1. Backend — ArcadeChannel y escaneo

- [x] 1.1 Agregar tipo `launcher` a `ChannelType` en `catodo/channel.py`.
- [x] 1.2 Crear `catodo/arcade.py` con `ArcadeChannel`: escaneo de `arcade_dir/<Sistema>/<Juego>/` (ROM + `boxart.png|jpg|jpeg`), agrupado por sistema, con TTL de escaneo.
- [x] 1.3 Estado del canal (`state()`): lista `systems[{name, games[]}]`, juego actual y `playing`.
- [x] 1.4 Registrar `ArcadeChannel` en `build_default_registry()` (después de las bibliotecas de media).

## 2. Backend — Lanzar emulador

- [x] 2.1 Comando `launch` con `game=<rel>`: resolver plantilla (`arcade_emulators[sistema]` → `arcade_default_emulator`), reemplazar `{rom}` y spawnear con `subprocess.Popen(…, start_new_session=True)` sin shell.
- [x] 2.2 Supervisar la salida del emulador: task asyncio que al terminar publica `game_exited` y `playing_changed: false`, y limpia el juego actual.
- [x] 2.3 Al lanzar: publicar `game_launched` y `playing_changed: true`; devolver error claro si no hay emulador configurado.

## 3. API — carátulas

- [x] 3.1 Protocol `SupportsBoxart` en `catodo/channel.py` y endpoint `GET /api/channels/{id}/boxart?path=<rel>` que sirve la imagen (404 si no existe).

## 4. Config

- [x] 4.1 Claves `arcade_dir`, `arcade_emulators` y `arcade_default_emulator` en `runtime_config.KEYS` con defaults.

## 5. Tests backend

- [x] 5.1 Tests del escaneo: agrupación por sistema, detección de ROM/boxart, juego sin carátula, directorio inexistente.
- [x] 5.2 Tests del comando `launch`: resolución de plantilla (por sistema y default), reemplazo de `{rom}`, publicación de `game_launched`/`game_exited`/`playing_changed`.
- [x] 5.3 Test del endpoint `/boxart` (200 con imagen, 404 sin ella).

## 6. Frontend — vista launcher

- [x] 6.1 Componente `ArcadeLauncher.tsx`: grilla de juegos por sistema con carátulas (placeholder si falta), navegación con flechas/enter y botón de lanzar.
- [x] 6.2 Routing en `ChannelView.tsx` para `type === "launcher"`.
- [x] 6.3 Integrar eventos `game_launched`/`game_exited` en el store (`ws.ts`) para reflejar el juego activo y volver a la grilla al salir.

## 7. Frontend — reposo y actividad

- [x] 7.1 Extender `pollPlaying` en `App.tsx` para que `state.playing` (actualizado por Arcade) cuente como actividad y no entre en screensaver mientras corre el emulador.

## 8. Verificación

- [x] 8.1 E2E: elegir un juego con emulador instalado → se abre fullscreen; al salir → vuelve al launcher; con el emulador corriendo no aparece el screensaver.
- [x] 8.2 README: documentar el canal Arcade, el layout de `~/Arcade` y las claves `arcade_dir`/`arcade_emulators`.
