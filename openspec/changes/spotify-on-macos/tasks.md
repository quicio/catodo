## 1. Adapter AppleScript

- [x] 1.1 Reemplazar `catodo/infrastructure/macos/spotify_client.py`: `DbusslessSpotifyClient` → `ApplescriptSpotifyClient` con `is_available/play/pause/next/previous/set_volume/open_uri/get_state`.
- [x] 1.2 `catodo/infrastructure/factory.py`: `build_spotify_client()` en macOS retorna `ApplescriptSpotifyClient`.
- [x] 1.3 `catodo/channels/spotify.py`: agregar `_hide_macos()` (AppleScript `set miniaturized of window 1 to true`) y modificar `_launch_minimized()` para llamarlo cuando `platform.IS_MACOS`.

## 2. Tests

- [x] 2.1 Renombrar `backend/tests/test_dbusless_spotify.py` → `test_applescript_spotify.py`.
- [x] 2.2 Tests: `is_available` con Spotify.app ausente (False) y presente (True); `get_state` parsea AppleScript record; `play/pause/etc` invocan osascript con el `tell application "Spotify" to` correcto; `set_volume` clampea 0–100; `open_uri` arma el `open location`.

## 3. Verificación end-to-end

- [x] 3.1 Backend arrancando en macOS: `GET /api/channels` ahora INCLUYE `spotify` (gating pasa) si Spotify.app está instalado; sigue excluido si no.
- [x] 3.2 `POST /api/channels/spotify/open` llama AppleScript; con Spotify cerrado lo abre, con Spotify abierto reanuda.
- [x] 3.3 `GET /api/channels/spotify/state` devuelve `{available: true, status, title, artist, album, ...}` cuando Spotify está sonando.
- [x] 3.4 Backend tests pasan (Linux y macOS): la rama Linux no se rompe.

## 4. Docs

- [x] 4.1 `README.md` (sección macOS): agregar que Spotify.app es requerido para Ch1 y el prompt TCC Automation (`System Settings → Privacy & Security → Automation → permitir el shell que corre el backend`).