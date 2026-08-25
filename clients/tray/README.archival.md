# feature/tray-client

Esta rama preserva el código del **system tray client (Rust + Tauri)** que
vino en el PR [`feature/lyrics-refactor` original](../tree/feature/lyrics-refactor)
(commit `8c6b24e Add system-tray client (Tauri) + mode presets`).

## Por qué esta rama

El PR #2 ([port to mac silicon + integrate lyrics/tunnel PR](../pull/2)) mergeó
todo lo del PR #1 *excepto* el tray — porque:

- el `clients/tray/` (Rust + Tauri) introduce una app desktop companion nueva
  (no es parte del kiosk) que querés validar por separado
- los bits de UI en `AppearanceSettings.tsx` y `api/client.ts` que consumían
  el tray quedaron fuera del scope del port

Esta rama guarda `clients/tray/` + el planning artifacts (`openspec/changes/
add-system-tray-client/`) intactos para cuando se quiera retomar.

## Qué hay en esta rama

```
clients/tray/                       # Rust + Tauri app (NO compilado aquí)
├── Cargo.toml, Cargo.lock          # depende del toolchain Rust del repo
├── README.md, SMOKE.md             # cómo correrlo
├── build.sh, tauri.conf.json       # bundling
├── capabilities/default.json       # sandboxing Wayland
├── icons/icon.png                  # tray icon
└── src/
    ├── main.rs                      # entrypoint
    ├── menu.rs                     # tray menu
    ├── tray.rs                      # tray icon lifecycle
    ├── pair.rs                      # empareja con el backend
    ├── store.rs                     # config local (~/.config/catodo/tray/)
    └── ws.rs                        # WebSocket con el backend (eventos del kiosk)

openspec/changes/add-system-tray-client/
├── .openspec.yaml
├── proposal.md                     # qué y por qué
├── design.md                       # cómo
├── tasks.md                        # tasks pendientes (no implementadas)
└── specs/
    ├── system-tray-client/spec.md
    ├── mode-presets/spec.md         # (los modos sí entraron al main;
    │                                 #  este spec queda como referencia)
    └── remote-control/spec.md
```

## Qué NO hay en esta rama (y por qué)

- **Bits de UI** en `frontend/src/components/AppearanceSettings.tsx` y
  `frontend/src/api/client.ts`: quedaron stale al mergear PR #2 (el
  AppearanceSettings actual tiene 524 líneas evolucionadas vs las del
  PR #1). Reconstruir desde el spec cuando se implemente.
- **`backend/catodo/modes.py`** y la integración de modes en main.py:
  ya están en `main` (vinieron en el merge de PR #2). El tray los consume
  vía API, no necesita código nuevo acá.

## Cómo retomar el trabajo

1. Revisar `openspec/changes/add-system-tray-client/proposal.md` y `design.md`.
2. Compilar el cliente:
   ```bash
   cd clients/tray
   cargo build --release
   ```
   (necesita Rust toolchain + Tauri CLI; ver `README.md` y `SMOKE.md`).
3. Cuando se quiera integrar al frontend, recrear los bits de UI leyendo
   `openspec/changes/add-system-tray-client/specs/system-tray-client/spec.md`
   y portarlos sobre el AppearanceSettings actual.
4. Cerrar esta rama cuando se mergee el tray real.

## Estado

- Branch: `feature/tray-client` (basada en `a311983` post-merge de PR #2)
- Sin pushear aún — no la abro como PR hasta que haya trabajo concreto.
- Commit único: el código restaurado + este README.