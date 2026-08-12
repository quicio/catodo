# Remote Control Web

## Why

The MVP proposal promised a TV "managed remotely via HTTP API" — the API exists, but there is no client for it. The natural remote is the phone already in your hand: open a URL, change the channel, adjust volume, see what's playing. Today that requires curl. This change ships the missing remote as a tiny web client served by the backend itself.

## What Changes

- **`/remote` web client**: a small touch-first page served by the backend (static, no build step) with: channel grid, transport controls (play/pause/next/prev), volume slider + mute, now-playing display (title/artist/art), and live updates via the WebSocket.
- **LAN access, opt-in**: the backend keeps binding `127.0.0.1` by default; binding the LAN is an explicit, documented act (`CATODO_HOST=0.0.0.0` or runtime config) — the remote page then works from any device on the network.
- **Optional access token**: a shared token (env/config) that the remote page prompts for and sends with requests; when unset, LAN access stays open (home-network trust, documented as such).
- **CORS tightened on LAN mode**: when binding beyond loopback, allowed origins are derived from the bind address instead of `*`.

## Capabilities

### New Capabilities

- `remote-control`: the `/remote` client, its control surface, and its update mechanism.

### Modified Capabilities

- `backend-api`: LAN binding opt-in and the optional shared access token (ADDED ops).

## Non-goals

- Native/mobile apps, push notifications, or discovery (mDNS) — the user bookmarks `http://<tv-ip>:8765/remote`.
- Multi-user auth or permissions — one optional shared token, that's it.
- Remote text search/keyboard input (future change).
- Exposing the karaoke/lyrics or wallpaper admin features on the remote.

## Impact

- `backend/`: static `remote/` assets, optional token middleware, CORS logic, host resolution via runtime config.
- Zero changes to the kiosk frontend; the TV UI is untouched.
- Security posture changes only when the user opts into LAN binding; loopback-only installs are unaffected.
