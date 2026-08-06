# Design

## Directory layout

```
~/projects/catodo/
├── README.md
├── install.sh
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── catodo/
│   │   ├── __init__.py
│   │   ├── __main__.py
│   │   ├── main.py            # FastAPI app + lifespan
│   │   ├── api.py             # routes
│   │   ├── events.py          # WebSocket broadcast
│   │   ├── manager.py         # ChannelManager
│   │   ├── channel.py         # Channel abstract base
│   │   ├── config.py          # config + persistence
│   │   └── channels/
│   │       ├── __init__.py    # registry
│   │       ├── spotify.py     # Spotify via MPRIS
│   │       └── youtube.py     # YouTube via WebView URL
│   └── systemd/
│       └── catodo.service
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   └── ws.ts
│   │   ├── channels/
│   │   │   ├── Spotify.tsx
│   │   │   ├── YouTube.tsx
│   │   │   └── index.ts
│   │   ├── components/
│   │   │   ├── ChannelBar.tsx
│   │   │   ├── ChannelView.tsx
│   │   │   └── Hooks.ts
│   │   └── styles.css
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       └── src/main.rs
└── openspec/
    └── ...
```

## Backend architecture

### `Channel` interface (in `channel.py`)

```python
from abc import ABC, abstractmethod
from typing import Literal

class Channel(ABC):
    id: str
    name: str
    icon: str
    type: Literal["media", "web", "app", "dashboard"]

    @abstractmethod
    async def open(self) -> None: ...
    @abstractmethod
    async def close(self) -> None: ...
    @abstractmethod
    async def state(self) -> dict: ...
    @abstractmethod
    async def command(self, cmd: str, **kwargs) -> None: ...
```

### `ChannelManager` (in `manager.py`)

Holds:
- `channels: dict[str, Channel]` (registry).
- `current: str | None` (current channel id).
- `history: list[str]` (last 16 channel ids).

Methods:
- `register(channel)`.
- `open(channel_id)`: closes current, calls `new.open()`, updates state.
- `next()` / `previous()`: rotate cyclically.
- `state()`: returns `{current_channel_id, playing, volume, available_channels}`.

### Events (`events.py`)

Single asyncio.Queue per WebSocket client. `EventBroker` provides `publish(event)` and `subscribe()`.

```python
class EventBroker:
    async def publish(self, event: dict): ...
    async def subscribe(self) -> AsyncIterator[dict]: ...
```

Events: `channel_changed`, `volume_changed`, `app_started`, `app_closed`.

### API (`api.py`)

FastAPI with routes:
- `GET /api/health`
- `GET /api/channels`
- `POST /api/channels/{id}/open`
- `POST /api/channels/next`
- `POST /api/channels/previous`
- `POST /api/channels/{id}/command`
- `POST /api/volume?level=N|+|-`
- `GET /api/state`
- `WS /api/ws`

### Spotify channel

Use `pydbus` to talk to the existing Spotify process via MPRIS:
- `open()`: bring Spotify window to focus via `wmctrl` or `xdotool`, send `Play`.
- `close()`: send `Pause`.
- `command()`: dispatch `play`, `pause`, `next`, `prev`, `volume`.

### YouTube channel

Shell-out to `chromium --app=https://www.youtube.com/feed/trending --start-fullscreen` via `subprocess.Popen`. Process is tracked so `close()` can kill it.

## Frontend architecture

### Tauri setup

- Window: fullscreen, frameless, primary monitor.
- Bind global hotkeys `1`-`6` for channels.
- Bind `F11` for fullscreen toggle.
- Bind `Esc` for windowed mode.

### Channels

- `Spotify.tsx`: iframe or webview URL to `https://open.spotify.com/` (or just a placeholder card until Spotify is focused through the backend).
- `YouTube.tsx`: WebView URL from channel state.

### Channel bar

- Fixed bottom strip.
- Auto-hide after 3s of mouse inactivity.
- Shows current channel highlighted.

### API client

Tiny `fetch` wrapper in `client.ts`. WebSocket handler in `ws.ts` updates a React state on `channel_changed` and `volume_changed`.

## Systemd service

`backend/systemd/catodo.service`:
```ini
[Unit]
Description=Catodo Backend
After=default.target

[Service]
Type=simple
WorkingDirectory=/home/hugo/projects/catodo/backend
ExecStart=/home/hugo/.local/bin/uv run python -m catodo
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

The `install.sh` script copies it to `~/.config/systemd/user/catodo.service` and runs `systemctl --user enable --now catodo.service`.

## Out of scope (deferred)

- Authentication, multi-user.
- Persistent state across reboots.
- Voice control, MQTT, Zigbee.
- Mobile app.
- Plugin marketplace.
- Per-channel volume, audio device routing.
