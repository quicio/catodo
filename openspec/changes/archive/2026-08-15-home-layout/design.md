## Context

Hoy `Home.tsx` es un monolito de ~660 líneas que mezcla 9 secciones visuales (fondo Spotify, fondo wallpapers rotativos, overlay, reloj, mini now-playing Spotify, título "Cátodo" + subtítulo, grilla de canales, columna de ratings + ⚙, popover de configuración, modal de pair) con 11 useState, 5 useEffects, 1 fetch a `/api/pair/info`, 3 fetches a wallpapers (`/list`, `/cover`, `/artist`), 1 POST a `/fetch`, un `setInterval(1000)` para el reloj, un `setInterval(12000)` para la rotación, y un setTimeout de 600ms tras thumbs-down. Toda esta lógica y estado local pertenece a una sola "página" y se mezcla con el JSX de la composición. Acoplamientos clave: wallpapers/ratings/wpIndex/coverReady/showSpotifyBg se comparten entre fondo y columna de ratings; `state.spotify` dispara el efecto de fetch de wallpapers del artista; `showConfig` controla el popover; `showPair` controla el modal de pair. Ver auditoría completa en la conversación que precede este change.

La solución: extraer cada sección a un componente independiente (slot) bajo `frontend/src/components/home/`, centralizar el estado compartido en un hook `useHomeState()` (o contexto equivalente), y dejar `Home.tsx` como un orquestador puro que recibe `layout: HomeLayout` e itera `layout.components` resolviéndolos vía un registry `homeSlots`. La forma serializable del layout (`{layoutId, components: [{id, position?}, ...]}`) deja la puerta abierta a que un futuro ModeManager elija el layout sin tocar Home.

## Goals / Non-Goals

**Goals:**
- Refactor arquitectónico sin cambio observable de comportamiento para el usuario en el layout default.
- Composición declarativa del Home (`HomeLayout`) que pueda venir de prop, de constante exportada (`DEFAULT_LAYOUT`) o — en el futuro — de un selector dinámico.
- Registry de slots que desacopla id ↔ componente.
- Hook `useHomeState()` que centraliza el estado compartido por múltiples slots, para que cada slot sea testeable individualmente.
- Cero impacto en: WebSocket, theme engine, wallpapers backend, screensaver/IdleManager, CrtShell, ChannelBar, NowPlaying (Spotify full), voice feedback, remote/PWA, API contracts.

**Non-Goals:**
- Implementar Modes (Work/Focus/Nostalgia) ni ModeManager.
- Agregar widgets nuevos (tasks/pomodoro/weather/shortcuts).
- Editor visual de layouts (drag/drop).
- Cambiar APIs del backend, contratos de WS o `runtime_config`.
- Cambiar el comportamiento del theme engine, del clock o de los wallpapers (solo se mudan de archivo).

## Decisions

### 1. Estructura de archivos

```
frontend/src/components/home/
├── types.ts                 # HomeComponentId, HomeComponentConfig, HomeLayout, HomeSlotProps
├── layouts.ts               # DEFAULT_LAYOUT (8 componentes)
├── useHomeState.ts          # hook: estado compartido + callbacks + effects
├── registry.tsx             # homeSlots: Record<id, HomeSlot> + UnknownSlot fallback
├── Clock.tsx                # ClockSlot
├── Brand.tsx                # BrandSlot
├── MiniNowPlaying.tsx       # MiniNowPlayingSlot
├── ChannelGrid.tsx          # ChannelGridSlot
├── WallpaperBackground.tsx  # WallpaperBackgroundSlot
├── RatingsColumn.tsx        # RatingsColumnSlot (thumbs-up/down + ⚙)
├── AppearanceSettingsPopover.tsx  # AppearanceSettingsPopoverSlot
├── PairModal.tsx            # PairModalSlot
└── index.ts                 # barrel
```

`Home.tsx` queda como un orquestador de ~50 líneas que usa `useHomeState()` y renderiza `layout.components.map(c => <HomeSlot config={c} homeState={...} />)`. **Alternativa considerada**: un solo archivo grande con todos los slots. Descartado: el refactor no mejora la mantenibilidad.

### 2. Hook `useHomeState()` vs Context React

Opción A: hook con `useState` interno y expone `{...state, ...callbacks}`. El orquestador `Home` lo llama UNA vez y pasa `homeState={...}` como prop a cada slot.
Opción B: Context React (`HomeStateContext.Provider`) en Home, slots consumen con `useContext`.

**Decisión: A**. Razón: la API resultante es explícita (`<HomeSlot homeState={homeState} />` muestra en código qué necesita cada slot); no hay re-renders por consumidores que no usan una parte del estado; es testeable con un `homeState` mock directo en tests. **Alternativa considerada**: Context — descartada porque la complejidad no se justifica para un solo consumidor (Home).

### 3. Forma del `HomeLayout`

```ts
type HomeComponentId =
  | "wallpaper-background"
  | "clock"
  | "mini-now-playing"
  | "brand"
  | "channel-grid"
  | "ratings-column"
  | "appearance-settings-popover"
  | "pair-modal";

interface HomeComponentConfig {
  id: HomeComponentId;
  position?: "root" | "overlay";   // metadata; los overlays (pair-modal, appearance-settings-popover) salen del contenedor principal
}

interface HomeLayout {
  layoutId: string;
  components: HomeComponentConfig[];
}
```

`position: "overlay"` indica que el slot se monta como sibling del contenedor principal (no absolute encima), para mantener z-index/portalización coherente (pair-modal a z20, appearance-settings a z19). **Alternativa considerada**: una sola lista y que cada slot decida su posición con `position: fixed`. Descartado: deja la responsabilidad de z-index al slot, pero queremos que el orquestador pueda "agrupar" slots root vs overlay.

