# Cátodo Tray

Native system-tray client for Cátodo. Pairs with the backend via the same
auth flow used by the `/remote` web UI, then exposes a persistent icon in
the OS tray with quick actions and a submenu of mode presets.

## Stack

- **Tauri 2.x** (Rust + system webview) — lightweight compared to Electron.
- **tokio** async runtime; **reqwest** for HTTP; **tokio-tungstenite** for
  WebSocket; **keyring** with a file fallback for token storage.

## Platforms

Tray icons render natively on macOS (menu bar), Windows (system tray) and
Linux (status notifier item — needs a SNI-compatible panel like
`AppIndicator`, `KStatusNotifierItem`, or modern GNOME with the appropriate
extension).

## Build

```bash
# From this directory:
cargo tauri dev      # dev mode (opens a window + tray)
cargo tauri build    # produces a native installer for the host OS
```

`cargo tauri build` outputs to `target/release/bundle/`. Use the
`build.sh` script to copy the bundle into `release/tray/<platform>/` for
distribution.

## Run

The tray client expects the backend running and reachable. Defaults to
`http://127.0.0.1:8765`. Override with `CATODO_BACKEND_URL`:

```bash
CATODO_BACKEND_URL=http://192.168.1.10:8765 cargo tauri dev
```

On first launch (no stored token) a small window opens showing the QR
and the pairing code. Enter the code (or scan the QR) — the client probes
the backend with `GET /api/state` and stores the token if accepted.

If the backend has no token configured (`CATODO_TOKEN` empty), the
pairing window is skipped and the client connects anonymously.

## Token storage

- **macOS**: Keychain (entry `catodo-tray / backend-token`).
- **Windows**: Credential Manager.
- **Linux**: Secret Service (GNOME Keyring, KWallet) when available;
  falls back to `~/.config/catodo/tray-token` (mode `0600`) if D-Bus /
  Secret Service are unavailable (e.g. headless servers).

## Menu structure

```
[icon]
├─ ⚠ Desconectado         (only while WS is down)
├─ ▶ Reproducir / ❚❚ Pausar
├─ ─────
├─ 🔊 Volumen +
├─ 🔉 Volumen −
├─ ─────
├─ Modos ▶
│   ├─ Cine
│   ├─ Películas
│   └─ …
│   (or "(sin modos)" if none)
├─ ─────
├─ 🌐 Abrir control remoto
├─ 🔑 Volver a emparejar
├─ ─────
└─ Salir
```

The `Modos` submenu is rebuilt whenever:
- the WS receives `config_changed` with `key == "mode_presets"`, or
- the connection (re)establishes (initial HTTP fetch of `/api/modes`).

## Layout in this directory

```
clients/tray/
├── Cargo.toml          # crate manifest + Tauri config
├── tauri.conf.json     # window + tray + bundle config
├── build.rs            # tauri_build hook
├── capabilities/       # Tauri 2 capabilities (window perms)
│   └── default.json
├── icons/icon.png      # 32x32 tray icon (Cátodo accent green)
├── ui/index.html       # pairing window content
└── src/
    ├── main.rs         # entry point + AppState
    ├── store.rs        # keyring + file fallback
    ├── ws.rs           # WebSocket + reconnect
    ├── menu.rs         # menu construction + click dispatch
    ├── tray.rs         # tray icon install
    └── pair.rs         # pairing window + submit_code command
```