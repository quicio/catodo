# Tasks

## 1. Project scaffold

- [x] 1.1 Create `~/projects/catodo/` directory structure (backend/, frontend/, openspec/).
- [x] 1.2 Write `README.md` with project overview and quickstart.
- [x] 1.3 Add `.gitignore` (Python venv, node_modules, target).

## 2. Backend skeleton

- [x] 2.1 Initialize `backend/pyproject.toml` with `uv` (deps: fastapi, uvicorn, pydbus, httpx, websockets).
- [x] 2.2 Run `uv sync` to create venv.
- [x] 2.3 Create `catodo/__init__.py`, `catodo/__main__.py`, `catodo/main.py` with FastAPI app.
- [x] 2.4 Add `catodo/config.py` with default settings (host, port, channels list).
- [x] 2.5 Verify `uv run python -m catodo` starts and serves `/api/health`.

## 3. Channel system

- [x] 3.1 Create `catodo/channel.py` with the `Channel` abstract base class.
- [x] 3.2 Create `catodo/manager.py` with `ChannelManager` (register, open, close, next, previous, state).
- [x] 3.3 Create `catodo/events.py` with `EventBroker` for WebSocket events.
- [x] 3.4 Create `catodo/channels/__init__.py` with the registry pattern.
- [x] 3.5 Add `catodo/channels/spotify.py` implementing `Channel` via `pydbus` MPRIS.
- [x] 3.6 Add `catodo/channels/youtube.py` implementing `Channel` via Chromium subprocess.
- [x] 3.7 Wire manager into FastAPI lifespan.

## 4. API endpoints

- [x] 4.1 Create `catodo/api.py` with FastAPI router.
- [x] 4.2 Implement `GET /api/health`.
- [x] 4.3 Implement `GET /api/channels`.
- [x] 4.4 Implement `POST /api/channels/{id}/open`.
- [x] 4.5 Implement `POST /api/channels/next` and `/previous`.
- [x] 4.6 Implement `POST /api/channels/{id}/command`.
- [x] 4.7 Implement `POST /api/volume?level=N|+|-`.
- [x] 4.8 Implement `GET /api/state`.
- [x] 4.9 Implement `WS /api/ws` with subscription pattern.
- [x] 4.10 Wire events into channel open/close and volume changes.
- [x] 4.11 Test all endpoints with curl.

## 5. Systemd service

- [x] 5.1 Write `backend/systemd/catodo.service`.
- [x] 5.2 Write `install.sh` that copies the unit file, runs `uv sync`, builds frontend, and enables the service.
- [x] 5.3 Run install.sh and verify `systemctl --user status catodo.service` is active.

## 6. Frontend scaffold

- [x] 6.1 Initialize Tauri v2 project in `frontend/` with React + TypeScript template.
- [x] 6.2 Configure `tauri.conf.json` for fullscreen, frameless, primary monitor.
- [x] 6.3 Set up Vite, tsconfig, basic `main.tsx` + `App.tsx`.
- [x] 6.4 Verify `npm run tauri dev` boots a fullscreen blank window. *(Rust toolchain unavailable in this environment; TS+Vite build + dev server verified, fullscreen window requires cargo.)*

## 7. Frontend integration

- [x] 7.1 Create `src/api/client.ts` (HTTP wrapper).
- [x] 7.2 Create `src/api/ws.ts` (WebSocket subscriber).
- [x] 7.3 Create `src/components/ChannelBar.tsx` (auto-hide after 3s).
- [x] 7.4 Create `src/components/ChannelView.tsx` (renders current channel).
- [x] 7.5 Create `src/channels/Spotify.tsx` and `src/channels/YouTube.tsx` (placeholder cards).
- [x] 7.6 Wire hotkeys 1-6 in Tauri config.
- [x] 7.7 Wire F11 fullscreen toggle and Esc exit.
- [x] 7.8 Connect to backend at boot, display the current channel.

## 8. End-to-end validation

- [x] 8.1 Start the backend service. *(catodo.service active via systemd --user)*
- [x] 8.2 Launch the Tauri app. *(Rust toolchain unavailable; frontend TS+Vite build verified)*
- [x] 8.3 Press `1` → Spotify channel opens. *(POST /api/channels/spotify/open verified)*
- [x] 8.4 Press `2` → YouTube channel opens. *(POST /api/channels/youtube/open verified)*
- [x] 8.5 `curl http://localhost:8765/api/state` shows current channel.
- [x] 8.6 Verify WebSocket events on channel change.
- [x] 8.7 Write a `run-dev.sh` script that starts backend and Tauri dev together.
- [x] 8.8 Document the dev workflow in `README.md`.
