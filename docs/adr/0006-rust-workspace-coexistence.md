---
id: adr-0006
status: aceptada
version: 1.0.0
updated: 2026-11-10
---

# ADR-0006 — Workspace Rust con tres crates y convivencia con Python

## Contexto

El backend actual es FastAPI (7.595 líneas Python) y funciona. La migración a
Rust busca eliminar el runtime Python del release, reducir dependencias del
sistema y ganar tipos en el dominio, pero no puede hacerse en un big-bang sin
perder los 201 tests y el comportamiento ya validado. El repo ya tiene un
cliente Tauri independiente en `clients/tray` con su propio workspace y lockfile.

## Decisión

- El backend Rust vive en `rust/`, un workspace Cargo separado de
  `clients/tray`, con tres crates:
  - `catodo-domain`: tipos puros, sin HTTP, tokio ni APIs del SO.
  - `catodo-platform`: detección de SO y rutas de datos, sin HTTP.
  - `catodo-server`: axum/tokio, composición y transporte.
- Los crates heredan versión, edición, licencia y MSRV del workspace. La versión
  del workspace sigue a `VERSION`.
- `catodo-server` escucha en `127.0.0.1:8769` por defecto (`CATODO_RS_BIND` y
  `CATODO_RS_PORT` permiten override) para convivir con dev (`:8765`) y prod
  (`:8767`).
- M1 solo expone `GET /api/health` y `GET /api/version` con tests de contrato.
  Python sigue siendo el backend por defecto de dev, prod y release (embebido en
  la app macOS como sidecar transitorio).
- Rust es el camino principal: M2–M4 portan el resto del backend y M4 reemplaza
  el sidecar Python por el binario Rust; M5 retira Python/PyInstaller/uv.
- `scripts/check-rust-layers.sh` verifica las aristas con `cargo metadata`; un
  crate no puede violar los límites aunque compile.

## Consecuencias

Buenas:

- La migración se puede hacer por slices verticales con tests de contrato,
  manteniendo Python como oráculo.
- Los límites de capas quedan enforced desde el primer commit, no después.
- El servidor Rust se puede levantar junto a Python sin tocar datos ni puertos.

Malas:

- Hay dos implementaciones del contrato HTTP hasta M4; la duplicación es deuda
  consciente.
- Suma toolchain Rust, dependencias (axum/tokio/serde) y tiempo de CI.
- El workspace nuevo no comparte código con `clients/tray`; duplicar algunos
  tipos es aceptable hasta que exista un crate común.

## Alternativas descartadas

- **Un solo crate `catodo` con módulos**: más simple, pero no fija los límites y
  permite que el dominio se llene de HTTP.
- **Reescribir todo el backend de una**: máximo riesgo y descarta la suite de
  tests como red de seguridad.
- **Usar Tauri/el cliente tray como base del servidor**: mezcla UI de escritorio
  con backend y arrastra dependencias que el servidor no necesita.

## Revisar si

M2 demuestra que los límites de capas no alcanzan, o si el servidor Rust necesita
compartir tipos con `clients/tray` y conviene un crate común.
