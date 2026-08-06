# Cátodo

A multimedia shell for Linux, inspired by old CRT TVs. Turn any monitor into a "smart TV" you control via HTTP.

## Channels

- **Ch1 — Spotify** — Spotify embed.
- **Ch2 — YouTube** — Big Buck Bunny placeholder loop (custom URL via backend).

Hotkeys `1`–`6` switch channels.

## Architecture

```
backend/    FastAPI (serves API + static frontend on :8765)
frontend/   Electron app (Chromium) loading http://127.0.0.1:8765
```

- **Backend**: FastAPI handles all channels + state. Serves the built frontend as static files at `/`.
- **Frontend**: React + Vite, built into static HTML/JS, served by the backend.
- **Shell**: Electron opens a frameless, fullscreen, kiosk window pointing at the backend.

**No Tauri, no WebKitGTK quirks.** Electron uses Chromium under the hood, so Spotify embed, video, and any web feature just works.

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

- `1`–`6` — switch channels
- `F11` — toggle fullscreen
- `Esc` — exit fullscreen

## API

| Method | Path                            | Description                |
| ------ | ------------------------------- | -------------------------- |
| GET    | `/api/health`                   | Liveness probe             |
| GET    | `/api/channels`                 | List registered channels   |
| GET    | `/api/channels/{id}/state`      | Per-channel state          |
| GET    | `/api/state`                    | Global state               |
| POST   | `/api/channels/{id}/open`       | Switch to a channel        |
| POST   | `/api/channels/{id}/command`    | Channel command            |
| POST   | `/api/channels/next`            | Next channel (cyclic)      |
| POST   | `/api/channels/previous`        | Previous channel (cyclic)  |
| POST   | `/api/volume?level=N\|+\|-`     | Set/adjust volume          |
| WS     | `/api/ws`                       | Live events                |

## Layout

```
backend/    FastAPI service + channels + systemd unit
frontend/   React + Vite + Electron (no Tauri)
```
