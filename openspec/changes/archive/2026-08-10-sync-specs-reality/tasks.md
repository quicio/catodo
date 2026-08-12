# Tasks

## 1. Fix OpenSpec project context

- [x] 1.1 Update `openspec/config.yaml`: replace "Frontend: Tauri v2" with "Frontend: Electron (castLabs build in dev for Widevine), TypeScript, React, Vite"; list the real channels (spotify, youtube, anime, tv) and hotkeys 1–4; add the runtime data dir convention (`~/.local/share/catodo/`).
- [x] 1.2 Verify: `openspec context` output shows the corrected stack.

## 2. Correct initial-mvp artifacts

- [x] 2.1 Edit `openspec/changes/initial-mvp/specs/frontend-kiosk/spec.md`: Electron kiosk window (frameless, fullscreen, `webviewTag`) instead of Tauri; channel bar auto-hide after 8s; hotkeys 1–6 bound but only registered channels respond.
- [x] 2.2 Edit `openspec/changes/initial-mvp/design.md` and `proposal.md`: note the Electron decision (replaces Tauri) and the actual channel set (spotify, youtube, anime, tv).
- [x] 2.3 Edit `openspec/changes/initial-mvp/specs/systemd-integration/spec.md` if it diverges from `backend/systemd/catodo.service` (env `DBUS_SESSION_BUS_ADDRESS`, `KillSignal=SIGKILL`, `TimeoutStopSec=5`).
- [x] 2.4 Edit `openspec/changes/initial-mvp/specs/channel-system/spec.md`: the shipped channels are four (spotify, youtube, anime, tv), not two; YouTube renders in the in-app webview (no Chromium launch); Spotify control is pure MPRIS (no window focusing).
- [x] 2.5 Verify: `openspec validate initial-mvp` passes.

## 3. Archive initial-mvp

- [x] 3.1 Run `openspec archive initial-mvp` and confirm `openspec/specs/` now contains `backend-api`, `channel-system`, `frontend-kiosk`, `systemd-integration`.
- [x] 3.2 Verify: `openspec list` shows `initial-mvp` under archived changes.

## 4. Land this change's deltas

- [x] 4.1 Verify: `openspec validate --change sync-specs-reality --strict` passes against the new baseline.
- [ ] 4.2 Verify each spec file under `openspec/changes/sync-specs-reality/specs/` matches observable behavior: run the backend and spot-check one scenario per new capability (e.g. `curl /api/wallpapers/count`, `curl /api/config`, `curl /api/channels/anime/state`).
- [ ] 4.3 Archive `sync-specs-reality` so the seven new capabilities and the `backend-api` extension merge into `openspec/specs/`.

## 5. README alignment

- [ ] 5.1 Update `README.md`: channels list (Ch1 Spotify, Ch2 YouTube, Ch3 Anime, Ch4 TV), the full API table (close/state/episodes/stream/history/config/lyrics/wallpapers), and the castLabs Electron note for DRM in dev vs stock Electron in packaged builds.
- [ ] 5.2 Verify: a fresh reader can map every running endpoint to a documented one.
