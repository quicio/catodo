# home-layout Specification

## Purpose
Abstracción `HomeLayout` que describe la composición del Home como una lista ordenada de componentes identificables por id, resueltos desde un registry de slots. La composición no depende de JSX hardcodeado en Home.tsx; el Home es un orquestador que itera el layout.
## Requirements
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


### Requirement: Home adaptable a ventana

El Home SHALL seguir siendo usable fuera de fullscreen (ventana en Hyprland/macOS): el reloj, la marca, la grilla y la columna de FONDO SHALL NOT superponerse ni recortar canales. Los tamaños SHALL escalar con el alto disponible (`vh` + `clamp`) y el ancho de la grilla SHALL calcularse contra el contenedor, no contra `100vw`, para no romperse con el zoom de UI.

#### Scenario: Ventana 1264×696

- **WHEN** la app corre en una ventana de 1264×696 en lugar de fullscreen
- **THEN** se ven los 9 canales, el reloj no pisa la grilla y la marca conserva su lugar

#### Scenario: Ventana baja

- **WHEN** el alto disponible baja de 640 px
- **THEN** la marca y el now-playing ceden su espacio, el reloj entra al flujo del layout y la grilla sigue completa

#### Scenario: Ventana angosta

- **WHEN** el ancho baja de 900 px (y de 640 px)
- **THEN** la grilla pasa a 3 (y 2) columnas antes que dejar nombres ilegibles

#### Scenario: Zoom de UI

- **WHEN** el operador cambia el zoom con Ctrl +/- o hay `ui_scale` persistido
- **THEN** la grilla mantiene el margen de la columna de FONDO y no se solapa con los botones de rating

### Requirement: Paginación de canales

Cuando haya más canales que una página (`columnas × 3 filas`: 12 en desktop, 9 en 3 columnas, 6 en 2), la grilla SHALL paginar en lugar de crecer y SHALL mostrar controles de página anterior/siguiente con un indicador `NN / MM`. La numeración `CH NN` y el atajo `Alt+C` + número SHALL seguir siendo globales, no por página. La última página SHALL reservar los slots vacíos para que el paginador y la marca no se muevan al cambiar de página.

#### Scenario: Más de 12 canales

- **WHEN** hay 13 o más canales en una ventana de 4 columnas
- **THEN** la primera página muestra los canales 1–12 y el paginador permite ir a la página 2 con los restantes

#### Scenario: Salto directo

- **WHEN** el canal 13 está en la página 2 y el operador usa `Alt+C` + `1` `3`
- **THEN** el canal se abre sin necesidad de cambiar de página antes

#### Scenario: Cambio de tamaño de ventana

- **WHEN** la ventana pasa de 4 a 3 columnas
- **THEN** el tamaño de página pasa de 12 a 9 y la página actual se mantiene dentro de rango
