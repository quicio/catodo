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
│   │       ├── youtube.py     # YouTube via webview URL
│   │       ├── anime.py       # Anime local library scanner
│   │       └── tv.py          # TV via webview URL
│   │       ├── server.py      # lyrics via LRCLib
│   │       ├── wallpapers.py  # wallpaper downloads + serving
│   │       ├── runtime_config.py
│   │       └── datadir.py
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
│   │   │   ├── Anime.tsx
│   │   │   └── Tv.tsx
│   │   │   └── index.ts
│   │   ├── components/
│   │   │   ├── ChannelBar.tsx
│   │   │   ├── ChannelView.tsx
│   │   │   ├── CrtShell.tsx
│   │   │   └── NowPlaying.tsx
│   │   └── styles.css
│   └── electron/
│       ├── main.cjs
│       └── preload.cjs
│   └── electron-castlab/   # Widevine-capable Electron build (AUR)
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

Use `pygobject`/Gio to talk to the existing Spotify process via MPRIS:
- `open()`: send `Play`.
- `close()`: send `Pause`.
- `command()`: dispatch `play`, `pause`, `next`, `prev`, `toggle`, `volume`, `open_uri`.
- `state()`: exposes `status`, `title`, `artist`, `album`, `art_url`, `available`, `position`.
- Maintains an in-memory track history (last 20) exposed via `history_state()`.

### YouTube channel

Renders an in-app `<webview>` (Electron webview tag) with an Android TV user agent pointing at a runtime-configurable URL (default: `https://www.youtube.com/tv`). No external Chromium process is launched.

### Anime channel

Scans `~/Anime` for video files, grouped by series/season. Episodes are streamed via `GET /api/channels/anime/stream`. Commands: `play`, `pause`, `set_episode`, `next`, `prev`.

### TV channel

Renders an in-app `<webview>` (Electron webview tag) pointing at a runtime-configurable TV provider URL (default: Movistar TV). Requires an Electron build with Widevine support for DRM content.

## Frontend architecture

### Electron setup

- Window: fullscreen, frameless, kiosk mode, `webviewTag: true`.
- Bind keyboard shortcuts `1`-`6` for channels (forwarded from webviews).
- Bind `F11` for fullscreen toggle.
- Bind `Esc` to exit fullscreen and return to Home.
- Uses electron-castlab (AUR package) in dev for Widevine DRM support; falls back to stock Electron.

### Channels

- `Spotify.tsx`: `NowPlaying` component with album art, transport controls, and synced lyrics panel.
- `YouTube.tsx`: `<webview>` tag loading youtube.com/tv with an Android TV user agent.
- `Anime.tsx`: `<video>` player with episode list, effects (CRT/VHS/4K), and progress bar.
- `Tv.tsx`: `<webview>` tag loading the configured TV provider URL.

### Channel bar

- Fixed bottom strip.
- Auto-hide after 8s of mouse inactivity.
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
WorkingDirectory=%h/projects/catodo/backend
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/%U/bus
ExecStart=%h/.local/bin/uv run --directory %h/projects/catodo/backend python -m catodo
Restart=on-failure
RestartSec=5
TimeoutStopSec=5
KillSignal=SIGKILL

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
