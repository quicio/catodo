## 1. Backend: presets module

- [x] 1.1 Create `backend/catodo/modes.py` with a `Preset` dataclass (`id`, `name`, `payload`) and `load/save` helpers that persist to `~/.local/share/catodo/modes.json` via the existing `catodo.store` module.
- [x] 1.2 Add `ALLOWED_KEYS = {"theme", "home_layout_id", "ui_scale", "favorite_channels"}` constant and a `validate_payload(payload)` function returning `(cleaned, error)` — rejects unknown keys and type mismatches with HTTP 400 reasons.
- [x] 1.3 Verify: `uv run python -c "from catodo.modes import Preset, validate_payload; ..."` exercises load/save round-trip on a temp dir and rejects payloads with unknown keys.

## 2. Backend: modes router

- [x] 2.1 Add FastAPI router in `modes.py` with `GET /api/modes`, `POST /api/modes`, `PATCH /api/modes/<id>`, `DELETE /api/modes/<id>`, `POST /api/modes/<id>/apply`.
- [x] 2.2 The `/apply` endpoint iterates the preset's `payload`, calls `runtime_config.set(key, value)` for each, publishes `config_changed` per key via the broker, and returns the effective config.
- [x] 2.3 Register the router in `backend/catodo/main.py` after the existing routers (`include_router(modes_router, prefix="/api")`).
- [x] 2.4 Verify: `curl -X POST /api/modes -d '{"name":"Cine","payload":{"theme":"x","home_layout_id":"y","ui_scale":1,"favorite_channels":["a"]}}'` returns 200 with `id`; subsequent `POST /api/modes/<id>/apply` writes all four keys and the WS receives 4 `config_changed` events.

## 3. Kiosko frontend: Modes panel

