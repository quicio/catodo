## Context

Ver `proposal.md` para la motivación. El estado actual que condiciona el diseño:

- No existe `.github/`: no hay CI ni release pipeline.
- La versión `0.1.0` está duplicada en `backend/pyproject.toml`, `backend/catodo/__init__.py`, `backend/catodo/main.py` (FastAPI), `backend/catodo/plugin_system.py` (`CATODO_VERSION`), `frontend/package.json` y `clients/tray/Cargo.toml`.
- `build.sh` compila el frontend, lo copia a `backend/static/` y genera AppImage/.deb o `.app`/zip. El AppImage no incluye el backend: el backend corre como servicio aparte.
- `install.sh` ya detecta Linux/macOS, instala dependencias y genera el unit de systemd en Linux; en macOS solo imprime pasos manuales de autostart.
- La app Electron empaquetada usa `CATODO_PORT || 8765`, pero el backend de producción corre en `8767`; instalada desde Homebrew no encontraría el servicio.
- `backend/catodo/plugin_system.py` resuelve `plugins-repo` y `main.py` resuelve `static/` por posición de `__file__`; ambos caminos se rompen dentro de un bundle.
- El repo ya tiene un cliente Rust separado en `clients/tray` (Tauri) con su propio workspace; el nuevo workspace de backend no debe mezclarse con él.
- La change `replicable-installation-and-config` ya cubre `install.sh` parametrizado, systemd con rutas reales y `CATODO_BACKEND_URL`; este change la complementa y no reabre sus decisiones.

## Goals / Non-Goals

**Goals:**

- Un release `vX.Y.Z` reproducible que produzca artefactos por plataforma con checksums.
- Instalación macOS de un solo comando (`brew install --cask quicio/tap/catodo`), sin formula ni servicio.
- Que la app empaquetada arranque su backend sidecar y lo apague sin configuración manual.
- Un workspace Rust que compile, testee y corra en CI sin afectar el backend Python.
- Que la versión sea una sola y verificable en todos los manifests y endpoints.

**Non-Goals:**

- Reemplazar FastAPI en M1; el servidor Rust solo expone health y versión, y la migración completa es M2–M5.
- Bundlear el backend Linux con PyInstaller; PyGObject/DBus hace ese bundle frágil y se resolverá cuando el backend Rust elimine esa dependencia.
- Notarización Apple, auto-update, Windows, Linux arm64 y Homebrew en Linux.
- Migrar el cliente tray al workspace nuevo; sigue siendo un workspace Tauri independiente.

## Decisions

### D1. Un change con dos frentes, un solo milestone

**Por qué**: release/instalación y el walking skeleton Rust comparten la versión, el CI y el contrato HTTP; planificarlos juntos evita dos definiciones de versión y dos workflows que se pisen. La implementación se puede dividir en dos series de commits dentro del mismo change.

**Alternativa**: dos changes separados (`release-engineering` y `rust-backend-foundation`). Es más limpio para archivar por separado, pero duplica configuración de CI/versión y retrasa el primer entregable.

### D2. `VERSION` como fuente única y release-please en modo root

**Por qué**: un solo archivo canónico evita que backend, app y Rust deriven. `release-please` con `release-type: simple`, `version-file: VERSION` y `extra-files` actualiza los manifests en un único PR. `CHANGELOG.md` queda en la raíz.

Archivos que actualiza el PR de release:

- `VERSION`
- `backend/pyproject.toml` (`$.project.version`)
- `frontend/package.json` (`$.version`)
- `frontend/package-lock.json` (`$.version` y `$.packages[""].version`)
- `clients/tray/Cargo.toml` (`$.package.version`)
- `rust/Cargo.toml` (`$.workspace.package.version`)

Los crates Rust usan `version.workspace = true`; no se tocan uno por uno. Un workflow sobre PRs de release-please corre `scripts/sync-version-locks.sh` (`cargo update --workspace` en `rust/` y `clients/tray/`, `npm install --package-lock-only`) y commitea los lockfiles si cambiaron.

**Alternativas**:
- Multi-package release-please con `linked-versions`: más correcto para monorepos grandes, pero más configuración y varios PRs para un producto que se versiona junto.
- Bump manual en un script: simple, pero no cumple “cut release automático”.

### D3. CI y release con GitHub Actions, matriz Linux + macOS

**Por qué**: el remoto es GitHub, no hay CI previo y los runners cubren las dos plataformas del entregable. La matriz es `ubuntu-22.04` (x86_64, glibc compatible con AppImage/deb) y `macos-14` (arm64).

Workflows:

