# Cátodo

A multimedia shell for Linux, inspired by old CRT TVs. Turn any monitor into a "smart TV" you control via HTTP.

## Channels

- **Ch1 — Spotify** — Desktop Spotify controlled via MPRIS, with now-playing display and synced lyrics.
- **Ch2 — YouTube** — YouTube TV interface in an in-app webview (Android TV user agent, custom URL via backend config).
- **Ch3 — Anime** — Local video player scanning `~/Anime`; grouped by series, with CRT/VHS/4K effects. Es una **biblioteca local configurable** (ver [Bibliotecas de medios](#bibliotecas-de-medios)).
- **Ch4 — TV** — Movistar TV (or any provider URL, configurable) in an in-app webview with Widevine DRM.
- **Ch5 — Crunchyroll** — crunchyroll.com in an in-app webview (Android TV user agent).

Los canales `web` (YouTube, TV, Crunchyroll) son **plugins declarativos**: se definen
con un `manifest.json` y se gestionan con el CLI (ver [Plugins](#plugins)).

Hotkeys `1`–`5` switch channels (`6` is reserved). The channel bar auto-hides after 8s of inactivity.

## Architecture

```
backend/    FastAPI (serves API + static frontend + wallpaper assets on :8765)
frontend/   Electron app (Chromium) loading http://127.0.0.1:8765
```

- **Backend**: FastAPI handles all channels + state + wallpaper downloads + lyrics. Serves the built frontend as static files at `/`. User data lives at `~/.local/share/catodo/`.
- **Frontend**: React + Vite, built into static HTML/JS, served by the backend.
- **Shell**: Electron opens a frameless, fullscreen, kiosk window pointing at the backend. In-app `<webview>` tags handle YouTube and TV.

**DRM note**: The TV channel (Movistar) requires Widevine. The dev `run-dev.sh` launcher uses Electron castLabs (AUR: `electron-castlab-bin`). The packaged AppImage uses stock Electron which does **not** include Widevine — install castLabs separately for TV playback.

## Quickstart

```bash
# 1. Backend
cd ~/projects/catodo/backend
uv sync
uv run python -m catodo          # serves http://127.0.0.1:8765

# 2. Electron app
cd ~/projects/catodo/frontend
npm install
npm run electron:build:linux    # builds .AppImage + .deb into release/
./release/catodo-frontend-*.AppImage
```

Or in dev mode (faster iteration):

```bash
cd ~/projects/catodo/frontend
npm run dev          # Vite on :1420 with HMR
# In another terminal, point Electron at the Vite dev server:
CATODO_BACKEND_URL=http://127.0.0.1:1420 npm run electron:dev
```

## Production install

```bash
cd ~/projects/catodo
bash install.sh
```

This will:
1. Set up the Python venv
2. Build the frontend
3. Install + enable the systemd user service (`catodo.service`)
4. Build the Electron AppImage
5. Optionally create an autostart entry for the AppImage

## Hotkeys (inside the Cátodo window)

- `1`–`4` — switch channels (Ch1–Ch4)
- `+` / `-` / `ArrowUp` / `ArrowDown` — volume up/down
- `F11` — toggle fullscreen
- `Esc` — exit fullscreen / return to Home

## Bibliotecas de medios

El canal Anime es un caso particular de **bibliotecas locales configurables**: cada
biblioteca (Anime, Series, Películas…) es un canal propio que escanea una carpeta.

- `kind: series` → agrupa por serie + temporada (anime/series).
- `kind: movies` → lista plana de películas.
- Progreso/resume por biblioteca (se retoma donde quedaste).
- La biblioteca `anime` es built-in (usa `anime_dir`); las demás se agregan desde
  **Settings** del remote o por API:

```bash
# agregar una biblioteca (aparece como canal al instante)
curl -X POST http://127.0.0.1:8765/api/libraries \
  -H 'Content-Type: application/json' \
  -d '{"id":"series","name":"Series","path":"~/Series","kind":"series"}'

curl -X DELETE http://127.0.0.1:8765/api/libraries/series
```

La lista vive en `~/.local/share/catodo/config.json` → `libraries`.

## Arcade

El canal **Arcade** convierte el TV en una máquina recreativa: lista una biblioteca
local de juegos por sistema y lanza cada uno en un **emulador externo** (RetroArch,
MAME, …) a pantalla completa. Al cerrar el emulador, vuelve al launcher.

Layout de `~/Arcade` (o el dir que configures). Soporta **tres formas**:

```
# 1) ROMs sueltas por sistema + carátula sidecar (mismo nombre, .png/.jpg/.jpeg)
~/ROMs/
├── snes/
│   ├── Super Mario World.smc
│   └── Super Mario World.png     # carátula opcional
└── genesis/
    ├── Sonic.smd
    └── Sonic.png

# 2) Una subcarpeta por juego con boxart.png
~/Arcade/
└── NES/
    └── Pac-Man/
        ├── pacman.nes
        └── boxart.png            # boxart.png | jpg | jpeg

# 3) ROMs sueltas en la raíz del dir (se agrupan como un solo sistema)
```

Config (`~/.local/share/catodo/config.json`):

```json
{
  "arcade_dir": "~/Arcade",
  "arcade_emulators": { "NES": "retroarch -L ~/.config/retroarch/cores/fceumm_libretro.so {rom}" },
  "arcade_default_emulator": "mame {rom}"
}
```

- `arcade_emulators`: mapa `sistema → comando`; `{rom}` se reemplaza por la ruta de la ROM.
- `arcade_default_emulator`: comando para sistemas sin mapeo.
- El comando debe abrir el emulador a pantalla completa (ej. RetroArch con `--fullscreen`).
- Mientras corre el emulador, el sistema se mantiene activo (no entra en screensaver).

### Carátulas automáticas

Si un juego no tiene carátula local, Cátodo intenta descargarla solo desde
**Libretro Thumbnails** (`thumbnails.libretro.com`) al escanear, y la guarda como
sidecar (`<ROM>.png` al lado de la ROM). Es best-effort: si el nombre del ROM no
coincide con la convención no-intro de Libretro, queda el placeholder.

- La descarga es serializada y los intentos fallidos no se repiten en cada escaneo.
- Config: `arcade_boxart_enabled` (default `true`) para desactivarla.
- Retry manual por API:
  ```bash
  # un juego puntual
  curl -X POST http://127.0.0.1:8765/api/channels/arcade/command \
    -H 'Content-Type: application/json' \
    -d '{"command":"fetch_boxart","game":"snes/Super Mario World"}'
  # forzar el lote completo de faltantes
  curl -X POST http://127.0.0.1:8765/api/channels/arcade/command \
    -H 'Content-Type: application/json' \
    -d '{"command":"fetch_boxarts"}'
  ```

## Remote en el celular (PWA + QR)

El remote (`/remote/`) es una **PWA**: en el iPhone abrí la URL en Safari, tocá
**Compartir → Agregar a pantalla de inicio** y queda instalado como app fullscreen.

Para conectar sin tipear la IP: en la TV abrí el **Home** y tocá el botón **📱** —
aparece un **QR** que escaneás con la cámara del iPhone y te abre el remote
directamente (si hay token configurado, va incluido). Como fallback, el remote
tiene un campo **código/token de emparejamiento** en Settings.

| Endpoint             | Descripción                              |
| -------------------- | ---------------------------------------- |
| `GET /api/pair/info` | URL + código de emparejamiento           |
| `GET /api/pair/qr`   | QR (SVG) con la URL del remote           |

## Proyección de pantalla (Screen Cast)

Cátodo funciona como **pantalla inalámbrica** vía WebRTC (sin protocolos propietarios):

1. En la TV hay un canal **Pantalla** (`screen-cast`); al iniciarse una proyección se abre solo.
2. En cualquier navegador de la red abrí `https://<ip-catodo>:8765/cast/`, tocá **Compartir pantalla** y listo.
3. Desde el **remote** aparece un indicador "Proyectando" con botón para detener.

**Requisito HTTPS**: `getDisplayMedia` (compartir pantalla) solo funciona en contexto seguro
(HTTPS o `localhost`). El backend sirve **HTTP en :8765** (todo como siempre) y, si existe
certificado, **HTTPS en :8766** para `/cast`:

```bash
bash scripts/make_cert.sh        # genera ~/.local/share/catodo/ssl/{cert,key}.pem
systemctl --user restart catodo  # ahora también escucha HTTPS en :8766
```

Luego abrís `https://<ip-catodo>:8766/cast/` (aceptá el certificado self-signed una vez) y
compartís pantalla. El resto de la app (TV, remote, QR) sigue por HTTP sin cambios.

Limitación: requiere un navegador que soporte `getDisplayMedia` (PC; los celulares Android/iOS
no exponen captura de pantalla). El media va peer-to-peer; STUN público incluido, sin TURN.

## Reposo / screensaver

Cátodo detecta inactividad y se comporta como una TV: tras `idle_screensaver_seconds`
sin input muestra una pantalla de reposo (wallpapers + reloj); si configurás
`idle_sleep_seconds` (> 0), después apaga la pantalla (negra). Cualquier input
(mouse/teclado del kiosk o el remote) lo reactiva y vuelve al canal anterior.

- Config: `~/.local/share/catodo/config.json` → `idle_screensaver_seconds` (default 240)
  e `idle_sleep_seconds` (default 0 = desactivado). Editables desde el **Settings**
  del remote o por API.
- `POST /api/activity` es el ping de actividad local del kiosk.

## Resume de sesión

Al encender, Cátodo retoma el último canal activo en vez de arrancar en el Home
(comportamiento tipo TV). Se desactiva con `resume_last_channel: false` en
`~/.local/share/catodo/config.json`. Si el canal guardado ya no existe, arranca
en el Home sin error.

## Volumen por canal

Cada canal recuerda su propio volumen: al cambiar de canal se aplica el del
nuevo y al volver se restaura el anterior. Config:

- `per_channel_volume_enabled` (default `true`) — desactivar para volumen global.
- `per_channel_volume_default` (default `50`) — volumen para canales sin nivel guardado.
- `channel_audio_sinks` — mapa `canal → sink` de PulseAudio; al abrir el canal,
  el sink por defecto del sistema se mueve a ese sink (se ignora si no hay PulseAudio).

```json
{ "channel_audio_sinks": { "spotify": "bluez_output.XX_XX_XX_XX" } }
```

## Control por voz

Cátodo interpreta comandos de voz (recibe texto ya transcrito, sin STT propio).
`POST /api/voice` con `{"text": "poné YouTube"}` abre el canal; también entiende
"canal 2", "siguiente", "anterior", "sube/baja el volumen", "pausa", "play",
"home" y "pantalla". El kiosk muestra un overlay breve con lo que entendió.

## Domótica (MQTT)

Cátodo puede conectarse a un broker MQTT (cubre Zigbee vía zigbee2mqtt). Config:

```json
{ "mqtt_host": "192.168.1.10", "mqtt_port": 1883, "mqtt_user": "", "mqtt_pass": "", "mqtt_topic_prefix": "catodo" }
```

Sin `mqtt_host`, el bridge no arranca. Comandos entrantes en `catodo/cmd/<cmd>`:

| Tópico              | Payload                          |
| ------------------- | -------------------------------- |
| `catodo/cmd/channel`| id o nombre de canal (`youtube`, `poné arcade`) |
| `catodo/cmd/next`   | —                                |
| `catodo/cmd/prev`   | —                                |
| `catodo/cmd/volume` | nivel (`40`) o `+`/`-`           |
| `catodo/cmd/play` / `pause` / `home` | —                  |

El estado se publica en `catodo/state` (retain): `{"channel", "volume", "playing"}`.
Ejemplo en Home Assistant:

```yaml
mqtt:
  button:
    - name: "TV YouTube"
      command_topic: "catodo/cmd/channel"
      payload_press: "youtube"
    - name: "TV siguiente"
      command_topic: "catodo/cmd/next"
```

## Plugins

Cátodo tiene un sistema de plugins declarativos inspirado en los addons de Kodi:
un plugin es una carpeta `plugins/<id>/` con un `manifest.json` que describe un
canal `web` (URL + user-agent + partition + color), sin código. Los canales web
built-in (YouTube, TV, Crunchyroll) son plugins bundled que se auto-instalan al
arrancar.

```json
// manifest.json de un plugin web
{
  "id": "mi-canal",
  "name": "Mi Canal",
  "version": "1.0.0",
  "type": "web",
  "icon": "play",
  "color": "#f47521",
  "url": "https://ejemplo.com",
  "user_agent": "default",          // default | chrome | android-tv
  "partition": "persist:mi-canal",
  "order": 6,                       // posición en la barra (opcional)
  "config_key": "mi_canal_url",     // override de URL vía config (opcional)
  "requires_catodo": { "min": "0.1.0" },
  "dependencies": []                // paquetes pip (opcional)
}
```

### CLI

```bash
cd ~/projects/catodo/backend
uv run python -m catodo plugin list           # ver instalados
uv run python -m catodo plugin install <id>   # instalar desde el repo
uv run python -m catodo plugin remove <id>
uv run python -m catodo plugin enable|disable <id>
```

> El CLI modifica el estado persistente (`~/.local/share/catodo/plugins.json`);
> los cambios aplican al próximo arranque. Para cambios en caliente usá la API
> (`POST /api/plugins/{id}/enable|disable` o `/api/plugins/install`).

### Repos y dependencias

- El **repo por defecto** es `plugins-repo/` (en el repo git) con un `index.json`
  que lista plugins (id, versión, url o path, checksum `sha256`, `requires_catodo`).
  Se puede cambiar con `plugin_repo` en `~/.local/share/catodo/config.json` o
  `CATODO_PLUGIN_REPO`.
- Las **dependencias** (`dependencies`) se instalan en un venv aislado en
  `~/.local/share/catodo/plugin-venv`, sin tocar el venv principal. En un entorno
  limpio se instalan automáticamente al arrancar (desactivar con
  `CATODO_PLUGIN_AUTOINSTALL=0`).

## API

| Method | Path                            | Description                        |
| ------ | ------------------------------- | ---------------------------------- |
| GET    | `/api/health`                   | Liveness probe                     |
| GET    | `/api/channels`                 | List registered channels           |
| GET    | `/api/state`                    | Global state                       |
| GET    | `/api/channels/{id}/state`      | Per-channel state                  |
| POST   | `/api/channels/{id}/open`       | Switch to a channel                |
| POST   | `/api/channels/{id}/close`      | Close a channel                    |
| POST   | `/api/channels/{id}/command`    | Channel command (play, pause, ...) |
| POST   | `/api/channels/next`            | Next channel (cyclic)              |
| POST   | `/api/channels/previous`        | Previous channel (cyclic)          |
| GET    | `/api/channels/{id}/episodes`   | Channel episodes (Anime)           |
| GET    | `/api/channels/{id}/stream`     | Episode file stream (Anime)        |
| GET    | `/api/channels/{id}/boxart`     | Boxart image (Arcade)              |
| GET    | `/api/channels/{id}/history`    | Channel history (Spotify)          |
| POST   | `/api/volume?level=N\|+\|-`     | Set/adjust volume                  |
| POST   | `/api/type`                     | Type text into the active webview  |
| POST   | `/api/voice`                    | Voice command (text → action)      |
| GET    | `/api/lyrics?artist=&track=`    | Lyrics lookup via LRCLib           |
| GET    | `/api/config`                   | Runtime config (read)              |
| POST   | `/api/config`                   | Runtime config (write)             |
| GET    | `/api/plugins`                  | Plugin list                        |
| GET    | `/api/plugins/{id}`             | Plugin detail                      |
| POST   | `/api/plugins/install`          | Install plugin from repo           |
| POST   | `/api/plugins/{id}/enable`      | Enable plugin (hot)                |
| POST   | `/api/plugins/{id}/disable`     | Disable plugin (hot)               |
| GET    | `/api/libraries`                | Media library list                 |
| POST   | `/api/libraries`                | Add media library (hot channel)    |
| DELETE | `/api/libraries/{id}`           | Remove media library (hot)         |
| GET    | `/api/wallpapers/list`          | Wallpaper file list                |
| GET    | `/api/wallpapers/count`         | Wallpaper count                    |
| POST   | `/api/wallpapers/fetch?n=`      | Download new wallpapers            |
| GET    | `/api/wallpapers/cover`         | Album cover via iTunes API         |
| GET    | `/api/wallpapers/artist?name=`  | Artist photos (Last.fm/Reddit)     |
| WS     | `/api/ws`                       | Live events (state snapshot on connect) |

## Layout

```
backend/    FastAPI service + channels + systemd unit + static assets
frontend/   React + Vite + Electron (no Tauri)
```

Data stored outside the repo at `~/.local/share/catodo/`:
- `config.json` — runtime overrides (URLs, directories)
- `wallpapers/` — downloaded wallpapers and artist photos
