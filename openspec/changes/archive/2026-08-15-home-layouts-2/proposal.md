## Why

Tras el refactor `home-layout` el Home es un orquestador que itera un `HomeLayout` declarativo. Solo existe un layout (`DEFAULT_LAYOUT`) que se aplica si nadie pasa otro. Para habilitar distintas configuraciones del Home — minimal, cinema, focus, clean, wallpaper-only — sin tocar código se necesita: (a) declarar los layouts como constantes y un registro, (b) una nueva key de runtime config `home_layout_id` que el backend persiste y el frontend lee, (c) un fallback seguro a `DEFAULT_LAYOUT` cuando el id es desconocido.

## What Changes

- Añadir 5 layouts preset en `frontend/src/components/home/layouts.ts` además del `DEFAULT_LAYOUT`: `minimal-layout`, `cinema-layout`, `focus-layout`, `clean-layout`, `wallpaper-only-layout`. Cada uno compone un subconjunto distinto de slots, todos arrancan con `wallpaper-background` + `clock`.
- Añadir un registro `LAYOUTS: Record<string, HomeLayout>` exportado desde el mismo archivo, con helper `getLayout(id) → HomeLayout` que cae a `DEFAULT_LAYOUT` si el id no existe.
- Backend: nueva key `home_layout_id` en `runtime_config.py` (`KEYS`) con default `"default"` y default lambda en `all()`. Sanitización: el getter efectivo valida contra `LAYOUTS`; si el id no existe devuelve `"default"`.
- Backend: tests para sanitización + persistencia + default.
- Frontend: `App.tsx` lee `state.config?.home_layout_id` (o lo pide vía `/api/config` en boot) y pasa el layout correspondiente al `<Home>`.
- Frontend: `AppearanceSettings.tsx` agrega un selector de Layout (entre TEMAS y PERSONALIZACIÓN) con un `<Segmented>` de 6 opciones (Default + 5 presets) usando el mismo patrón que los demás controles granulares.
- Frontend: cuando el usuario cambia el layout, se persiste via `POST /api/config {home_layout_id: ...}` (mismo flujo que el resto de overrides).
- **Sin impacto**: WebSocket, themes, wallpapers, screensaver, remote/PWA, API contracts existentes. CrtShell, ChannelBar, IdleScreensaver, NowPlaying — sin cambios.

## Capabilities

### New Capabilities
- `home-layouts`: Registro de layouts preset (6 en total: `default`, `minimal`, `cinema`, `focus`, `clean`, `wallpaper-only`) y selección del layout activo via `home_layout_id` en runtime config.

### Modified Capabilities
- `runtime-config`: Nueva key `home_layout_id` (default `"default"`); valores desconocidos caen a `"default"` en lectura.

## Impact

**Backend**:
- `backend/catodo/runtime_config.py` — añadir `home_layout_id` a `KEYS`; default `"default"`; el setter normaliza contra la lista de ids conocidos (o se acepta cualquier string y se sanea en lectura).
- `backend/tests/test_config.py` — agregar tests de persistencia + default + sanitización.

**Frontend**:
- `frontend/src/components/home/layouts.ts` — 5 layouts preset + `LAYOUTS` registry + `getLayout`.
- `frontend/src/App.tsx` — leer `home_layout_id` del `/api/config` y pasarlo al `<Home>`.
- `frontend/src/components/AppearanceSettings.tsx` — selector de Layout.
- `frontend/src/api/client.ts` — `RuntimeConfig.home_layout_id?: string`.

**Sin impacto**:
- `Home.tsx` (orquestador), `home/registry.tsx`, `home/useHomeState.ts`, los 8 slots.
- Backend: `themes.py`, `wallpapers.py`, `api.py`, `idle.py`, `pair.py`, channels — sin cambios.
- Remote/PWA, screensaver, WS.
