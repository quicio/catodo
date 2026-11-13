## Why

`catodo/infrastructure/macos/spotify_client.py` hoy expone `DbusslessSpotifyClient`, un Null adapter que deja `is_available() == False`. Esto causa que el canal Spotify se OMITA del registry en macOS (gating via `build_default_registry`), aunque Spotify.app — el cliente desktop oficial — está instalado y soporta AppleScript de fábrica. Spotify es la integración insignia de Cátodo; tener Ch1 ausente en macOS es una pérdida grande para una de las funcionalidades principales.

Spotify.app expone un AppleScript dictionary documentado que cubre 1:1 el `SpotifyClientPort` (`play/pause/next/previous/set_volume/open_uri/get_state`). Reemplazar el Null adapter con una implementación AppleScript restaura Ch1 en macOS donde Spotify.app esté instalado — sin cambios de arquitectura (el factory, composition root, SpotifyChannel, gating ya están en su lugar).

## What Changes

- **`catodo/infrastructure/macos/spotify_client.py`** — `DbusslessSpotifyClient` reemplazado por `ApplescriptSpotifyClient`. Implementa el port usando `osascript` contra `application "Spotify"`:
  - `is_available()`: chequea `/Applications/Spotify.app` (sin lanzar la app).
  - `play/pause/next/previous`: un `osascript -e 'tell application "Spotify" to ...'` cada uno.
  - `set_volume(level)`: `set sound volume to N` (0–100).
  - `open_uri(uri)`: `tell application "Spotify" to open location "spotify:..."` — abre Spotify con el URI.
  - `get_state()`: **un solo `osascript`** que devuelve `{player_state, name, artist, album, id, position, artwork_url}` en un AppleScript record → dict Python. Una llamada, no seis.
- **`catodo/infrastructure/factory.py`** — `build_spotify_client()` en macOS retorna `ApplescriptSpotifyClient` en vez de `DbusslessSpotifyClient`. El gating automático omite Ch1 si `is_available() == False` (Spotify.app no instalado).
- **`catodo/channels/spotify.py`** — `_launch_minimized()` agrega rama macOS: `_hide_macos()` minimiza la ventana de Spotify con AppleScript `set miniaturized of window 1 to true`. Las ramas existentes (`_hide_hyprland`, `_minimize_xdotool`) siguen funcionando en Linux sin cambios.
- **`backend/catodo/infrastructure/macos/spotify_client.py`** eliminado — el archivo se reemplaza.
- **`backend/tests/test_dbusless_spotify.py`** → renombrar a `test_applescript_spotify.py` con tests del nuevo adapter.
- **`README.md`** — sección macOS: documentar que Spotify.app debe estar instalado y el permiso TCC Automation (System Settings → Privacy & Security → Automation → permitir Terminal/iTerm).

Sin breaking changes en Linux ni en API HTTP. Spotify en Linux sigue por DBus/MPRIS.

## Impact

- 1 archivo reemplazado (`macos/spotify_client.py`), 1 helper nuevo en `channels/spotify.py`, 1 línea en factory, 1 test file renombrado, README
- ~150 líneas diff total (incluyendo tests)
- Sin tocar la arquitectura hexagonal existente — el port ya está definido, solo se implementa la rama macOS

## Non-goals

- `DbusslessSpotifyClient` se BORRA (no se mantiene). Si el usuario quiere probar el comportamiento Null en CI, el factory ya retorna la implementación real y el test se ajusta.
- Spotify WebSocket / Connect API — sigue siendo path de Linux (vía DBus), no se intenta en mac.
- Linux no recibe cambios — su rama `DbusSpotifyClient` sigue intacta.
- Notarización / firma del osascript wrapper — fuera de alcance; el usuario aprueba el permiso TCC la primera vez.