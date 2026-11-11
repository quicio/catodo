---
id: roadmap
status: vigente
version: 1.0.0
updated: 2026-11-10
---

# Roadmap — Cátodo

El backlog operativo **no vive acá**: vive en `openspec/changes/` (un change por
trabajo, con proposal + tasks + delta de spec). Este archivo sólo ordena a qué
apunta cada cosa y cómo se cierra.

## Estado

| # | Fase | Estado | Criterio de salida |
|---|---|---|---|
| M0 | Base: 5 canales + kiosko | hecho | `./scripts/check.sh` verde en Linux; canales 1–5 abren y cambian con hotkeys |
| M1 | Changes abiertos (7) | en curso | cada change cierra con su spec de openspec actualizada y el gate verde |
| M2 | Port a macOS | en curso (dev) | `./run-dev.sh` levanta backend + UI en macOS; gate verde salvo los 2 tests Linux-only |
| M3 | Instalación replicable | futuro | `install.sh` + `systemd/` documentados y probados en una máquina limpia |

## M1 — los 7 changes abiertos

| change | qué resuelve |
|---|---|
| `add-system-tray-client` | cliente de bandeja para controlar Cátodo desde el escritorio |
| `arcade-cartridge-ux` | UX de cartuchos del launcher arcade |
| `iptv-channel` | canal IPTV genérico |
| `public-domain-tunnel` | túnel para contenido de dominio público |
| `replicable-installation-and-config` | instalación y configuración reproducibles |
| `spotify-on-macos` | Ch1 Spotify en macOS (AppleScript) — ya mergeado en parte |
| `theme-personalization` | personalización granular de temas |

Criterio de cierre de cualquier change: `./scripts/check.sh` sin fallas nuevas,
spec de la capacidad actualizada, y el comportamiento verificable en `./run-dev.sh`
(o en la AppImage si toca empaquetado).

## M2 — port a macOS

Commits recientes: `port to mac silicon`, `spotify on macOS: AppleScript adapter`.
El objetivo es que macOS sea un entorno de desarrollo cómodo, **no** un target.

Entra: backend + frontend en dev, Ch1 Spotify con AppleScript, gate local.
No entra: AppImage, systemd, Widevine (macOS usa otro camino).

Salida:

1. `./run-dev.sh` levanta `:8765` y `:1420` sin pasos manuales.
2. `cd frontend && npm ci && npx tsc --noEmit` limpio.
3. `uv run pytest` sin fallas de plataforma (los de arcade parametrizados).

## M3 — instalación replicable

Un solo `install.sh` que deje una máquina limpia corriendo Cátodo como servicio
(`systemd/`) sin pasos manuales, y un `check.sh` verde en esa máquina.

## Orden de ataque

1. Arreglar lo que bloquea medir: `npm ci` en frontend + los 2 tests de arcade
   parametrizados. Sin gate confiable, cualquier cambio es a ciegas.
2. Cerrar un change chico primero (`arcade-cartridge-ux` o `theme-personalization`)
   para validar el flujo completo.
3. Los grandes (`iptv-channel`, `replicable-installation-and-config`).

Regla: **una change de openspec, un milestone, un commit lógico**.
