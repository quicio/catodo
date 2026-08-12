# Initial MVP — Cátodo Multimedia Shell

## Why

We want a Linux-based multimedia shell that turns any monitor into a "smart TV" controlled via API. The current Linux desktop model is too noisy for a dedicated media center: window management, notifications, and idle screensavers all interfere with audio playback and fullscreen viewing. By replacing the desktop with a single fullscreen "Cátodo" application, the system can be operated like a TV — channels up/down, volume, on/off — and managed remotely via HTTP API.

## What Changes

This change delivers the MVP foundation of Cátodo:

- **Backend (Python + FastAPI)** running as a systemd user service, exposing:
  - HTTP REST API for channel control and system state.
  - WebSocket for live events (channel changes, volume changes, app state).
  - A `ChannelManager` that registers and switches between channels.
  - A `Channel` base interface implemented by four reference plugins: `Spotify` (via MPRIS/DBus), `YouTube` (via in-app webview with Android TV UA), `Anime` (local video library), and `TV` (Movistar TV via in-app webview with Widevine).
  - Default port: `8765`, bind: `127.0.0.1`.

- **Frontend (Electron + React + TypeScript)** running as a fullscreen kiosk window:
  - Shows the current channel.
  - Channel bar at the bottom that auto-hides on inactivity.
  - Hotkeys: `1`–`6` switch channels, `F11` toggles fullscreen, `Esc` exits fullscreen.
  - HTTP client to the backend; WebSocket subscriber for events.

- **Directory layout** at `~/projects/catodo/`:
  - `backend/` for the Python service.
  - `frontend/` for the Electron app.
  - `README.md` with run instructions.

- **Systemd user service** (`catodo.service`) that auto-starts the backend on login.

## Non-goals

- Multi-user support (single user, single session).
- Authentication / authorization (loopback only).
- Voice control, MQTT, Zigbee, IPTV — future changes.
- Mobile app or remote shell UI (Mac client is a separate change).
- Plugin marketplace or auto-discovery (plugins are statically registered).
- Persisted state across reboots (channels are stateless for now).
- Audio device routing or per-channel volume.

## Acceptance criteria

- App launches fullscreen on login via systemd user service.
- Switching between Ch1 (Spotify), Ch2 (YouTube), Ch3 (Anime), and Ch4 (TV) works via hotkey and API.
- Backend responds to `GET /api/health` within 100ms.
- WebSocket events fire when channels change.
- Adding a new channel requires only one new file in `backend/catodo/channels/` and one registration line.
- Documentation (`README.md`) allows a fresh user to run the MVP in under 5 minutes.
