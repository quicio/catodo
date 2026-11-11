## Purpose

Define el esqueleto del backend Rust de Cátodo: un workspace de tres crates con límites de capas explícitos y un servidor mínimo que responde el contrato HTTP de health y versión, sin reemplazar todavía al backend Python en producción.

## ADDED Requirements

### Requirement: Workspace Rust con tres crates

El repositorio SHALL contener un workspace Cargo en `rust/` con los crates `catodo-domain`, `catodo-platform` y `catodo-server`. El workspace SHALL heredar versión, edición, licencia y MSRV a sus miembros. `cargo build --workspace` y `cargo test --workspace` SHALL ejecutarse desde `rust/` sin pasos manuales.

#### Scenario: Build del workspace

- **WHEN** se ejecuta `cargo build --workspace` en `rust/`
- **THEN** los tres crates compilan y el binario `catodo-server` se produce

#### Scenario: Versión heredada

- **WHEN** se inspecciona la versión de cualquier crate con `cargo metadata`
- **THEN** coincide con la versión declarada en `rust/Cargo.toml`, que a su vez coincide con `VERSION`

### Requirement: Límites de capas

`catodo-domain` SHALL ser puro: no SHALL depender de `axum`, `tokio`, frameworks HTTP ni APIs del sistema operativo. `catodo-platform` SHALL contener la detección de plataforma y las rutas de datos, y no SHALL depender de `axum` ni de `catodo-server`. `catodo-server` SHALL depender de `catodo-domain` y `catodo-platform`, y SHALL ser el único crate que conoce HTTP. Un chequeo de CI SHALL fallar si se viola una de estas dependencias.

#### Scenario: Dominio sin framework

- **WHEN** se inspeccionan las dependencias de `catodo-domain`
- **THEN** no aparecen `axum`, `tokio`, `hyper` ni crates de plataforma

#### Scenario: Violación de capas detectada

- **WHEN** `catodo-platform` agrega una dependencia de `axum`
- **THEN** `scripts/check-rust-layers.sh` falla y CI marca el job en rojo

### Requirement: Endpoint de health

`catodo-server` SHALL exponer `GET /api/health` y responder `200 OK` con JSON `{"status":"ok"}` en menos de 100 ms. La forma del JSON SHALL ser idéntica a la del backend Python.

#### Scenario: Health responde el contrato

- **WHEN** se ejecuta `GET /api/health` contra el servidor Rust
- **THEN** la respuesta es 200, `Content-Type: application/json` y el body es exactamente `{"status":"ok"}`

#### Scenario: Health bajo carga

- **WHEN** hay diez requests concurrentes a `/api/health`
- **THEN** todas responden 200 en menos de 100 ms cada una

### Requirement: Endpoint de versión

`catodo-server` SHALL exponer `GET /api/version` y responder `200 OK` con JSON `{"version":"<semver>"}`, donde `<semver>` es la versión del workspace. La forma del JSON SHALL ser idéntica a la del backend Python.

#### Scenario: Versión del release

- **WHEN** el servidor arranca con la versión `0.2.0` del workspace
- **THEN** `GET /api/version` responde `{"version":"0.2.0"}`

#### Scenario: Versión coincide con VERSION

- **WHEN** se compara la respuesta de `/api/version` con el contenido de `VERSION`
- **THEN** ambos valores son iguales

### Requirement: Puerto y bind aislados

El servidor Rust SHALL escuchar por defecto en `127.0.0.1:8769` y SHALL permitir override mediante `CATODO_RS_BIND` y `CATODO_RS_PORT`. No SHALL usar por defecto los puertos `8765` (dev) ni `8767` (prod), para poder convivir con el backend Python.

#### Scenario: Arranque por defecto

- **WHEN** se ejecuta `catodo-server` sin variables de entorno
- **THEN** escucha en `127.0.0.1:8769` y no colisiona con un backend Python en `:8765` o `:8767`

#### Scenario: Override de puerto

- **WHEN** se ejecuta con `CATODO_RS_PORT=9100`
- **THEN** escucha en `127.0.0.1:9100`

### Requirement: Apagado ordenado

El servidor SHALL manejar `SIGINT` y `SIGTERM` cerrando el listener, dejando terminar los requests en vuelo y saliendo con código 0. Un segundo `SIGINT` SHALL forzar la salida.

