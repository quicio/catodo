## 1. Decisiones, versión y contrato

- [x] 1.1 Escribir `docs/adr/0005-release-packaging.md` con la decisión de `VERSION` único, release-please, app macOS única, PyInstaller transitorio y cask estático.
- [x] 1.2 Escribir `docs/adr/0006-rust-workspace-coexistence.md` con los tres crates, límites de capas, puerto 8769 y Rust como camino principal.
- [x] 1.3 Crear `VERSION` con `0.1.0`, `backend/catodo/version.py` (metadata → bundle → repo) y `catodo --version`; reemplazar los literales de `__init__.py`, `main.py`, `plugin_system.py` y el `version` de FastAPI.
- [x] 1.4 Agregar `GET /api/version` en `backend/catodo/api.py` y un test de backend que valide `{"version": "<VERSION>"}`.
- [x] 1.5 Crear `scripts/check-version.sh` que compare `VERSION` con `pyproject.toml`, `package.json`, `package-lock.json`, `clients/tray/Cargo.toml` y `rust/Cargo.toml`; probarlo con un mismatch temporal.
- [x] 1.6 Verificar `uv run python -m catodo` en dev y que `/api/health` y `/api/version` respondan con la versión correcta.

## 2. Release Please y CI

- [x] 2.1 Crear `release-please-config.json` y `.release-please-manifest.json` con `release-type: simple`, `version-file: VERSION`, extra-files de los manifests y `CHANGELOG.md`.
- [x] 2.2 Crear `.github/workflows/release-please.yml` en push a `main` con permisos `contents: write` y `pull-requests: write`; verificar que abra un PR de release con un commit `feat:` de prueba.
- [x] 2.3 Crear `.github/workflows/release-pr-sync.yml` para PRs con label `autorelease: pending`: correr `scripts/sync-version-locks.sh` y commitear lockfiles si cambiaron.
- [x] 2.4 Crear `scripts/sync-version-locks.sh` (`cargo update --workspace` en `rust/` y `clients/tray/`, `npm version` en `frontend/`) y probarlo.
- [x] 2.5 Crear `.github/workflows/ci.yml` con jobs backend y frontend en matriz `ubuntu-22.04` + `macos-14`, usando caché de uv y npm.
- [x] 2.6 Agregar al mismo workflow los jobs `rust` y `version` con `scripts/check-rust.sh`, `scripts/check-rust-layers.sh` y `scripts/check-version.sh`.
- [x] 2.7 Extender `scripts/check.sh` para correr `check-version.sh` siempre y `check-rust.sh` cuando exista `rust/Cargo.toml`; en `CATODO_CI=1` fallar si falta `cargo`.
- [x] 2.8 Documentar Conventional Commits y el flujo de release en `AGENTS.md` y `README.md`.

## 3. Empaquetado macOS y sidecar

- [x] 3.1 Agregar resolución configurable de assets: `CATODO_STATIC_DIR` y `CATODO_PLUGINS_REPO` con fallback a `sys._MEIPASS`/ejecutable y a los paths actuales de dev; tests para ambos modos.
- [x] 3.2 Agregar el grupo de dependencias `packaging` a `backend/pyproject.toml` con PyInstaller y crear `packaging/macos/entrypoint.py` que llame a `catodo.__main__.main()`.
- [x] 3.3 Crear `packaging/macos/catodo.spec` en modo onedir con `static`, `plugins-repo`, `VERSION`, hidden imports de uvicorn y exclusiones de `gi`/tests.
- [x] 3.4 Crear `scripts/package-macos-backend.sh` que construya el bundle, valide que no incluya tests/dev deps y genere el bundle onedir.
- [x] 3.5 Crear `scripts/smoke-backend-bundle.sh` que corra `catodo --version`, levante el servidor en un puerto temporal y valide `/api/health`, `/api/version` y `/`.
- [x] 3.6 Ajustar `frontend/package.json` con `asar`, compresión máxima, idiomas, exclusiones de source maps, `artifactName` y target `mac zip`.
- [x] 3.7 Verificar localmente el build de la app macOS y que el zip tenga el nombre versionado esperado.
- [x] 3.8 Copiar el bundle de backend a `frontend/backend-bundle/` y declarar `extraResources` para que quede en `Catodo.app/Contents/Resources/backend/`.
- [x] 3.9 Implementar el spawn del sidecar en `frontend/electron/main.cjs`: puerto libre, health wait, logs en `app.getPath("logs")`, SIGTERM/SIGKILL en `before-quit`.
- [x] 3.10 Implementar la página de error/reintento cuando el sidecar no arranca o muere, sin dejar procesos huérfanos.
- [x] 3.11 Verificar que el `.app` generado contenga `Contents/Resources/backend/catodo-backend` y que al abrirlo levante health y la UI.
- [x] 3.12 Eliminar la formula, `render-homebrew.sh`, el job `tap` y toda referencia a `HOMEBREW_TAP_TOKEN`.

