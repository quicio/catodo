## Why

Cátodo es una TV shell, pero hoy no hay forma de jugar: el usuario tiene que salir del kiosk para lanzar un emulador. Un canal Arcade convierte el TV en una máquina recreativa, siguiendo el mismo patrón de "biblioteca local configurable" que ya usan Anime/Series/Películas.

## What Changes

- Nuevo canal **Arcade** (tipo `launcher`) con una biblioteca local configurable (`arcade_dir`, default `~/Arcade`).
- Escaneo de juegos por sistema: `~/Arcade/<Sistema>/<Juego>/` con ROM (`.zip`, `.nes`, `.smc`, …) + carátula (`boxart.png`, `.jpg` o `.png`).
- Comando `launch` que abre un **emulador externo configurado** (RetroArch/MAME) a pantalla completa con la ROM; al cerrarse el emulador, el canal vuelve al launcher automáticamente.
- Vista de **grilla de juegos con carátulas** en el frontend (estilo launcher), con navegación y botón de lanzar.
- Config por `runtime_config`: `arcade_dir` y mapa `arcade_emulators` (sistema → plantilla de comando con `{rom}`), con emulador default.
- El canal respeta el comportamiento de reposo: mientras un emulador está corriendo se trata como actividad (no entra screensaver).

## Capabilities

### New Capabilities
- `arcade-launcher`: canal tipo launcher que lista una biblioteca local de juegos (por sistema), muestra carátulas y lanza un emulador externo a pantalla completa.

### Modified Capabilities
- Ninguna (no cambia requisitos de capacidades existentes).

## Impact

- **Backend**: nuevo módulo `catodo/arcade.py` con `ArcadeChannel` (escaneo por sistema, estado con lista/carátulas, comando `launch` que spawnea el emulador y supervisa su salida). Se agrega al registry en `channels/__init__.py`. Nueva entrada de tipo `launcher` en `ChannelType`.
- **Config**: claves `arcade_dir` y `arcade_emulators` en `runtime_config.KEYS`.
- **Eventos**: publica `game_launched` / `game_exited` para que el frontend muestre/oculte el estado de "jugando" y la idle (screensaver) trate la ejecución del emulador como actividad.
- **Frontend**: nuevo componente `ArcadeLauncher.tsx` (grilla con carátulas) + routing en `ChannelView.tsx` para tipo `launcher`.
- **Otros**: README (canal y claves de config), tests backend.

## Non-goals

- No emulación in-app: los juegos corren en un emulador externo del sistema.
- No descarga/scraping de ROMs ni carátulas automático.
- No mapeo de controles ni configuración de emuladores desde Cátodo (se usa la config del emulador).
- No partidas guardadas en la nube, logros ni multijugador online.
