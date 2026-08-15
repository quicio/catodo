## Context

El change anterior `home-layout` dejó al Home como orquestador puro que recibe un `HomeLayout` y lo compone desde un registry de slots. Existe un solo layout (`DEFAULT_LAYOUT`). El usuario quiere 5 layouts adicionales seleccionables sin tocar código. Como el sistema ya tiene runtime config (JSON en disco, expuesto via `/api/config` con eventos `config_changed` por WS), la integración natural es agregar una nueva key `home_layout_id`.

La lista de layouts se mantiene en el frontend (es UI declarativa de un compositor que vive en React). El backend no necesita conocer cada layout — solo persiste el string id. El frontend valida que el id exista en `LAYOUTS` y cae a default si no.

Los 5 layouts nuevos son presets fijos declarados en código. No son configurables por JSON (no hay razón — la composición de un Home no debería ser runtime-configurable a nivel de slots individuales). Un futuro ModeManager podría elegir entre estos presets y otros nuevos sin tocar Home.

## Goals / Non-Goals

**Goals**:
- 5 layouts preset declarativos que cubren distintas "personalidades" del Home.
- Cambio desde config persistente via `home_layout_id`.
- Fallback seguro a `default` si el id es desconocido.
- Selector en el panel de settings (mismo flujo que los demás overrides).

**Non-Goals**:
- Layouts definidos en JSON runtime (no tiene sentido para UI declarativa).
- Drag & drop / editor visual.
- Modos / ModeManager.
- Layouts dependientes del contexto (Spotify sonando, hora del día, etc.) — los layouts son estáticos.

## Decisions

### 1. Catálogo de los 5 layouts nuevos

Todos arrancan con `wallpaper-background` + `clock` (mínimo absoluto). Los demás slots se agregan o quitan según la "personalidad":

| id | wallpaper | clock | brand | mini | grid | ratings | popover | pair-modal | idea |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `default` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | el actual |
| `minimal-layout` | ✓ | ✓ | — | — | ✓ | — | — | — | lo más limpio, sin ruido |
| `cinema-layout` | ✓ | ✓ | — | ✓ | ✓ | — | — | — | pensado para sesión de película: sin ratings ni popover (no se interactúa), solo el fondo + reloj + grilla + ahora suena |
| `focus-layout` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — | sin brand (no necesitás ver "Cátodo") ni mini-now-playing, pero sí ratings y popover para configurar |
| `clean-layout` | ✓ | ✓ | ✓ | — | ✓ | — | — | — | el "default" sin ratings ni popover (modo kiosk desatendido: solo se ven canales) |
| `wallpaper-only-layout` | ✓ | ✓ | ✓ | — | — | — | — | — | "modo arte": fondo + reloj + título, sin grilla (no se elige canal) |

Todos `position === "overlay"` heredan la marca de overlay de la spec (`appearance-settings-popover` solo aparece si está en el layout).

### 2. Registro + helper

```ts
// layouts.ts
export const LAYOUTS: Record<string, HomeLayout> = {
  default: DEFAULT_LAYOUT,
  "minimal-layout": { layoutId: "minimal-layout", components: [...] },
  ...
};
export function getLayout(id: string | undefined): HomeLayout {
  return LAYOUTS[id ?? ""] ?? DEFAULT_LAYOUT;
}
```

`getLayout` maneja `undefined`/id desconocido/null/vacío con un solo fallback.

### 3. Backend: nueva key + sanitización

- `KEYS["home_layout_id"] = lambda: "default"` (igual que `theme_crt_enabled`).
- El getter efectivo (`_effective`) valida contra una lista fija de ids conocidos **en el backend** — pero para mantenerlo simple, el backend NO conoce la lista: solo sanitiza tipo (`isinstance(str)` y no vacío). Si el frontend define un id nuevo, el backend lo acepta sin cambios.
- **Decisión**: el backend valida solo que sea string no vacío. El frontend hace el "fallback a default" cuando el id no está en `LAYOUTS`. Esto evita acoplar el backend al catálogo del frontend.

