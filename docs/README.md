---
id: docs-index
status: vigente
version: 1.0.0
updated: 2026-11-10
---

# Documentación

Cátodo ya tiene su sistema de specs: **`openspec/`** (schema `spec-driven`, 34
capacidades y 6 changes activos). Este directorio es el **envoltorio**: cómo
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
anime-channel          appearance           arcade-boxart        arcade-cartridge-ux
arcade-launcher        backend-api          channel-capabilities channel-system
cross-platform-runtime event-system         frontend-kiosk       home-layout
home-layouts           idle-screensaver     installation         kiosk-drm-engine
lyrics                 media-persistence    mqtt-home-automation per-channel-volume
plugin-system          remote-control       remote-keyboard      resume-session
runtime-config         screen-casting       spotify-channel      systemd-integration
testing-tooling        tv-channel           voice-control        volume-control
wallpapers             youtube-channel
```

Changes activos en `openspec/changes/`:

```
add-system-tray-client   arcade-libretro-host   iptv-channel
m1-release-and-rust-foundation   packaged-widevine   public-domain-tunnel
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
| [0005](adr/0005-release-packaging.md) | Release con `VERSION` único, release-please, app macOS única y cask estático | aceptada |
| [0006](adr/0006-rust-workspace-coexistence.md) | Workspace Rust `domain`/`platform`/`server` y Rust como camino principal | aceptada |
| [0007](adr/0007-widevine-empaquetado.md) | Widevine empaquetado en ECS | aceptada |
| [0008](adr/0008-libretro-embebido.md) | Host libretro embebido | aceptada |
| [0009](adr/0009-video-crudo-y-audio-pcm.md) | Video crudo + PCM por WebSocket | aceptada |
| [0010](adr/0010-checksums-de-cores.md) | Checksums y pin de cores | aceptada |
| [0011](adr/0011-retiro-del-backend-python.md) | Retiro del backend Python; runtime, gate y packaging Rust + Node | aceptada |
| [0012](adr/0012-configuracion-local-only.md) | Configuración sensible local-only; remote sin administración | aceptada |
| [0013](adr/0013-release-atomico-draft.md) | Release atómico: draft hasta tener todos los assets | aceptada |

## Flujo

```
openspec: spec de capacidad ──► change (si es grande) ──► implementación
                                     │
                                     └── decisión nueva ──► ADR en docs/adr/
```

Un ADR aceptado no se reescribe: se supersede con otro (`supersedes: NNNN`).
