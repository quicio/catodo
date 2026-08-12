## Context

`ArcadeLauncher.tsx` hoy renderiza todas las consolas (`data.systems`) con sus juegos en una grilla única, con navegación por flechas sobre una lista plana y `Enter` para lanzar. El backend ya expone `systems[{name, games[]}]` con `boxart` (URL `/api/channels/arcade/boxart?path=`). Todo el cambio es frontend.

## Goals / Non-Goals

**Goals:**
- Dos niveles de navegación (consolas → juegos).
- Cartucho 3D con forma por sistema y proporción real de la carátula.
- Mantener el lanzamiento (Enter) y el indicador "JUGANDO".

**Non-Goals:**
- Backend/API, librerías 3D, animaciones de inserción, metadatos por juego.

## Decisions

### 1. Estado de navegación en `ArcadeLauncher`
`selectedSystem: string | null`. `null` → grilla de consolas; si no, grilla de juegos de esa consola. El teclado:
- En consolas: flechas → índice de consola; `Enter` → `setSelectedSystem`.
- En juegos: flechas → índice de juego; `Enter` lanza; `Esc` → `setSelectedSystem(null)`.
Se reutiliza la lógica de `columns` y `scrollIntoView` actuales por nivel.

### 2. Grilla de consolas
Cada tarjeta: carátula representativa (primer juego del sistema con `boxart`, o placeholder), nombre de la consola y contador `N juegos`. Al elegir se guarda en `selectedSystem`.

### 3. Mapa `CARTRIDGE_TYPES`
```ts
{ kind: "cart" | "jewel" | "marquee"; ratio: number }  // ratio = width/height fallback
```
Con sistemas conocidos (snes→vertical, nes→ancho, genesis/megadrive→cart, psx/ps1→jewel, gba/gb→cart, mame/arcade→marquee, …) y `default: { kind: "cart", ratio: 0.75 }`. El `kind` define la silueta (pestaña superior de cartucho, lomo de jewel case, etc.) vía clases CSS; el `ratio` solo es fallback.

### 4. Proporción real de la carátula
Se usa un componente cartucho que, al `onLoad` del `<img>`, lee `naturalWidth/naturalHeight` y setea `aspectRatio` en el contenedor. Sin boxart (o antes del load), usa `type.ratio`. Así el cartucho mantiene la misma medida que la carátula sin distorsión.

### 5. Efecto 3D (CSS puro)
- Contenedor con `perspective`.
- Cara frontal: la carátula, con `transform: rotateY(-16deg) rotateX(4deg)` en reposo y `transform-style: preserve-3d`.
- Espesor/lomo: pseudo-elementos con gradientes simulando el canto del cartucho (sin caras 3D reales para mantenerlo liviano con ~690 juegos).
- Al enfocar/hover: `rotateY(0)` + `translateZ` (se "levanta").
- `kind` "cart" → pestaña superior (label); "jewel" → borde/lomo del case; "marquee" → proporción panorámica.

## Risks / Trade-offs

- **Performance con cientos de juegos** → solo se ven los juegos de la consola elegida (no la lista completa), y el 3D es por CSS (compositor). Aceptable.
- **Proporción desconocida antes del load** → fallback por-sistema evita saltos bruscos; al cargar la imagen el cartucho se ajusta suavemente (transición).
- **Formas imperfectas** → es un look estilizado, no geometría exacta por cartucho físico.