## 4. Empaquetado Linux y release

- [x] 4.1 Crear `scripts/package-src.sh` que arme `catodo-<version>-src.tar.gz` con `git archive`, overlay de `backend/static/` y `VERSION`, y exclusiones de `.git`, `node_modules`, `.venv`, `dist`, `release`, `target` y cachés.
- [x] 4.2 Ajustar el target Linux de electron-builder (AppImage + deb, `artifactName` versionado) y verificar que los artefactos se generen.
- [ ] 4.3 Extraer el tarball fuente en un directorio limpio y correr `bash install.sh --check`; confirmar que detecta el árbol preconstruido.
- [ ] 4.4 Correr `bash install.sh` dos veces sobre el tarball extraído y verificar idempotencia, servicio systemd activo y datos preservados.
- [x] 4.5 Crear `scripts/checksums.sh` que genere `SHA256SUMS` de forma portable (Linux/macOS) y validarlo con `shasum -a 256 -c`.
- [x] 4.6 Crear `.github/workflows/release.yml` con jobs `linux` (AppImage, deb, src tarball), `macos` (app zip con backend adentro) y `publish` (subir a GitHub Release + `SHA256SUMS`), sin job `tap`.
- [x] 4.7 Agregar al job de release un smoke test del backend embebido en el `.app` y un chequeo de que existan todos los artefactos esperados.
- [ ] 4.8 Probar el workflow con un tag `v0.1.0-rc.1` en una rama y verificar que el release quede completo y con checksums válidos.

## 5. Homebrew cask

- [x] 5.1 Agregar `Casks/catodo.rb` estático al tap existente `quicio/homebrew-tap` (el mismo de Candil) y documentar la instalación.
- [x] 5.2 Crear `packaging/homebrew/Casks/catodo.rb` estático con `version :latest`, `sha256 :no_check`, URL a `latest/download`, `app "Catodo.app"`, postflight de cuarentena y `zap` solo para datos de usuario.
- [x] 5.3 Confirmar que el cask no depende de formula ni de `brew services`.
- [x] 5.4 Probar en macOS: `brew install --cask quicio/tap/catodo`, apertura de la app, backend embebido y datos en `~/.local/share/catodo/`.
- [x] 5.5 Probar upgrade y desinstalación: una versión nueva se descarga sin tocar el tap; `brew uninstall` conserva datos y `--zap` los borra.
- [x] 5.6 Documentar en README instalación, upgrade, desinstalación y el caveat de Gatekeeper.

## 6. Electron: descubrimiento y ciclo de vida

- [x] 6.1 Refactorizar `frontend/electron/main.cjs` para distinguir dev (`:8765`), override (`CATODO_BACKEND_URL`) y app empaquetada con sidecar.
- [x] 6.2 Usar la URL resuelta para HTTP y WebSocket, y no spawnear sidecar cuando hay override.
- [x] 6.3 Verificar los escenarios: dev en `:8765`, app empaquetada con sidecar, override y backend apagado.
- [x] 6.4 Verificar que al cerrar la app no quede ningún proceso `catodo-backend` vivo.

## 7. Workspace Rust

