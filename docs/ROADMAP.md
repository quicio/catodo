---
id: roadmap
status: vigente
version: 2.1.0
updated: 2026-11-12
---

# Roadmap — Cátodo

El backlog operativo vive en `openspec/changes/`. Este archivo ordena los
milestones y el criterio de salida de cada uno.

## Estado

| # | Fase | Estado | Criterio de salida |
|---|---|---|---|
| M0 | Base: 5 canales + kiosko | hecho | `./scripts/check.sh` verde en Linux; canales 1–5 abren y cambian con hotkeys |
| M1 | Release/instalación + walking skeleton Rust | hecho | release `v0.1.1` publicado con checksums; cask estático en el tap e instalación verificada en macOS arm64 |
| M2 | Paridad dominio/plataforma Rust | hecho | config/store/events + `/api/config`, `/api/state`, `/api/ws` con tests de contrato |
| M3 | Channels y plugins en Rust | hecho | `/api/channels`, plugins web, Spotify (AppleScript en macOS, `playerctl` en Linux), media/anime y arcade |
| M4 | Paridad de API y sidecar Rust | hecho (macOS) | el `.app` y el AppImage usan el binario Rust; falta validar el AppImage en Linux limpio |
| M5 | Cutover y limpieza | en curso | release/dev/prod usan Rust; Python queda como fallback de desarrollo |

## Deuda de producto (lo que falta para uso diario)

| Prioridad | Tema | Detalle |
|---|---|---|
| 1 | Validación Linux | `install.sh --check`, idempotencia con systemd y AppImage (con Widevine) en una máquina limpia |
| 2 | Canal IPTV | Implementado en Rust (parser, zapping, proxy ffmpeg); falta validarlo con una playlist real |
| 3 | Releases sin pasos manuales | El release de release-please no encadena `release.yml` (`GITHUB_TOKEN`); resolver con PAT o `workflow_run` |
| 4 | Notarización Apple / auto-update | Requiere Developer ID; hoy se compensa con el `xattr` del cask |
| 5 | VMP de producción (EVS) | La firma de ECS es de desarrollo; sólo hace falta si un proveedor la rechaza |

## Changes abiertos

| change | estado | qué falta |
|---|---|---|
| `m1-release-and-rust-foundation` | 56/65 | validaciones externas en Linux y cierre (`9.7`) |
| `public-domain-tunnel` | 61/64 | pruebas manuales con Cloudflare real, PWA installable y VM limpia |
| `packaged-widevine` | 11/14 | reproducir un canal DRM real con cuenta y validar el AppImage en Linux |
| `iptv-channel` | 13/15 | validar con una playlist real de canales libres |
| `add-system-tray-client` | tareas 100% | el tray no se empaqueta ni se distribuye: decidir integrarlo al pipeline o descartar el change |

Changes archivados el 2026-11-12 (specs sincronizadas): `spotify-on-macos`,
`replicable-installation-and-config`, `arcade-cartridge-ux` y
`theme-personalization` (que retiró `theme-system` en favor de `appearance`).

## Orden de ataque

1. **Validación Linux**: `install.sh`, systemd y AppImage (con Widevine) en limpio.
2. **IPTV** en Rust: parser M3U, proxy `ffmpeg` y vista con zapping.
3. **Releases automáticos** (PAT o `workflow_run`) y notarización cuando haya
   Apple Developer ID.
4. **Cerrar `packaged-widevine`**: reproducir un canal DRM real con cuenta.
5. **Decisión del tray client**: integrar y empaquetar, o archivar el change como
   descartado.

Regla: **una change de openspec, un milestone, un commit lógico**.