#### Scenario: Ctrl+C limpio

- **WHEN** se envía `SIGINT` al servidor mientras atiende un request lento
- **THEN** el request en vuelo termina, el proceso sale con código 0 y el puerto queda libre

#### Scenario: SIGTERM de servicio

- **WHEN** el gestor de servicios envía `SIGTERM`
- **THEN** el servidor se apaga ordenadamente sin dejar procesos hijos

### Requirement: Tests de contrato sin red

Los endpoints `health` y `version` SHALL tener tests de contrato que usen el router en memoria y fixtures JSON versionados. Los tests SHALL comparar el body exacto y no SHALL abrir sockets ni depender de red.

#### Scenario: Test de contrato de health

- **WHEN** corre `cargo test -p catodo-server`
- **THEN** el test de health valida status 200 y body `{"status":"ok"}` sin abrir un puerto

#### Scenario: Fixture desactualizado

- **WHEN** cambia la forma de la respuesta y no se actualiza el fixture
- **THEN** el test de contrato falla

### Requirement: CI de Rust

CI SHALL ejecutar en Linux y macOS `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` y `cargo build --release -p catodo-server`. El job SHALL usar caché de Cargo y fijar una toolchain estable.

#### Scenario: Clippy bloquea warnings

- **WHEN** el código Rust introduce un warning de clippy
- **THEN** CI falla con `-D warnings`

#### Scenario: Build release por plataforma

- **WHEN** corre CI en macOS y Linux
- **THEN** ambos runners producen el binario release de `catodo-server`

### Requirement: Sin cutover en M1

El backend Python SHALL seguir siendo el backend por defecto de dev y producción durante M1. El workspace Rust no SHALL ser referenciado por `run-dev.sh`, `run-prod.sh`, el instalador, el cask de Homebrew ni el frontend. Ambos servidores SHALL poder correr al mismo tiempo sin compartir estado ni archivos de datos.

#### Scenario: Dev sigue usando Python

- **WHEN** se ejecuta `./run-dev.sh`
- **THEN** el backend en `:8765` es el Python y el servidor Rust no se inicia

#### Scenario: Convivencia de procesos

- **WHEN** el backend Python corre en `:8767` y el Rust en `:8769`
- **THEN** ambos responden health de forma independiente y no comparten `runtime_config` ni estado en memoria

### Requirement: Observabilidad mínima

El servidor SHALL emitir logs estructurados a stdout con nivel configurable por `RUST_LOG`, incluyendo bind, arranque y apagado. No SHALL escribir logs a archivos dentro del repositorio.

#### Scenario: Arranque observable

- **WHEN** el servidor arranca con `RUST_LOG=info`
- **THEN** stdout muestra la dirección de bind y un mensaje de arranque

## ADDED Requirements

### Requirement: Cutover a Rust en M5

A partir de M5, el backend Rust SHALL ser el backend por defecto de dev, prod y release. `run-dev.sh` y `run-prod.sh` SHALL arrancar `catodo-server` por defecto; el backend Python SHALL quedar disponible solo como fallback explícito (`CATODO_DEV_BACKEND=python`) y no SHALL incluirse en la app macOS ni en el AppImage. La app empaquetada SHALL lanzar el binario Rust como sidecar.

#### Scenario: Dev usa Rust por defecto

- **WHEN** se ejecuta `./run-dev.sh` sin `CATODO_DEV_BACKEND`
- **THEN** el backend en `:8765` es `catodo-server` (Rust) y responde `/api/health`

#### Scenario: Prod usa Rust por defecto

- **WHEN** se ejecuta `./run-prod.sh start`
- **THEN** el backend en `:8767` es `catodo-server` (Rust) y responde `/api/health`

#### Scenario: Fallback Python explícito

- **WHEN** se ejecuta `CATODO_DEV_BACKEND=python ./run-dev.sh`
- **THEN** el backend en `:8765` es FastAPI y el flujo de desarrollo sigue funcionando

#### Scenario: Release sin Python

- **WHEN** se inspecciona `Catodo.app/Contents/Resources/backend/` o el AppImage
- **THEN** contiene el binario Rust, `static/` y `plugins-repo/`, y no contiene un runtime Python
