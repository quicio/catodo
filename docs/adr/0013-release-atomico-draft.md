---
id: adr-0013
status: aceptada
version: 1.0.0
updated: 2026-11-25
---

# ADR-0013 — Release atómico: draft hasta tener todos los assets

## Contexto

release-please publicaba el GitHub Release en cuanto se mergeaba el PR de
release. Los artefactos los construía después `release.yml` (Linux y macOS,
varios minutos). Durante esa ventana `/releases/latest` existía pero no tenía
binarios ni `SHA256SUMS.txt`: `install.sh` fallaba con un 404 y el release
quedaba visible a medias si el build fallaba.

## Decisión

- release-please crea el Release como **draft** y fuerza el tag de inmediato
  (`draft: true` + `force-tag-creation: true`). El draft no aparece como
  `latest` ni es visible para los usuarios.
- `release.yml` se dispara con el **push del tag** (o `workflow_dispatch` /
  `workflow_call`), construye los artefactos, los sube al draft y recién
  entonces lo publica con `gh release edit --draft=false --latest`.
- Si no hay release para el tag (tag empujado a mano), `release.yml` lo crea
  ya publicado con todos los assets en una sola operación.
- Sin `RELEASE_PAT`, los eventos de `GITHUB_TOKEN` no encadenan workflows:
  `release-auto.yml` detecta el draft pendiente y llama a `release.yml` como
  workflow reutilizable.
- `release: published` deja de disparar builds: la publicación es el final del
  pipeline, no el inicio.

## Consecuencias

Buenas:

- Nunca hay un release visible sin binarios ni checksums.
- Si el build falla, queda un draft oculto; se reintenta sin exponer una
  versión rota. `install.sh` sigue instalando la última versión completa.
- Los notes del release siguen viniendo de release-please (CHANGELOG).

Malas:

- Hay que mantener `release-auto.yml` como fallback para instalaciones sin PAT.
- Reintentar un release exige re-ejecutar `release.yml` o el dispatch con
  `force`; el draft no se publica solo si el build nunca corre.

## Alternativas descartadas

- **`skip-github-release` + crear tag/release en `release.yml`**: release-please
  necesita el tag para calcular el próximo changelog y podría proponer un
  release duplicado mientras el tag no existe.
- **Seguir publicando y reintentar en `install.sh`**: no arregla el release
  roto visible si el build falla; sólo disimula la ventana.
- **Publicar como prerelease y promover**: agrega un estado intermedio y pasos
  manuales; el draft ya cumple esa función.

## Revisar si

release-please deja de soportar `draft`/`force-tag-creation`, si GitHub cambia
la asociación tag↔release para drafts, o si se migra la publicación a otro
sistema (p. ej. un registry propio).