- `ci.yml`: en PR y push a `main`.
  - `backend`: `uv sync --group dev`, `ruff check`, `pytest`, en Linux y macOS.
  - `frontend`: `npm ci`, `npm run typecheck`, `npm run build`, en Linux y macOS.
  - `rust`: toolchain estable, caché, `scripts/check-rust.sh` y `scripts/check-rust-layers.sh`, en Linux y macOS.
  - `version`: `scripts/check-version.sh`.
- `release-please.yml`: en push a `main`, abre/actualiza el PR de release.
- `release.yml`: en `release: published`, construye artefactos, los sube al release y actualiza el tap.
- `release-pr-sync.yml`: en PRs con label `autorelease: pending`, sincroniza lockfiles.

**Alternativas**: CircleCI/GitLab descartados por fricción con el remoto; un solo job monolítico descartado porque un fallo de frontend no debe ocultar el de Rust.

### D4. Un solo artefacto macOS: la app con el backend adentro

**Por qué**: el usuario quiere una sola instalación y el destino es un backend Rust estático. Meter el backend en `Catodo.app/Contents/Resources/backend/` elimina la formula, el servicio launchd, el `HOMEBREW_TAP_TOKEN` y la coordinación de dos paquetes. El cask queda estático como el de Candil y el release no toca el tap.

Artefactos:

| plataforma | artefacto | contenido |
|---|---|---|
| macOS arm64 | `Catodo-<v>-mac-arm64.zip` | `Catodo.app` + backend en `Contents/Resources/backend/` |
| Linux x86_64 | `Catodo-<v>-linux-x86_64.AppImage`, `.deb` | app Electron; backend vía `install.sh`/systemd en M1 |
| Linux x86_64 | `catodo-<v>-src.tar.gz` | fuente + `backend/static/` construido + `install.sh` |

`SHA256SUMS` cubre todos. No se publica un tarball de backend separado.

**Alternativa**: formula + cask separados (lo que habíamos diseñado). Se descarta porque agrega un servicio, un token y un tap que se actualiza por release, justo lo que la app única evita.

### D5. PyInstaller transitorio dentro del `.app`

**Por qué**: hasta que Rust alcance paridad, el backend sigue siendo Python. El bundle PyInstaller onedir ya funciona (39 MB, 23 MB comprimido) y se copia a `Catodo.app/Contents/Resources/backend/` antes de armar el zip. En M4 se reemplaza por el binario Rust y se elimina PyInstaller.

Reglas:

- `--onedir`, `--name catodo-backend`, `--exclude-module gi`, `tkinter`, `pytest`.
- Incluye `static/`, `plugins-repo/` y `VERSION`.
- Smoke test: `--version`, arranque en puerto libre, `/api/health`, `/api/version` y `/`.
- El binario se ejecuta sin Python del sistema.

**Alternativa**: embeber Python en Electron con un runtime completo. Más pesado y no resuelve nada que PyInstaller no resuelva en macOS.

### D6. Ciclo de vida del sidecar en Electron

**Por qué**: la app es la dueña del backend cuando está empaquetada. Si no lo arranca y apaga bien, quedan procesos huérfanos o puertos ocupados.

Flujo en `frontend/electron/main.cjs`:

1. Si `CATODO_BACKEND_URL` está seteado, usarlo y no spawnear.
2. Si `app.isPackaged` y existe `process.resourcesPath/backend/catodo-backend`, pedir un puerto libre a `net`, spawnear el binario con `CATODO_HOST=127.0.0.1`, `CATODO_PORT=<libre>`, `CATODO_DATA_DIR` y logs en `app.getPath("logs")`.
3. Esperar `/api/health` con timeout (20 s) y reintentos cortos.
4. Cargar la UI desde `http://127.0.0.1:<puerto>`.
5. En `before-quit`, SIGTERM; si no sale en 3 s, SIGKILL.
6. Si el sidecar muere, mostrar la página de error con reintento; el reintento vuelve a spawnear.
7. Si no hay binario embebido (Linux M1), caer al probe `:8767` → `:8765`.

El backend sigue sirviendo el frontend estático, así que la UI y la API comparten origen y WebSocket.

**Alternativa**: que la app espere un servicio externo. Es lo que hacíamos con la formula; se descarta porque el usuario quiere una sola instalación.

### D7. Cask estático, sin formula ni token

**Por qué**: el cask de Candil ya usa `version :latest`, `sha256 :no_check` y `releases/latest/download`; no necesita actualizarse por release. Cátodo puede usar el mismo tap existente `quicio/homebrew-tap`.

- `Casks/catodo.rb`: `version :latest`, `sha256 :no_check`, URL `https://github.com/quicio/catodo/releases/latest/download/Catodo-mac-arm64.zip`, `app "Catodo.app"`, `postflight_steps` para quitar cuarentena, `zap trash: ["~/.local/share/catodo"]`.
- No hay `Formula/catodo.rb`, no hay `brew services`, no hay `HOMEBREW_TAP_TOKEN`, no hay job `tap` en el release.
- El cask se agrega una vez al tap y no cambia por release.

