---
id: roadmap
status: vigente
version: 2.0.0
updated: 2026-11-10
---

# Roadmap — Cátodo

El backlog operativo vive en `openspec/changes/`. Este archivo ordena los
milestones y el criterio de salida de cada uno.

## Estado

| # | Fase | Estado | Criterio de salida |
|---|---|---|---|
| M0 | Base: 5 canales + kiosko | hecho | `./scripts/check.sh` verde en Linux; canales 1–5 abren y cambian con hotkeys |
| M1 | Release/instalación + walking skeleton Rust | hecho (local) | release `vX.Y.Z` con app única y cask estático; workspace Rust con health/version y CI verde |
| M2 | Paridad dominio/plataforma Rust | hecho | config/store/events + `/api/config`, `/api/state`, `/api/ws` con tests de contrato |
| M3 | Channels y plugins en Rust | hecho (macOS) | `/api/channels`, plugins web, Spotify AppleScript, media/anime y arcade; MPRIS Linux pendiente |
| M4 | Paridad de API y sidecar Rust | hecho (macOS) | el `.app` usa el binario Rust; API de servicios portada; AppImage Linux pendiente de validación |
| M5 | Cutover y limpieza | en curso | release/dev/prod usan Rust; Python queda como fallback de desarrollo |

## M1 — Release + Rust foundation

Change: `openspec/changes/m1-release-and-rust-foundation/`.

Entra:

- `VERSION` único, release-please, CI Linux/macOS y release pipeline con checksums.
- Cask estático `catodo` en el tap existente `quicio/homebrew-tap`; sin formula ni token.
- App macOS única con el backend embebido (PyInstaller transitorio); Linux con `install.sh` + systemd.
- La app empaquetada lanza el sidecar; Linux sin backend embebido hace fallback a `:8767`/`:8765`.
- Workspace `rust/` con `catodo-domain`, `catodo-platform`, `catodo-server`
  (health/version en `:8769`), tests de contrato y límites de capas.

No entra: cutover a Rust, bundle Linux autocontenido, notarización Apple,
auto-update, Windows o Linux arm64.

## Changes abiertos

| change | qué resuelve |
|---|---|
| `add-system-tray-client` | cliente de bandeja para controlar Cátodo desde el escritorio |
| `arcade-cartridge-ux` | UX de cartuchos del launcher arcade |
| `iptv-channel` | canal IPTV genérico |
| `m1-release-and-rust-foundation` | release/instalación + esqueleto Rust |
| `public-domain-tunnel` | túnel para contenido de dominio público |
| `replicable-installation-and-config` | instalación y configuración reproducibles |
| `spotify-on-macos` | Ch1 Spotify en macOS (AppleScript) — ya mergeado en parte |
| `theme-personalization` | personalización granular de temas |

Criterio de cierre de cualquier change: `./scripts/check.sh` sin fallas nuevas,
spec de la capacidad actualizada y comportamiento verificable en `./run-dev.sh`
(o en el release si toca empaquetado).

## Orden de ataque

1. Cerrar la validación externa de M1: cask en el tap, release de prueba en una
   rama y `install.sh` en un Linux limpio.
2. M2: portar config/store/events y el WebSocket manteniendo Python como oráculo.
3. M3: channels/plugins y un canal nativo.
4. M4/M5: paridad total, bundle Rust y retiro de Python.

Regla: **una change de openspec, un milestone, un commit lógico**.
