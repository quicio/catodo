## Purpose

Define cómo Cátodo se versiona, se construye en CI y se distribuye: releases reproducibles por plataforma, una app macOS autocontenida con el backend adentro y un cask estático de Homebrew que no requiere actualizarse en cada release.

## ADDED Requirements

### Requirement: Fuente única de versión

El repositorio SHALL tener `VERSION` en la raíz como única fuente de verdad de la versión semver del producto. Los manifests de backend (`backend/pyproject.toml`), frontend (`frontend/package.json` y `frontend/package-lock.json`), tray (`clients/tray/Cargo.toml`) y workspace Rust (`rust/Cargo.toml`) SHALL declarar la misma versión. `GET /api/version` y `catodo --version` SHALL reportar esa misma versión.

#### Scenario: Bump de release actualiza todos los manifests

- **WHEN** se mergea el PR de release de la versión `X.Y.Z`
- **THEN** `VERSION`, los cuatro manifests y el lockfile del frontend quedan en `X.Y.Z`, y `/api/version` y `catodo --version` devuelven `X.Y.Z`

#### Scenario: Inconsistencia detectada por el gate

- **WHEN** un manifest declara una versión distinta de `VERSION`
- **THEN** `scripts/check-version.sh` falla con un mensaje que nombra el archivo y las dos versiones

### Requirement: Release automático con release-please

El proyecto SHALL usar release-please sobre `main` para proponer releases a partir de Conventional Commits. Mientras exista un release pendiente, el bot SHALL abrir o actualizar un PR de release con bump de versión y `CHANGELOG.md`; al mergearlo SHALL crear el tag `vX.Y.Z` y publicar un GitHub Release con el changelog. Un `feat` SHALL producir bump minor, un `fix` bump patch, y un breaking change (`!` o `BREAKING CHANGE:`) SHALL producir bump major; para versiones `0.x`, release-please SHALL aplicar su regla estándar de pre-1.0.

#### Scenario: Feature genera release minor

- **WHEN** se mergea en `main` un commit `feat: agregar canal iptv`
- **THEN** release-please abre o actualiza un PR de release con la próxima versión minor y el changelog incluye ese commit

#### Scenario: Merge del release PR publica tag y release

- **WHEN** se mergea el PR de release de `0.2.0`
- **THEN** existe el tag `v0.2.0` y un GitHub Release publicado con el changelog de `0.2.0`

#### Scenario: Sin cambios relevantes no hay release

- **WHEN** los commits desde el último release son solo `docs:` o `chore:`
- **THEN** release-please no abre un PR de release

### Requirement: CI obligatorio en Linux y macOS

Cada pull request y cada push a `main` SHALL ejecutar un workflow de CI con jobs para backend (ruff + pytest), frontend (`npm ci`, typecheck y build), Rust (`cargo fmt --check`, `cargo clippy -D warnings` y `cargo test`) y consistencia de versión. Los jobs de backend, frontend y Rust SHALL correr en Linux x86_64 y macOS arm64. Un job fallido SHALL marcar el check como fallido y bloquear el merge cuando la rama lo requiera.

#### Scenario: PR con tests rojos no puede mergearse

- **WHEN** un pull request rompe un test de backend
- **THEN** el check de CI queda en rojo y el merge queda bloqueado por la protección de rama

#### Scenario: Matriz de plataformas

- **WHEN** corre CI para un pull request
- **THEN** los jobs de backend, frontend y Rust aparecen tanto en el runner Linux como en el runner macOS

### Requirement: Artefactos de release versionados

Al publicarse un GitHub Release, el workflow SHALL construir y adjuntar estos artefactos con nombre versionado:

- macOS arm64: `Catodo-<version>-mac-arm64.zip`, que contiene `Catodo.app` con el backend adentro.
- Linux x86_64: `Catodo-<version>-linux-x86_64.AppImage`, `Catodo-<version>-linux-amd64.deb` y `catodo-<version>-src.tar.gz`.
- `SHA256SUMS` con el hash de cada artefacto.

El workflow SHALL fallar si falta cualquier artefacto esperado. No SHALL publicar un tarball de backend separado como artefacto de usuario.

#### Scenario: Release completo

- **WHEN** se publica el release `v0.2.0`
- **THEN** el release contiene la app macOS, los tres artefactos Linux y `SHA256SUMS`, y cada hash coincide con su archivo

#### Scenario: Artefacto faltante falla el release

- **WHEN** el job de macOS no produce el zip de la app
- **THEN** el workflow de release falla y no se publica el release

### Requirement: App macOS autocontenida

El zip de macOS SHALL contener `Catodo.app` con el backend en `Contents/Resources/backend/`, incluyendo runtime, dependencias de producción, `static/` y `plugins-repo/`. El backend SHALL funcionar sin un Python del sistema. El binario `catodo-backend` dentro del bundle SHALL aceptar `--version`, arrancar el servidor HTTP y servir `/api/health`, `/api/version` y el frontend estático.

#### Scenario: Smoke test del bundle embebido