**Alternativa**: formula + cask versionados. Se descarta por el costo de servicio/token y porque el destino Rust hace innecesario el servicio separado.

### D8. Optimización del empaquetado Electron

**Por qué**: el artefacto actual no declara `asar`, compresión ni idiomas, y el release no reporta tamaños. Ajustes en `frontend/package.json`:

- `asar: true`, `compression: "maximum"`.
- `electronLanguages: ["en-US", "es"]`.
- `files` con exclusiones de `**/*.map`, tests del frontend y archivos de documentación de dependencias.
- `artifactName` estable: `Catodo-${version}-${os}-${arch}.${ext}`.
- `npmRebuild: false` (no hay módulos nativos).
- `mac.target: ["zip"]` para el cask; `linux.target: ["AppImage", "deb"]`.

El workflow mide tamaños con `du -h` y los publica en el resumen del job. El frontend se construye una vez y se copia a `backend/static` para reutilizarlo.

**Alternativa**: `electron-builder` con `--dir` y compresión externa; descartado por perder los targets de Homebrew y `.deb`.

### D9. Linux sigue con `install.sh` + systemd

**Por qué**: el backend Linux depende de PyGObject/DBus del sistema; un bundle autocontenido requeriría empaquetar GLib/GIO y typelibs, algo frágil entre distros. M1 mantiene la instalación desde el tarball fuente (que ya trae `static/` construido), con `uv sync --no-dev`, systemd de usuario y AppImage/.deb como cliente. El bundle Linux autocontenido se habilita en M4 cuando el backend Rust reemplace las dependencias OS-touched.

El tarball fuente se genera con `git archive` + overlay de `backend/static/` y `VERSION`, excluyendo `.git`, `node_modules`, `.venv`, `dist`, `release`, `target` y cachés. `install.sh` no cambia su contrato de flags; solo recibe el árbol ya construido.

### D10. Workspace Rust `rust/` con tres crates

**Por qué**: separa dominio puro, adaptadores de plataforma y transporte HTTP, y prepara la migración por capas sin mezclarse con `clients/tray`.

```
rust/
  Cargo.toml            # [workspace], version/edition/license/rust-version heredados
  Cargo.lock
  rust-toolchain.toml   # stable
  crates/catodo-domain/ # tipos puros: Health, VersionInfo
  crates/catodo-platform/ # PlatformInfo, data_dir()
  crates/catodo-server/ # axum, main, router, tests
```

Dependencias:

- `catodo-domain`: `serde`; sin `tokio`, `axum`, `hyper` ni `std::process`.
- `catodo-platform`: solo `std` en M1; sin `axum`, sin `catodo-server`.
- `catodo-server`: `axum`, `tokio`, `serde`, `serde_json`, `tracing`, `tracing-subscriber`, `anyhow`; dev: `tower`, `http-body-util`.

`scripts/check-rust-layers.sh` usa `cargo metadata --no-deps` y `python3` para validar las aristas; falla con un mensaje que nombra el crate y la dependencia prohibida.

**Alternativa**: un solo crate `catodo` con módulos. Más simple, pero no fija los límites que la migración necesita y permite que el dominio se llene de HTTP.

### D11. Contrato del servidor Rust

**Por qué**: M1 debe ser un walking skeleton que se pueda comparar con Python, no un servidor a medio hacer.

- `GET /api/health` → `200 {"status":"ok"}` exacto, `Content-Type: application/json`.
- `GET /api/version` → `200 {"version":"<VERSION>"}` exacto.
- Fallback 404 con `{"detail":"Not Found"}` para no divergir de FastAPI en el contrato básico.
- Bind default `127.0.0.1:8769`; `CATODO_RS_BIND`, `CATODO_RS_PORT`.
- `RUST_LOG` con `tracing-subscriber` y `EnvFilter`; logs a stdout.
- `SIGINT`/`SIGTERM` con `axum::serve(...).with_graceful_shutdown`.
- Tests de contrato con `tower::ServiceExt::oneshot` y fixtures JSON en `rust/contract/`; sin sockets.
- El crate `catodo-server` expone `lib.rs` con `router(state)` para tests y `main.rs` para el binario.

**Alternativa**: usar actix-web. Axum tiene mejor integración con tower/tokio y menos superficie para un walking skeleton.

### D12. Gate local y CI

`scripts/check.sh` mantiene el gate Python/TS y agrega:

- `scripts/check-version.sh` (siempre).
- `scripts/check-rust.sh` si `rust/Cargo.toml` existe y `cargo` está disponible; en CI (`CATODO_CI=1`) la ausencia de `cargo` es fallo.
- `scripts/check-rust-layers.sh` dentro de `check-rust.sh`.

