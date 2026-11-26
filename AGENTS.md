# AGENTS.md

Punto de entrada para cualquier agente que trabaje en Cátodo.
Leer en este orden:

1. **`docs/HANDOFF.md`** — estado medido, invariantes, deuda, qué no hacer.
2. **`docs/README.md`** — índice de docs, ADRs y capacidades de openspec.
3. **`docs/ARCHITECTURE.md`** — capas, contrato `Channel`, plugins, puertos.
4. **`docs/ROADMAP.md`** — milestones y qué backlog manda.
5. La spec de la capacidad en **`openspec/specs/<capacidad>/spec.md`**.
6. Los ADR en **`docs/adr/`**.

**Las specs viven en `openspec/`, no en `docs/specs/`** (ADR-0004). No crear un
árbol paralelo de specs.

## Comandos

```bash
./scripts/check.sh                 # gate: tsc + version + Rust
./scripts/check-rust.sh            # fmt + clippy + tests + límites de capas
./scripts/check-version.sh         # VERSION vs manifests (Node)
cd rust && cargo run -p catodo-server      # backend (único runtime)
./run-dev.sh                       # dev: backend :8765 + Vite :1420
./run-prod.sh start                # prod: backend :8767 + bundle estático
cd frontend && npm ci              # necesario una vez, sin esto el tsc del gate falla
cd frontend && npm run typecheck   # tsc --noEmit, parte del gate
cd frontend && npm run electron:build:linux
```

## Commits y releases

- **Conventional Commits obligatorio desde M1**: `feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`, `test:`, `build:`, `ci:`. Breaking change con `!` o
  `BREAKING CHANGE:`.
- **`VERSION` es la fuente única** de la versión del producto. No editar a mano
  los manifests: release-please los actualiza en el PR de release.
- **release-please** corre en push a `main` y abre el PR de release. Ese PR se
  mergea solo cuando `ci` pasa (`release-automerge.yml`) y recién ahí crea el
  tag `vX.Y.Z` y un GitHub Release **draft** (ADR-0013). Para frenarlo, quitá el
  label `autorelease: pending` del PR o deshabilitá ese workflow.
- **Release pipeline**: `.github/workflows/release.yml` se dispara con el push
  del tag, construye los artefactos por plataforma, los sube al draft y recién
  entonces lo publica (`--draft=false --latest`). Nunca hay un release visible
  sin binarios ni `SHA256SUMS`. El cask estático de `quicio/homebrew-tap` apunta
  a `latest/download` y no se actualiza por release.
- **Publicación automática**: `release-please` usa `secrets.RELEASE_PAT`
  (fallback a `GITHUB_TOKEN`). Con el PAT, el push del tag dispara `release.yml`
  sin pasos manuales. El merge del PR también va con el PAT: con `GITHUB_TOKEN`
  el push a `main` no dispararía release-please. `release-auto.yml` queda como
  fallback cuando no hay PAT: detecta el draft pendiente y llama a
  `release.yml`; `--force` reconstruye los assets a mano.
- Para un release manual de prueba, usar un tag `vX.Y.Z-rc.N` en una rama.


## Reglas duras

- **Un canal es una implementación del trait `Channel`**
  (`rust/crates/catodo-server/src/channels.rs`). Comportamiento opcional se
  declara como método del trait con default o capability en `ChannelInfo`, nunca
  como `if channel.type == ...`.
- **No reintroducir Python/uv/pytest** en runtime, gate ni packaging — ADR-0011.
- **La UI no implementa canales**: el frontend consume la API y nada más.
- **Canales web = sólo `manifest.json`**. No se ejecuta código de terceros.
- **No unificar los puertos `:8765` (dev) y `:8767` (prod)** — ADR-0002.
- **No duplicar specs fuera de `openspec/`** — ADR-0004.
- **Dependencia nueva = ADR obligatorio** (peso, licencia, mantenimiento).
- **Datos de usuario en `~/.local/share/catodo/`**, nunca en el árbol del repo.
- **Nada de tests que dependan de un binario Linux-only sin parametrizarlo**
  (caso `test_arcade` con `/bin/true`): rompe el trabajo en macOS.
- **Decisiones cerradas no se reabren sin ADR nuevo.**

## Definición de terminado

- [ ] `./scripts/check.sh` sin fallas nuevas (ver HANDOFF).
- [ ] Si tocó Rust: `./scripts/check-rust.sh` verde y límites de capas OK.
- [ ] Si tocó versión/release: `./scripts/check-version.sh` verde.
- [ ] Si tocó un canal: contrato `Channel` respetado y capability declarada.
- [ ] Si tocó UI: verificado en `./run-dev.sh`.
- [ ] Spec de la capacidad actualizada en `openspec/` en el mismo commit.
- [ ] Commit atómico en imperativo.
