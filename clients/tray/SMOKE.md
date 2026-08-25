# Smoke test — manual checklist for the tray client

Run this on the host OS (macOS, Windows or Linux) you intend to ship to. It
exercises the full flow end-to-end against a local backend.

## Setup

```bash
# Terminal 1: backend
cd /path/to/catodo
CATODO_TOKEN=secret uv run python -m catodo
```

## Launch the tray

```bash
# Terminal 2: tray
cd clients/tray
CATODO_BACKEND_URL=http://127.0.0.1:8765 cargo tauri dev
```

## Checklist

- [ ] Tray icon appears in the OS tray / menu bar / status notifier.
- [ ] Pairing window opens automatically (no token stored yet).
- [ ] Window shows the QR (rendered as SVG inline) and the code "secret".
- [ ] Click "Guardar" — window closes, tray icon remains.
- [ ] Tray menu opens on left-click and shows:
    - [ ] "▶ Reproducir" (or "❚❚ Pausar" if Spotify is playing).
    - [ ] "🔊 Volumen +" / "🔉 Volumen −" enabled.
    - [ ] "Modos ▶" submenu with one entry per preset (or "(sin modos)" if
      none — open the kiosko config panel and create one to test).
- [ ] Open Spotify on the host and play a track. Within ~1s the tray
      label flips to "❚❚ Pausar". Click it — Spotify pauses; tray label
      flips back to "▶ Reproducir".
- [ ] Click "🔊 Volumen +" several times — host volume increases; kiosko
      HUD reflects the new level.
- [ ] Click "🔉 Volumen −" — volume decreases.
- [ ] From the kiosko config panel (Modos tab), click "Aplicar" on a
      preset — tray's preset list reflects the change within ~1s (rebuild).
      Click a different preset in the tray — kiosko applies it.
- [ ] Click "🌐 Abrir control remoto" — default browser opens
      `http://127.0.0.1:8765/remote`.
- [ ] Click "🔑 Volver a emparejar" — pairing window re-opens.
- [ ] Quit the tray — icon disappears, no process remains.

## Token persistence

- [ ] Quit the tray and relaunch with a stored token. Pairing window does
      NOT open; tray connects directly.
- [ ] With `CATODO_TOKEN=wrongsecret` on the backend, enter the wrong
      code in the pairing window — submit returns "backend rejected
      token (HTTP 401)" and the window stays open.
- [ ] On Linux headless (no D-Bus/Secret Service): token falls back to
      `~/.config/catodo/tray-token` with mode `0600`.

## Disconnect handling

- [ ] Stop the backend. Within 30s the tray menu shows "⚠ Desconectado"
      and command items become disabled.
- [ ] Restart the backend. Tray auto-reconnects; menu returns to normal.