- **WHEN** el workflow extrae el zip, localiza `Catodo.app/Contents/Resources/backend/catodo-backend`, ejecuta `--version` y luego el servidor en un puerto libre
- **THEN** `--version` devuelve la versión del release y `GET /api/health` y `GET /api/version` responden 200 con el contrato esperado

#### Scenario: Sin Python del sistema

- **WHEN** el backend embebido se ejecuta en un runner macOS sin `python3` en `PATH`
- **THEN** arranca y responde health igualmente

### Requirement: Higiene y tamaño de artefactos

Los artefactos de producción SHALL excluir dependencias de desarrollo, tests, cachés (`.git`, `.venv`, `node_modules`, `__pycache__`, `.pytest_cache`, `target`) y source maps. El frontend SHALL construirse una sola vez por release y reutilizarse entre el bundle del backend y la app Electron. La app Electron SHALL empaquetarse con asar, compresión máxima y solo los idiomas declarados. El workflow SHALL publicar el tamaño de cada artefacto en el release o en el resumen del job.

#### Scenario: Sin dev dependencies en el backend embebido

- **WHEN** se inspecciona `Catodo.app/Contents/Resources/backend/`
- **THEN** no contiene `pytest`, `ruff`, `tests/`, `__pycache__` ni `.pyc`

#### Scenario: Reporte de tamaño

- **WHEN** termina el job de release
- **THEN** el resumen muestra el tamaño de cada artefacto publicado

### Requirement: Cask estático de Homebrew

El tap existente `quicio/homebrew-tap` SHALL contener un único cask `catodo` que instale `Catodo.app` en `/Applications`, con `version :latest`, `sha256 :no_check` y URL a `releases/latest/download/Catodo-mac-arm64.zip`, siguiendo el patrón del cask de Candil. El cask SHALL intentar quitar la cuarentena de Gatekeeper, SHALL preservar los datos de usuario al desinstalar y solo `--zap` SHALL borrar `~/.local/share/catodo/`. No SHALL existir formula `catodo`, servicio launchd ni dependencia de formula.

#### Scenario: Instalación con un solo comando

- **WHEN** en un macOS arm64 limpio se ejecuta `brew install --cask quicio/tap/catodo`
- **THEN** `Catodo.app` queda en `/Applications`, se intenta quitar la cuarentena y al abrirla arranca el backend embebido y conecta la UI

#### Scenario: El cask no se actualiza por release

- **WHEN** se publica una versión nueva y el cask sigue apuntando a `releases/latest/download`
- **THEN** una instalación nueva descarga la última versión sin que el archivo del cask cambie

#### Scenario: Desinstalación conserva datos

- **WHEN** se ejecuta `brew uninstall --cask catodo`
- **THEN** la app se elimina y `~/.local/share/catodo/` sigue existiendo

### Requirement: Release sin token de tap

El workflow de release NO SHALL requerir `HOMEBREW_TAP_TOKEN` ni escribir en `quicio/homebrew-tap`. La publicación SHALL limitarse a construir artefactos y subirlos al GitHub Release; el cask estático SHALL seguir funcionando porque apunta a `latest/download`.

#### Scenario: Release sin secretos de tap

- **WHEN** se publica un release en el repo oficial o en un fork
- **THEN** el workflow no lee ni requiere `HOMEBREW_TAP_TOKEN` y los artefactos quedan disponibles en el release

#### Scenario: Cask existente sigue vigente

- **WHEN** el release `v0.2.0` se publica
- **THEN** `brew install --cask quicio/tap/catodo` descarga `v0.2.0` sin que el tap haya cambiado

### Requirement: Instalación Linux desde release

En Linux, el release SHALL distribuir `catodo-<version>-src.tar.gz` con `backend/static/` construido, además de AppImage y `.deb`. `install.sh` extraído del tarball SHALL instalar el backend con `uv`, el servicio systemd de usuario y la app, de forma idempotente y sin requerir `sudo` para la app. Correrlo dos veces no SHALL duplicar servicios ni romper la instalación existente.

#### Scenario: Instalación limpia en Linux

- **WHEN** en un Linux x86_64 con las dependencias del sistema se extrae el tarball y se ejecuta `bash install.sh`
- **THEN** el backend queda como servicio systemd de usuario, `/api/health` responde y la app AppImage existe

#### Scenario: Segunda ejecución idempotente

- **WHEN** se vuelve a ejecutar `bash install.sh` sobre una instalación existente
- **THEN** el servicio sigue activo, no se crean unidades duplicadas y la configuración de usuario se conserva

### Requirement: Integridad de los artefactos

Cada release SHALL publicar `SHA256SUMS` y el cask SHALL apuntar a un artefacto del release más reciente. El workflow SHALL usar permisos mínimos (`contents: write` solo donde se publica) y no SHALL incluir secretos, tokens ni archivos de configuración local en los artefactos.

#### Scenario: Verificación de checksums

- **WHEN** un usuario descarga un artefacto y `SHA256SUMS`
- **THEN** `shasum -a 256 -c SHA256SUMS` valida el archivo descargado

#### Scenario: Sin secretos en el artefacto

- **WHEN** se inspecciona cualquier artefacto publicado
- **THEN** no contiene `.env`, `config.json`, tokens de pairing ni credenciales
