## 1. Módulo home/ — types y registry

- [x] 1.1 Crear `frontend/src/components/home/types.ts` con `HomeComponentId` (8 ids), `HomeComponentConfig`, `HomeLayout`, `HomeSlotProps`, `HomeSlot` (componente `(p: HomeSlotProps) => JSX.Element`)
- [x] 1.2 Crear `frontend/src/components/home/layouts.ts` con `DEFAULT_LAYOUT` (8 componentes en el orden actual: wallpaper-background, clock, mini-now-playing, brand, channel-grid, ratings-column, appearance-settings-popover, pair-modal; los dos últimos con `position: "overlay"`)
- [x] 1.3 Crear `frontend/src/components/home/registry.tsx` con `homeSlots: Record<HomeComponentId, HomeSlot>` (placeholder exports por ahora) + `UnknownSlot` que renderiza `<div hidden>`

## 2. Hook useHomeState

- [x] 2.1 Crear `frontend/src/components/home/useHomeState.ts` con el hook `useHomeState({state: AppState})` que encapsula: `wallpapers`, `ratings`, `wpIndex`, `loadingWp`, `artistWp`, `coverReady`, `showSpotifyBg`, `now`, `showConfig`, `showPair`, `pairInfo`, callbacks (`onPick`, `rate`, `toggleConfig`, `openPair`, `closePair`)
- [x] 2.2 Mover los 5 useEffects desde Home.tsx al hook: clock (setInterval 1000), wallpaper list fetch, artist fetch (cuando cambia spotify.artist/status/title), rotation (setInterval 12000), auto-descarga (MIN_VISIBLE=3), pair info fetch (cuando showPair)
- [x] 2.3 Mantener el handler `rate(id, rating)` con su setTimeout(600ms) post-down exacto al original

## 3. Slots individuales

- [x] 3.1 Crear `WallpaperBackground.tsx` (zIndex 0): capas Spotify cover blur + rotador nítido, o rotador general; consume `homeState.{wallpapers, artistWp, wpIndex, coverReady, showSpotifyBg}`
- [x] 3.2 Crear `Clock.tsx` (zIndex 2, top-left): el reloj actual + subtítulo fecha; consume `homeState.now`
- [x] 3.3 Crear `MiniNowPlaying.tsx` (zIndex 2, top-right): "NOW PLAYING" + título/artista; consume `homeState.state.spotify` y `showSpotifyBg`
- [x] 3.4 Crear `Brand.tsx` (zIndex 2, center): "Cátodo" + subtítulo "SELECCIONÁ UN CANAL"
- [x] 3.5 Crear `ChannelGrid.tsx` (zIndex 2, grid): la grilla de cards con hover/morph/icons/colores; consume `channels`, `onPick`, `theme.crtEnabled` (para hover); encapsula `CHANNEL_ICONS`, `COLORS`, `hovered` local
- [x] 3.6 Crear `RatingsColumn.tsx` (zIndex 3, fixed right): columna vertical con thumbs-up/down + ⚙; consume `homeState.{wallpapers, artistWp, wpIndex, ratings, showSpotifyBg, showConfig}`; abre el popover vía `homeState.toggleConfig()`
- [x] 3.7 Crear `AppearanceSettingsPopover.tsx` (position absolute, bottom 64 del botón, zIndex 20): encapsula el popover actual con `AppearanceSettings` adentro; cierra con click-outside (`onClick stopPropagation` + backdrop click)
- [x] 3.8 Crear `PairModal.tsx` (position fixed, fullscreen zIndex 20): modal QR actual; consume `homeState.{showPair, pairInfo, closePair}`
- [x] 3.9 Crear `index.ts` (barrel): re-exporta types, layouts, registry, useHomeState, y todos los slots

## 4. Orquestador Home y App

- [x] 4.1 Reescribir `frontend/src/components/Home.tsx` (~660 → ~50 líneas): usa `useHomeState(state)`, itera `DEFAULT_LAYOUT.components`, renderiza `<HomeSlot config={c} homeState={homeState} />` para cada uno. Slots con `position === "overlay"` se montan como siblings del contenedor principal
- [x] 4.2 Añadir en App.tsx el import `DEFAULT_LAYOUT` y pasarlo como prop al `<Home>`

## 5. Verificación

- [x] 5.1 `cd frontend && npx tsc --noEmit` — cero errores
- [x] 5.2 `cd frontend && npm run build` — bundle OK, sin warnings nuevos
- [x] 5.3 Smoke test con chromium headless: levantar backend en :8767, levantar vite, capturar screenshots de los 10 temas con `?openConfig` para confirmar que la galería de tema + personalización y el layout default renderizan idéntico al Home actual
- [x] 5.4 Smoke test manual del comportamiento: reloj actualiza, Spotify mini ahora suena, thumbnails rotan cada 12s, ratings persisten en localStorage, � abre popover, "Conectar teléfono" abre QR modal, Esc del App.tsx sigue saliendo al canal (sin interferir con el popover)
- [x] 5.5 Backend: `cd backend && uv run pytest tests/ -q` — 98 tests siguen pasando (no debiera romperse nada)
