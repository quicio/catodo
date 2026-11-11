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
./scripts/check.sh                 # gate: ruff + pytest + tsc   (~70 s)
cd backend && uv run python -m catodo     # backend solo
./run-dev.sh                       # dev: backend :8765 + Vite :1420
./run-prod.sh start                # prod: backend :8767 + bundle estático
cd frontend && npm ci              # necesario una vez, sin esto el tsc del gate falla
cd frontend && npm run typecheck   # tsc --noEmit, parte del gate
cd frontend && npm run electron:build:linux
```

## Reglas duras

- **Un canal es una implementación de `Channel`** (`backend/catodo/channel.py`).
  Comportamiento opcional se declara como `Protocol` de capacidad, nunca como
  `if channel.type == ...`.
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

- [ ] `./scripts/check.sh` sin fallas nuevas (hoy: 2 fallas conocidas por entorno,
      ver HANDOFF).
- [ ] Si tocó un canal: contrato `Channel` respetado y capability declarada.
- [ ] Si tocó UI: verificado en `./run-dev.sh`.
- [ ] Spec de la capacidad actualizada en `openspec/` en el mismo commit.
- [ ] Commit atómico en imperativo.