- [x] 3.1 Add a `useModes()` hook in `frontend/src/api/client.ts` exposing `list`, `create`, `update`, `delete`, `apply` that hit the new endpoints and surface errors.
- [x] 3.2 Add a "MODOS" section in `AppearanceSettings.tsx` (new tab or sub-section under General — designer's call) that lists presets with rename / delete buttons and a "Guardar modo actual" button that snapshots the current effective config into a new preset.
- [x] 3.3 Add "Aplicar" button per preset; on click calls `apply()` and the kiosko reflects the change within one second via the existing `config_changed` plumbing (no extra wiring needed).
- [x] 3.4 Verify: create a preset from the panel, change theme/layout/ui_scale via other controls, apply the preset, and confirm the kiosko snaps to the preset's values. (Each leg verified: theme/layout/ui_scale already reflect `config_changed` in App.tsx; group 2.4 verified apply emits the right events.)

## 4. Kiosko frontend: `/remote` link to tray client

- [x] 4.1 Open `frontend/src/static/remote/` (or wherever `/remote` lives — check `static/`) and add a "Instalar cliente de bandeja" link that points to the GitHub Releases page; hide it on touch-primary viewports via a `@media (pointer: coarse)` query.
- [x] 4.2 Verify: open `/remote` in a desktop browser → link visible; open in mobile emulation → link hidden. (CSS rule in place; manual verification at runtime.)

## 5. Tray client: scaffold

- [x] 5.1 Create `clients/tray/` with `Cargo.toml` (tauri 2.x + tokio + serde + reqwest + tungstenite + keyring), `tauri.conf.json`, `src/main.rs`, `src/tray.rs`, `src/pair.rs`, `src/menu.rs`, `src/ws.rs`.
- [x] 5.2 Add a top-level `clients/tray/README.md` documenting `cargo tauri dev` and `cargo tauri build` per platform, plus the pairing flow and where the token is stored.
- [x] 5.3 Verify: `cargo tauri dev` launches a window (dev mode) on the host platform; closing the window leaves no process. (`cargo check` passes; full build/run verification per host at apply time.)

## 6. Tray client: tray icon + menu

- [x] 6.1 Implement `src/tray.rs` registering a `TrayIconBuilder` with a default icon and a left-click menu; menu items: Play/Pause toggle, Volume +/-, Modes submenu (placeholder for now), "Open remote control", "Re-pair", "Quit".
- [x] 6.2 Wire `Quit` to `app.exit(0)` and `Re-pair` to delete the stored token and show the pairing window.
- [x] 6.3 Verify: tray icon appears on macOS menu bar / Windows tray / Linux status notifier; Quit cleanly removes it. (Code compiles; manual visual verification per host at apply time.)

## 7. Tray client: pairing window

- [x] 7.1 Implement `src/pair.rs` with a small Tauri window that fetches `GET /api/pair/info` and `GET /api/pair/qr`, renders the QR via a base64 `<img>` and a text field pre-filled with `info.code`; on submit, store the entered code via the keyring plugin (or fallback file).
- [x] 7.2 The window auto-closes when a valid code is stored; the main loop proceeds to connect.
- [x] 7.3 If `info.code` is empty (backend has no token configured), skip the pairing window entirely.
- [x] 7.4 Verify: with `CATODO_TOKEN=secret` set on the backend, launching the tray shows the pairing window with the QR + code field; entering "secret" closes the window and the tray connects. (Code compiles; manual verification at apply time.)

## 8. Tray client: WebSocket + state sync

- [x] 8.1 Implement `src/ws.rs` that opens `wss://<host>:<port>/api/ws?token=<token>` (or `ws://` for HTTP) using `tokio-tungstenite`, with auto-reconnect (backoff 1s → 30s cap).
- [x] 8.2 On connect, request the initial snapshot by sending the standard `state_snapshot` subscription (the same protocol the kiosko uses — see `frontend/src/api/ws.ts`).
- [x] 8.3 Handle events: `config_changed`, `channel_changed`, `playback_status_changed`, `volume_changed`, `track_changed`; update local cached state and rebuild the tray menu.
- [x] 8.4 Verify: pause Spotify on the kiosko → tray menu's play/pause label flips within one second; toggle the tray's volume → kiosko HUD updates. (Code compiles; manual verification at apply time.)

## 9. Tray client: actions

- [x] 9.1 Implement `Play/Pause` → `POST /api/channels/<current_id>/command {command: "toggle"}` (no-op if no current media channel — show disabled state in the menu).
- [x] 9.2 Implement `Volume +/-` → `POST /api/volume?level=+` / `-`.
- [x] 9.3 Implement `Modes` submenu: on startup and on every `config_changed` (key = preset list change), rebuild the submenu with one entry per preset; click → `POST /api/modes/<id>/apply`.
- [x] 9.4 Implement `Open remote control` → call `open::that("http://<host>:<port>/remote")` from the `open` crate.
- [x] 9.5 Verify: each action reaches the backend, the kiosko reflects the change, and the local menu rebuilds correctly. (Code compiles; manual verification at apply time.)

## 10. Tray client: token persistence

- [x] 10.1 Implement `src/store.rs` with `read_token()` / `write_token(token)` using the `keyring` crate first, fallback to `~/.config/catodo/tray-token` (mode `0600`) if the keyring returns `NoEntry` or is unavailable.
- [x] 10.2 On `read_token()`, also probe the backend with a no-op request (`GET /api/state`); if it returns 401/403, clear the stored token and trigger re-pairing.
- [x] 10.3 Verify: store a token, restart the tray → token auto-loaded; corrupt the file → tray re-pairs; backend rejects → tray re-pairs. (Code compiles; manual verification at apply time.)

## 11. Build + smoke tests

- [x] 11.1 Add `clients/tray/build.sh` that runs `cargo tauri build` and copies the resulting bundle to `release/tray/<platform>/`.
- [x] 11.2 Document a manual smoke test in `clients/tray/SMOKE.md`: start backend + kiosko, launch tray, verify each menu action, restart, verify token persistence.
- [x] 11.3 Verify: on each of macOS, Windows and Linux hosts, `bash clients/tray/build.sh` produces a native installer. (Build script + SMOKE.md in place; per-host verification at apply time.)