# 0010 — Checksums y pin de cores libretro

- Estado: aceptada
- Fecha: 2026-11-14

## Contexto

Los cores libretro se descargan en runtime desde el buildbot público y se cargan
en el proceso del backend con `libloading`. Un nightly roto, un cambio silencioso
o un MITM ejecuta código nativo dentro de Cátodo.

El buildbot sólo publica `latest` (no hay directorios fechados), así que la
versión estable que podemos fijar es el **contenido** del artefacto.

## Decisión

- `rust/crates/catodo-server/src/arcade/cores.lock.json` fija, por plataforma y
  core, la URL y los **SHA-256** del zip y de la librería extraída.
- `ensure_core` verifica el zip antes de descomprimir, verifica la librería antes
  de cargarla, y revalida el core cacheado. Si falta el pin o el hash no
  coincide, **falla cerrado** con un mensaje que indica actualizar el lock.
- `scripts/update-cores.sh [plataforma]` regenera el lock descargando los cores
  y calculando ambos hashes.
- Se agrega `sha2` (RustCrypto, MIT/Apache-2.0, mantenida) como dependencia
  directa; antes no había hashing en el workspace.

## Consecuencias

- El binario lleva el lock embebido con `include_str!`; el release fija los
  hashes de su fecha de build.
- Si el buildbot reemplaza `latest` después de un release, las descargas nuevas
  fallan con "checksum inválido" hasta publicar un release nuevo o regenerar el
  lock. Los cores ya cacheados siguen validándose por hash.
- Plataformas sin pin fallan explícitamente; el script permite agregarlas.

## Alternativas descartadas

- Descargar sin verificar: es el problema que motiva el ADR.
- Empaquetar todos los cores en el artefacto: aumenta el tamaño y obliga a
  revisar licencias de cada core. Queda como mejora futura si el buildbot deja
  de ser aceptable como origen.
- Confiar sólo en HTTPS: no cubre un nightly comprometido ni cambios de build.