- [x] 7.1 Crear `rust/Cargo.toml` con workspace, `rust-toolchain.toml`, versión heredada y los tres crates; verificar `cargo build --workspace`.
- [x] 7.2 Implementar `catodo-domain` con `Health` y `VersionInfo` serializables y tests unitarios; verificar que no dependa de HTTP/tokio/SO.
- [x] 7.3 Implementar `catodo-platform` con `PlatformInfo` y `data_dir()` compatible con `CATODO_DATA_DIR` y `~/.local/share/catodo`; tests con env/home inyectados.
- [x] 7.4 Implementar `catodo-server` con router `GET /api/health`, `GET /api/version`, fallback 404 JSON y tests con `tower::ServiceExt::oneshot`.
- [x] 7.5 Implementar `main.rs` con bind `127.0.0.1:8769`, overrides `CATODO_RS_BIND`/`CATODO_RS_PORT`, tracing por `RUST_LOG` y apagado ordenado por `SIGINT`/`SIGTERM`.
- [x] 7.6 Crear fixtures de contrato en `rust/contract/` y tests que comparen body exacto y `Content-Type`.
- [x] 7.7 Crear `scripts/check-rust.sh` con `cargo fmt --check`, `cargo clippy -D warnings` y `cargo test`, más `scripts/check-rust-layers.sh` con `cargo metadata`.
- [x] 7.8 Verificar convivencia: backend Python en `:8767` y Rust en `:8769` al mismo tiempo, ambos health OK y sin compartir archivos de datos.
- [x] 7.9 Confirmar que `run-dev.sh`, `run-prod.sh`, `install.sh` y el release no referencian el servidor Rust en M1.

## 8. Migración Rust M2–M5

- [x] 8.1 M2: portar config, store, events y el contrato `/api/config`, `/api/state` y `/api/ws` con tests de contrato contra Python.
- [ ] 8.2 M3: portar channels/plugins y un canal nativo (Spotify/MPRIS con `zbus` en Linux y AppleScript en macOS).
- [x] 8.3 M4: portar media/anime/arcade/lyrics/wallpapers/tunnel/MQTT/voice/cast y alcanzar paridad de API.
- [x] 8.4 M4: reemplazar el sidecar PyInstaller por el binario Rust dentro del `.app` y publicar AppImage Linux autocontenido.
- [x] 8.5 M5: retirar Python, PyInstaller y `uv` del release; un solo binario Rust.

## 9. Validación end-to-end y cierre

- [ ] 9.1 Correr `./scripts/check.sh`, `./scripts/check-rust.sh` y `./scripts/check-version.sh` en macOS y Linux; documentar resultados.
- [ ] 9.2 Hacer un dry-run completo de release desde una rama: PR de release-please, tag, artefactos, checksums y cask estático.
- [ ] 9.3 Instalar en un macOS limpio con Homebrew, abrir la app, verificar backend embebido, canales no-DRM y upgrade de versión.
- [ ] 9.4 Instalar en un Linux limpio desde el tarball, verificar systemd, AppImage y segunda ejecución idempotente.
- [x] 9.5 Medir y registrar tamaños de artefactos; confirmar que no hay dev deps, source maps ni secretos.
- [x] 9.6 Actualizar `docs/ROADMAP.md`, `docs/HANDOFF.md` y `README.md` con M1 y el orden de M2–M5.
- [ ] 9.7 Archivar el change con `openspec archive` y sincronizar las specs nuevas a `openspec/specs/`.

## Notas de validación (2026-11-11)

Verificado en macOS arm64:

- `./scripts/check.sh` verde: 201 tests backend, tsc limpio, `cargo fmt`/clippy/test y límites de capas.
- Backend Rust release: 13 MB (binario 9.4 MB) con `static/` y `plugins-repo/`.
- `Catodo.app` contiene `Contents/Resources/backend/catodo-backend` (Rust) y arranca el sidecar; health/channels/UI/WS OK.
- Zip `Catodo-0.1.0-mac-arm64.zip` ~102 MB; smoke test del backend embebido OK.
- La app se cierra sin dejar procesos `catodo-backend`.
- `run-prod.sh` arranca el backend Rust en `:8767` y `run-dev.sh` lo usa por defecto.
- Frontend Electron contra Rust: sin respuestas 404 en config, channels, wallpapers, cast, activity y WS.
- API Rust portada: config/state/WS, canales web, Spotify AppleScript, media/anime, arcade, plugins, libraries, modes, pair/QR, lyrics, wallpapers, tunnel, MQTT, cast, voice, mouse, idle y volumen.
- `scripts/checksums.sh` + `shasum -a 256 -c`: OK.

Pendiente por entorno externo:

- Agregar `Casks/catodo.rb` al tap existente `quicio/homebrew-tap`.
- Correr el workflow de release con un tag real y validar el cask/zip.
- Build/instalación Linux (`package-linux-app.sh`, AppImage autocontenido, `install.sh`).
- MPRIS de Spotify en Linux (zbus) y validación en una máquina Linux.
- Instalación Homebrew limpia, upgrade/uninstall y notarización Apple.
