## Why

El Home de Cátodo es hoy un monolito de un solo archivo (`Home.tsx`, ~660 líneas) con la composición completa hardcoded en JSX — fondo, wallpaper, reloj, Spotify mini-now-playing, grilla de canales, columna de ratings, popover de tema y modal de pair, todo entrelazado por 5 useEffects y 11 useState. Cada vez que se quiera agregar un nuevo elemento (tasks, pomodoro, shortcuts, weather) o habilitar una composición distinta (futuros Modes: Work, Focus, Nostalgia), hay que reescribir Home.tsx y mover la lógica de estado compartida (wallpapers, ratings, wpIndex, coverReady) entre componentes — exactamente el acoplamiento que este change quiere evitar.

## What Changes

- Introducir el concepto `HomeLayout`: una estructura declarativa (JSON-serializable) que describe la composición del Home como una lista ordenada de `HomeComponentConfig`s (`{id, position?}`).
- Introducir un **registry de slots** (`homeSlots`): mapa `HomeComponentId → React component`. Agregar un nuevo widget es sumar un id al union type + un componente + un entry en el registry. Sin tocar Home.tsx.
- Refactorizar Home.tsx para que sea **solo un orquestador**: recibe `layout: HomeLayout`, itera `layout.components` y renderiza cada uno vía `<HomeSlot config={c} state={homeState} />`.
- Extraer las 9 secciones actuales del Home a componentes slot independientes bajo `frontend/src/components/home/` (Clock, Brand, MiniNowPlaying, ChannelGrid, RatingsColumn, WallpaperBackground, AppearanceSettingsPopover, PairModal + el contenedor Home). Cada uno consume del hook compartido `useHomeState()` las piezas de estado que necesita.
- El layout **`default`** (`DEFAULT_LAYOUT`) reproduce exactamente la composición actual del Home — sin cambios visuales.
- Cero impacto en: App.tsx (más allá de pasarle el layout al Home), WebSocket, themes, wallpapers backend, screensaver/IdleManager, remote/PWA.
- **No** se implementan Modes ni nuevos widgets — solo se deja la arquitectura preparada.

## Capabilities

### New Capabilities
- `home-layout`: Abstracción `HomeLayout` declarativa que describe la composición del Home como lista ordenada de componentes; registry de slots que los resuelve por id; orquestador (`Home`) que itera el layout.

### Modified Capabilities
- `frontend-kiosk`: La pantalla del Home deja de ser una composición rígida y pasa a renderizarse desde una `HomeLayout`. La composición default reproduce la actual; el comportamiento funcional (reloj, Spotify mini, wallpapers, ratings, theme settings, pair) no cambia.

## Impact

**Frontend** (todo el alcance):
- `frontend/src/components/Home.tsx` — refactor mayor: queda como orquestador delgado.
- `frontend/src/components/home/` — **nuevo**: types.ts, registry.tsx, layouts.ts, useHomeState.ts, y 9 slots (Clock, Brand, MiniNowPlaying, ChannelGrid, RatingsColumn, WallpaperBackground, AppearanceSettingsPopover, PairModal, index.ts).
- `frontend/src/App.tsx` — pasa `DEFAULT_LAYOUT` al `<Home>`.

**Sin impacto**:
- Backend (98 tests siguen pasando sin cambios).
- `CrtShell`, `ChannelBar`, `IdleScreensaver`, voice feedback overlay.
- `theme.ts`, `icons.tsx`, `runtime_config`, WebSocket, Spotify.
- Remote/PWA.
- API contracts.
