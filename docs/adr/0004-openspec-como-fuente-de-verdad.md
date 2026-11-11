---
id: adr-0004
status: aceptada
version: 1.0.0
updated: 2026-11-10
---

# ADR-0004 — openspec es la fuente de verdad de las specs

## Contexto

El repo ya usa **openspec** (`schema: spec-driven`): 21 capacidades en
`openspec/specs/<capacidad>/spec.md` y 7 changes activos en `openspec/changes/`,
con `config.yaml` que declara el contexto del proyecto. Es un formato con
convenciones propias (proposal, tasks, delta de spec) y ya tiene historia.

Al agregar documentación de traspaso (HANDOFF, ARCHITECTURE, ADRs) aparece el
riesgo de crear un segundo árbol de specs (`docs/specs/`) que compita con el
primero y se desincronice.

## Decisión

1. **No hay `docs/specs/`.** Las specs viven sólo en `openspec/`.
2. `docs/` contiene lo que openspec no cubre: estado medido (`HANDOFF.md`), mapa
   de arquitectura, decisiones cerradas (`adr/`) e índice (`README.md`).
3. Los ADRs capturan decisiones **transversales** (puertos, DRM, contrato de
   canal, este mismo ADR). Una capacidad concreta no necesita ADR: su spec la
   describe.
4. Un cambio de comportamiento se refleja en la spec de la capacidad, en el mismo
   commit que el código.

## Consecuencias

Buenas:

- Una sola fuente de verdad: no hay que decidir "cuál spec manda".
- Los changes de openspec siguen siendo el backlog real, sin duplicar en un
  ROADMAP paralelo.
- Los ADRs no compiten con las specs: una decisión, un lugar.

Malas:

- El agente nuevo tiene que aprender el formato de openspec (mitigado con el
  índice en `docs/README.md`).
- Las decisiones que en otros repos irían dentro de una spec grande acá viven
  aparte; hay que mantener el reflejo de escribir el ADR cuando la decisión es
  transversal.

## Alternativas descartadas

- **Duplicar specs en `docs/specs/`**: dos árboles, drift garantizado.
- **Migrar openspec a un formato propio**: pierde la historia y las herramientas
  del schema `spec-driven` sin ganar nada.