### 4. Registry con fallback `UnknownSlot`

`homeSlots` es `Record<HomeComponentId, HomeSlot>`. El orquestador resuelve con:
```ts
const Slot = homeSlots[config.id] ?? UnknownSlot;
```
donde `UnknownSlot` es un `<div hidden>` que no rompe el layout. **Alternativa**: lanzar error o warning de console. Descartado: la spec exige que un id desconocido no crashee Home — el fallback silencioso es el contrato.

### 5. Comunicación interna entre slots

Cada slot es "tonto" — recibe `homeState` y callbacks (`onPick`, `rate`, `toggleConfig`, `openPair`, `closePair`). Los slots NO se hablan entre sí. La única pieza de estado "compartida en dos lugares" es wallpapers/ratings/wpIndex/coverReady/showSpotifyBg — y por eso vive en `useHomeState()`, no en cada slot. **Alternativa**: event emitter propio. Descartado: overkill para 1 productor (useHomeState) y N consumidores.

### 6. `useHomeState()` — qué vive adentro

Lo que actualmente es estado local de Home.tsx:
- `wallpapers`, `ratings`, `wpIndex`, `loadingWp`, `artistWp`, `coverReady`, `showSpotifyBg` → **shared** (fondo + ratings column).
- `now`, `hovered`, `showConfig`, `showPair`, `pairInfo` → **shared** (clock + ratings column + popover + modal).

Todo lo que es local puro (`hovered` por canal) **se queda dentro del slot** (`ChannelGrid` lo tiene como `useState`).

Effects que el hook concentra: `setInterval(1000)` del reloj, `setInterval(12000)` de rotación de wallpaper, fetches a `/api/wallpapers/{list,cover,artist}`, POST a `/fetch`, fetch a `/api/pair/info`, manejo de `localStorage` de ratings. **No** concentra nada de WS ni de theme — eso lo maneja App.tsx.

### 7. Estado externo vs interno de `Home`

`Home` mantiene: `layout` (prop) + `homeState` (del hook). No tiene `useState` propio salvo trivial. Recibe `channels`, `onPick`, `state` (de `AppState`) por props.

### 8. Backward compat / rollback

`Home.tsx` actual sigue siendo el orquestador. Si por alguna razón un slot falla, el orquestador cae al `<UnknownSlot>` y el Home queda con un placeholder para esa sección. La composición default replica el Home actual → cero cambio observable. Si quisiéramos rollback, basta con git revert del change (sin tocar backend ni API contracts).

### 9. Tests

No hay infra de tests frontend hoy (no vi `vitest`, `jest`, `*.test.*` en `frontend/src`). La verificación será:
- `npx tsc --noEmit` (typecheck).
- `npm run build` (build de producción).
- Smoke manual con chromium headless en los 10 temas (mismo patrón que `theme-personalization`).
- Backend: 98 tests existentes siguen pasando sin cambios.

Si durante la implementación descubro que agregar vitest/jest es trivial y de valor para este refactor, lo agrego. Si no, dejo la verificación manual + build como en el change anterior. **Alternativa considerada**: agregar vitest solo para tests de registry/UnknownSlot. Decisión: solo si es < 30 min de setup; si no, queda en el plan original.

## Risks / Trade-offs

- **Acoplamiento del wallpaper/ratings entre fondo y columna** — `useHomeState()` los mantiene en una sola fuente de verdad; cada slot consume solo lo que necesita. Si alguien en el futuro quiere desacoplar Rating de Background, deberá refactorizar el hook (no Home).
- **Lógica de fetch de `/api/wallpapers/{list,cover,artist,fetch}` queda dentro de `useHomeState()`** — si en el futuro se quiere que el background se monte standalone fuera de Home, el hook se convierte en un provider o se mueve a un módulo `wallpapers/`. Decisión: aceptamos esa deuda técnica para mantener el scope acotado.
- **PairModal como slot "overlay"** — vive dentro de Home, no en App.tsx. Razón: solo se abre desde el botón "Conectar teléfono" de AppearanceSettings. Si en el futuro se quiere abrir desde otra parte (ej. voice command "emparejar"), se mueve a App.tsx o se eleva a un provider. Decisión: ahora vive como slot, fácil de mover.
- **`ChannelGrid` mantiene `CHANNEL_ICONS` y `COLORS` locales** — si el backend emite `ChannelInfo.icon`/`color` ya lo consume como fallback (L356 de Home actual). Refactor no toca esto: queda local hasta que un change futuro lo generalice.
- **Voice feedback overlay y ChannelBar no entran al `HomeLayout`** — siguen siendo siblings en App.tsx. El HomeLayout es solo la composición del Home, no de toda la app.

## Migration Plan

1. Crear `frontend/src/components/home/types.ts` + `layouts.ts` + `useHomeState.ts` + `registry.tsx` + 8 slots + `index.ts` (nuevo módulo).
2. Reescribir `frontend/src/components/Home.tsx` para ser orquestador (`Home.tsx` pasa de ~660 líneas a ~50).
3. Cambiar `frontend/src/App.tsx` para pasar `DEFAULT_LAYOUT` a `<Home>`.
4. Verificar: `npx tsc --noEmit`, `npm run build`, smoke con chromium headless de los 10 temas.
5. Si todo OK, commit + push. Si falla, iterar sobre el slot concreto.

**Rollback**: `git revert` del commit. No hay cambio de backend ni de API.

## Open Questions

Ninguna que deba resolverse ahora — todas las decisiones de diseño están tomadas y justificadas arriba. Las preguntas genuinamente deferibles (p. ej. "debería `useHomeState` ser un Context?") se responden en la sección de Decisions con su alternativa descartada.