### 4. Frontend: `App.tsx`

```tsx
// Después de api.config():
const layoutId = cfg.home_layout_id;
const homeLayout = getLayout(layoutId);
<Home ... layout={homeLayout} />
```

El `config_changed` con key `home_layout_id` debe re-montar el Home con el nuevo layout (o forzar re-render del layout). Como el orquestador lee `layout` por prop, basta con pasar el nuevo `layout` (ya hay un `useState` o re-render con cada config_changed).

### 5. Frontend: selector en `AppearanceSettings`

- Sección nueva "LAYOUT" entre TEMAS y PERSONALIZACIÓN.
- 6 botones segmented con labels legibles: "Default", "Minimal", "Cinema", "Focus", "Clean", "Wallpaper".
- Sin opción "Tema" / heredada del theme — el layout no es parte del theme.
- Cambiar persiste via `POST /api/config {home_layout_id: ...}` igual que cualquier otro override.

### 6. Fallback y re-render

Si el frontend pide `getLayout("foo")` y foo no existe → `DEFAULT_LAYOUT`. El orquestador no se entera, renderiza default.

Si el `home_layout_id` cambia vía `config_changed` event, App.tsx actualiza un `useState` y re-pasa `layout={...}` al `<Home>`. React desmonta y monta el subárbol — el nuevo layout aplica.

### 7. Persistencia y eventos

- POST `/api/config {home_layout_id: "minimal-layout"}` → backend persiste + publica `config_changed` con key=`home_layout_id` value=`"minimal-layout"`.
- Frontend recibe el evento, actualiza estado y aplica el nuevo layout.
- Sin WS especiales, sin polling — flujo idéntico al de `theme` y `theme_overrides`.

### 8. Tests

- Backend: `test_config.py` — persistencia + default + sanitización (string vacío cae a default).
- Frontend: `verify-home-layouts.mjs` — extiende el script de `home-layout`; valida los 6 layouts, cada uno tiene al menos wallpaper + clock, los overlays son correctos, y los 6 son distintos entre sí (≥2 distintos).
- Visual smoke: screenshots de los 6 layouts en Spotify Dark.

## Risks / Trade-offs

- **Re-mount del Home al cambiar layout**: hoy Home es un componente que se desmonta cuando App.tsx renderiza `<ChannelView>` (al elegir canal). Si el usuario cambia el layout mientras está en Home, React desmonta el Home actual y monta el nuevo — efectos de `useHomeState` se reinicializan (reloj, fetch wallpapers, etc.). Esto es **deseable** porque el nuevo layout puede no querer mostrar el clock, etc. — pero también significa que se pierde el `wpIndex` actual. Aceptable: el usuario explícitamente cambió el layout, no es un side-effect.
- **Backend no valida la lista de ids**: si el frontend define `LAYOUTS["foo"] = {...}` y un usuario setea `home_layout_id: "foo"` via API directa, el backend lo acepta y el frontend lo renderiza. Esto es un feature (extensibilidad) pero podría permitir un id "no soportado" si el frontend cambia. Mitigación: el frontend siempre aplica `getLayout()` que filtra desconocidos.
- **6 layouts = 6 opciones en el panel**: el segmented con 6 botones es ancho pero entra en 360px (verificado en smoke anterior del popover). Aceptable.

## Migration Plan

1. Backend: añadir `home_layout_id` a `KEYS` con default `"default"`. Test de persistencia + sanitización.
2. Frontend `layouts.ts`: agregar `LAYOUTS`, `getLayout`, los 5 layouts nuevos.
3. Frontend `App.tsx`: pasar `cfg.home_layout_id` (con fallback) al `<Home>`.
4. Frontend `AppearanceSettings.tsx`: sección "LAYOUT" con segmented de 6 opciones.
5. Frontend `api/client.ts`: `RuntimeConfig.home_layout_id?: string`.
6. Verificar: 98 tests backend + nuevo test + typecheck + build + smoke de los 6 layouts.

**Rollback**: git revert del commit. No hay cambios de backend que rompan API.
