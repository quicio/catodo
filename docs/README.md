---
id: docs-index
status: vigente
version: 1.0.0
updated: 2026-11-10
---

# Documentación

Cátodo ya tiene su sistema de specs: **`openspec/`** (schema `spec-driven`, 21
capacidades y 7 changes activos). Este directorio es el **envoltorio**: cómo
entrar, qué está medido, qué decisiones están cerradas. No duplica specs.

Orden de lectura para un agente nuevo:

| documento | para qué |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | comandos y reglas duras (leer primero) |
| [`HANDOFF.md`](HANDOFF.md) | estado medido, invariantes, deuda, qué no hacer |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | capas, contrato `Channel`, plugins, puertos |
| [`ROADMAP.md`](ROADMAP.md) | milestones y qué backlog manda |
| [`adr/`](adr/) | decisiones cerradas con alternativas |
| [`../openspec/`](../openspec/) | **specs y changes: la fuente de verdad** |

## Specs (openspec)

Capacidades en `openspec/specs/<capacidad>/spec.md`:

```
anime-channel          arcade-boxart        arcade-launcher      backend-api
channel-capabilities   channel-system       cross-platform-runtime  event-system
frontend-kiosk         home-layout          home-layouts         idle-screensaver
kiosk-drm-engine       lyrics               media-persistence    mqtt-home-automation
per-channel-volume     plugin-system        remote-control       remote-keyboard
resume-session         runtime-config       screen-casting       spotify-channel
systemd-integration    testing-tooling      theme-system         tv-channel
voice-control          volume-control       wallpapers           youtube-channel
```

Changes activos en `openspec/changes/`:

```
add-system-tray-client   arcade-cartridge-ux   iptv-channel
public-domain-tunnel     replicable-installation-and-config
spotify-on-macos         theme-personalization
```

Para trabajar en una capacidad: leer su `spec.md`, y si el trabajo es grande
abrir un change (no editar la spec directamente sin pasar por change).

## ADR

| id | decisión | estado |
|---|---|---|
| [0001](adr/0001-canales-como-plugins-declarativos.md) | Canales nativos por contrato `Channel`; canales web por `manifest.json` | aceptada |
| [0002](adr/0002-puertos-dev-y-prod.md) | Dos puertos: `:8765` dev, `:8767` prod | aceptada |
| [0003](adr/0003-widevine-en-dev.md) | Widevine sólo con Electron castLabs en dev | aceptada |
| [0004](adr/0004-openspec-como-fuente-de-verdad.md) | openspec es la fuente de verdad de specs | aceptada |

## Flujo

```
openspec: spec de capacidad ──► change (si es grande) ──► implementación
                                     │
                                     └── decisión nueva ──► ADR en docs/adr/
```

Un ADR aceptado no se reescribe: se supersede con otro (`supersedes: NNNN`).
