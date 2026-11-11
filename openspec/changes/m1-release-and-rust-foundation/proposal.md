## Why

Cátodo hoy solo se instala desde el repo con `uv`, `npm` e `install.sh`; no hay CI, releases versionados ni un canal de instalación para usuarios. El backend Rust que queremos construir tampoco tiene un esqueleto que fije el contrato HTTP/WS. Sin una base de distribución y un walking skeleton, cada milestone de la migración arriesga romper la app y el instalador.

## What Changes

- **Release engineering**: CI en GitHub Actions para Linux y macOS; `release-please` con Conventional Commits; `VERSION` como fuente única; artefactos versionados con checksums.
- **App macOS única**: el backend viaja dentro de `Catodo.app/Contents/Resources/backend/` y Electron lo lanza como sidecar en un puerto loopback libre. No hay formula, `brew services` ni token de tap.
- **Homebrew**: un solo cask estático `catodo` en el tap existente `quicio/homebrew-tap` (el mismo de Candil), con `version :latest`, `sha256 :no_check` y URL a `releases/latest/download`. No se actualiza en cada release.
- **Empaquetado macOS**: bundle PyInstaller transitorio dentro del `.app`; cuando Rust alcance paridad, el sidecar pasa a ser el binario Rust y se elimina PyInstaller.
- **Empaquetado Linux**: AppImage/.deb + tarball fuente con `static/` ya construido; `install.sh` y systemd siguen siendo el camino hasta que el backend Rust permita un AppImage autocontenido.
- **Rust como camino principal**: `rust/` con `catodo-domain`, `catodo-platform` y `catodo-server`; M1 expone `GET /api/health` y `GET /api/version` en `:8769`; M2–M5 portan el resto del backend con Python como oráculo.
- **Versión visible**: `GET /api/version` en Python y Rust; `catodo --version`; chequeo de consistencia entre manifests.

## Milestones

- **M1 (este change)**: release + app macOS única con sidecar Python + walking skeleton Rust.
- **M2**: paridad de dominio/plataforma para config/store/events, `/api/config`, `/api/state` y `/api/ws`.
- **M3**: channels + plugins + `/api/channels`; portar un canal nativo (Spotify/MPRIS con `zbus`).
- **M4**: paridad completa de API, dual-run con tests de contrato, sidecar Rust dentro del `.app` y AppImage Linux autocontenido.
- **M5**: cutover, retirar Python/PyInstaller/uv del release y limpiar.

## Capabilities

### New Capabilities
- `release-engineering`: versionado, CI, artefactos, app macOS autocontenida y cask estático.
- `rust-backend-foundation`: workspace de crates, contrato health/version, límites de capas y CI; sin cutover.

### Modified Capabilities
- `backend-api`: nuevo `GET /api/version` con la versión de release.
- `frontend-kiosk`: la app empaquetada lanza y apaga el backend sidecar; dev sigue en `:8765`.
- `testing-tooling`: el gate incluye los checks de Rust cuando el workspace existe.

## Impact

- Nuevos: `.github/workflows/`, `.release-please-*`, `VERSION`, `CHANGELOG.md`, `packaging/macos/`, `rust/`, `scripts/check-rust.sh`, `scripts/check-version.sh`.
- Modificados: `backend/catodo/{__init__,api,main,plugin_system}.py`, `frontend/electron/main.cjs`, `frontend/package.json`, `clients/tray/Cargo.toml`, `scripts/check.sh`, `build.sh`, `README.md`.
- Externo: tap existente `quicio/homebrew-tap` (ya distribuye Candil), sin `HOMEBREW_TAP_TOKEN`; runners macOS arm64 + Linux x86_64.
- Sin migración de datos; solo se agrega `/api/version` a la API pública.

## Non-goals

- Formula de backend, `brew services`, `HOMEBREW_TAP_TOKEN` y actualización del tap por release.
- Cutover a Rust en M1, Windows, Linux arm64, notarización Apple, auto-update y canales nuevos.
- Self-contained Linux con Python: el AppImage autocontenido llega en M4 con el sidecar Rust.
- Mantener PyInstaller a largo plazo: es transitorio hasta M4.
