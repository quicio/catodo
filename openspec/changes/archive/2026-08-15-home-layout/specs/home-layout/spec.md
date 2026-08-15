## Purpose

Abstracción `HomeLayout` que describe la composición del Home como una lista ordenada de componentes identificables por id, resueltos desde un registry de slots. La composición no depende de JSX hardcodeado en Home.tsx; el Home es un orquestador que itera el layout.

## ADDED Requirements

### Requirement: HomeLayout declarativo

Un `HomeLayout` SHALL ser un objeto con `layoutId` (string) y `components` (lista ordenada de `HomeComponentConfig`). Cada `HomeComponentConfig` SHALL tener `id` (referencia a un `HomeComponentId` válido del registry) y MAY tener `position` (string libre). El orden de la lista SHALL ser el orden de composición visual de izquierda a derecha, arriba a abajo.

#### Scenario: Layout serializable

- **WHEN** un layout se serializa a JSON
- **THEN** debe round-trippear sin perder información (mismas keys, mismos valores, mismo orden)

#### Scenario: Lista vacía

- **WHEN** `layout.components` es `[]`
- **THEN** el Home renderiza un placeholder vacío sin errores

### Requirement: Home Component Registry

El sistema SHALL exponer un registry (`homeSlots`) que mapea cada `HomeComponentId` válido a un componente React. Cada componente del registry SHALL recibir un objeto `props` común (config, homeState compartido, callbacks compartidos) y SHALL renderizarse independientemente.

#### Scenario: Resolver componente conocido

- **WHEN** el orquestador encuentra un `id` que existe en `homeSlots`
- **THEN** renderiza el componente correspondiente

#### Scenario: Id desconocido no rompe Home

- **WHEN** el orquestador encuentra un `id` que NO existe en `homeSlots`
- **THEN** renderiza un fallback silencioso (componente `Unknown`) sin propagar error ni crashear el Home entero

### Requirement: Orquestador Home

El componente `Home` SHALL recibir `layout: HomeLayout` (con default = `DEFAULT_LAYOUT`) y SHALL iterar `layout.components` en orden, renderizando cada uno con `<HomeSlot config={c} />`. El Home SHALL NO contener JSX propio de las secciones (sin reloj hardcoded, sin grilla hardcoded, etc.) — solo el contenedor y los slots.

#### Scenario: Default layout reproduce Home actual

- **WHEN** Home se monta sin pasar `layout` explícito
- **THEN** usa `DEFAULT_LAYOUT` y la composición visible (reloj, brand, grilla, ratings, theme popover, pair modal) es la misma que antes del refactor

#### Scenario: Composición modificable vía configuración

- **WHEN** se pasa un layout con un subconjunto de componentes o en otro orden
- **THEN** el Home renderiza exactamente esos componentes en ese orden

### Requirement: Estado compartido entre slots vía hook

El Home SHALL exponer a los slots un objeto `homeState` (vía hook `useHomeState()` o contexto equivalente) con las piezas de estado que múltiples slots necesitan: `wallpapers`, `ratings`, `wpIndex`, `artistWp`, `coverReady`, `showSpotifyBg`, `now`, `showConfig`, `showPair`, `pairInfo`, y los callbacks `onPick`, `rate`, `toggleConfig`, `openPair`, `closePair`. Cada slot SHALL consumir solo lo que necesita.

#### Scenario: Reactividad compartida

- **WHEN** un slot muta parte del estado compartido (p. ej. `rate` cambia un rating)
- **THEN** los otros slots que leen ese estado se re-renderizan automáticamente

#### Scenario: Estado local no se filtra

- **WHEN** un slot tiene estado local propio (no compartido, p. ej. `hovered` por canal)
- **THEN** ese estado queda dentro del slot y no contamina `homeState`

### Requirement: Slots cubren el Home actual como mínimo

El layout `DEFAULT_LAYOUT` SHALL componer al menos los siguientes slots (con sus ids en `homeSlots`): `wallpaper-background`, `clock`, `mini-now-playing`, `brand`, `channel-grid`, `ratings-column`, `appearance-settings-popover`, `pair-modal`. Cada uno SHALL corresponder a una sección actualmente presente en el Home.

#### Scenario: Inventario completo

- **WHEN** se enumeran los slots del `DEFAULT_LAYOUT`
- **THEN** los 8 ids listados están presentes y cada uno tiene un componente renderizable

#### Scenario: Agregar un slot futuro

- **WHEN** se agrega un nuevo par (id, componente) a `homeSlots` y se lo incluye en un layout
- **THEN** se renderiza sin modificar Home ni los otros slots

### Requirement: Preparado para Modes sin implementarlos

La arquitectura SHALL permitir que un futuro componente (p. ej. `ModeManager`) decida qué `HomeLayout` pasar al `<Home>`. El orquestador SHALL aceptar el layout como prop y SHALL NO tener lógica de selección interna.

#### Scenario: Layout desde prop

- **WHEN** un caller pasa `<Home layout={someLayout} />`
- **THEN** Home usa ese layout sin fallback automático a otro

#### Scenario: Sin state global de Modes

- **WHEN** se inspecciona el código de Home
- **THEN** no hay referencias a Modes, ModeManager, ni selección de layout desde un store global de modos