Esto permite que un dev sin Rust siga trabajando en Python/TS, pero CI nunca acepta un workspace roto.

### D13. ADRs requeridos

Antes de implementar, se agregan a `docs/adr/`:

- **ADR-0005 — Release y packaging**: `VERSION` único, release-please, app macOS única con backend embebido, PyInstaller transitorio y cask estático sin formula.
- **ADR-0006 — Workspace Rust y migración completa**: crates, límites de capas, puerto 8769, no-cutover en M1 y Rust como camino principal hasta M5.

Cumplen la regla de `AGENTS.md` de ADR obligatorio por dependencia nueva (PyInstaller, release-please, axum/tokio/serde).

## Risks / Trade-offs

- **[PyInstaller rompe imports dinámicos de uvicorn/FastAPI]** → spec file versionado, `collect_submodules`, smoke test de arranque real en CI y `--exclude-module gi`.
- **[La app macOS sin notarizar la bloquea Gatekeeper]** → caveat en el cask, documentar `xattr -dr com.apple.quarantine`; notarización queda para M2/M5.
- **[El cask `version :latest` no fija una versión ni verifica sha256]** → es el mismo trade-off que Candil; el release publica `SHA256SUMS` para verificación manual y el cask apunta a `latest/download`.
- **[El sidecar puede quedar huérfano o no cerrar]** → SIGTERM + timeout + SIGKILL en `before-quit`; logs en `app.getPath("logs")` y test manual de cierre.
- **[El puerto libre puede ser tomado entre el probe y el spawn]** → el backend falla con error claro y la app reintenta con otro puerto; el health check tiene timeout.
- **[Adoptar Conventional Commits cuesta]** → release-please solo mira commits nuevos; se documenta en `AGENTS.md`/README y se usa el formato en los commits del repo (ya hay `feat:`/`fix:`/`docs:` recientes).
- **[Pre-1.0: breaking changes bumps minor]** → documentado; si se necesita major, se puede forzar con `Release-As` en el commit.
- **[El tarball fuente Linux no es autocontenido]** → release notes explican que Linux usa `install.sh` + deps del sistema; el bundle autocontenido llega con el backend Rust en M4.
- **[La app macOS crece al incluir el backend]** → el bundle PyInstaller comprimido son ~23 MB; se mide y se reporta en el release. En M4 el binario Rust lo reemplaza y baja el tamaño.
- **[Duplicación de dominio Python/Rust]** → M1 solo health/version; los tests de contrato fijan la forma y M2 porta dominio con la suite Python como oráculo.
- **[El bundle macOS y el repo pueden resolver `static/`/plugins distinto]** → una sola función de resolución con env override y smoke test que sirve el index estático.
- **[Cambiar la versión no actualiza Cargo.lock]** → workflow `release-pr-sync` corre `cargo update --workspace` y commitea el lockfile en el PR de release.

## Migration Plan

1. **ADRs**: escribir ADR-0005 y ADR-0006.
2. **Versión**: agregar `VERSION`, `catodo/version.py`, `/api/version`, `catodo --version`, `scripts/check-version.sh`; reemplazar los literales `0.1.0`/`CATODO_VERSION`.
3. **Release Please**: config, manifest, workflow y `release-pr-sync`.
4. **CI**: `ci.yml` con backend/frontend/rust/version en Linux y macOS.
5. **Bundle macOS**: resolver `static/`/plugins, spec de PyInstaller, smoke test y copia a `Catodo.app/Contents/Resources/backend/`.
6. **Sidecar Electron**: spawn en puerto libre, health wait, logs, SIGTERM/SIGKILL en quit y página de error.
7. **Linux**: tarball fuente con static, ajustes de electron-builder y artefactos AppImage/.deb.
8. **Homebrew**: agregar el cask estático `catodo` al tap existente `quicio/homebrew-tap`; sin formula ni token.
9. **Rust**: workspace, crates, endpoints, tests de contrato, `check-rust.sh`, `check-rust-layers.sh` y job de CI.
10. **Validación**: cortar un release candidato en una rama, instalar en macOS limpio (`brew install --cask`) y Linux limpio (`install.sh`), correr `scripts/check.sh` y verificar checksums.

Rollback: los releases de GitHub son inmutables; se puede descargar el zip anterior e instalarlo a mano. `brew uninstall --cask catodo` no toca `~/.local/share/catodo/`; `--zap` es explícito. El servidor Rust no participa del release, así que apagarlo es simplemente no ejecutarlo.

## Open Questions

Ninguna que cambie specs, enfoque o tasks. La notarización Apple y el self-contained Linux se resuelven en milestones posteriores.
