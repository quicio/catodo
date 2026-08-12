## Why

El launcher Arcade hoy muestra las 3 consolas y sus ~690 juegos en una sola grilla larga: es abrumador y no se siente a una recreativa. Un flujo "primero elegís la consola" + cartuchos 3D con la carátula como cara frontal convierte la biblioteca en una experiencia tipo máquina arcade.

## What Changes

- **Navegación de 2 niveles**: al abrir Arcade se ve la **grilla de consolas** (carátula representativa del primer juego con carátula + nombre + contador de juegos). Al elegir una consola se entra a la **grilla de sus juegos**, con vuelta atrás (Esc o botón).
- **Cartucho 3D por sistema**: cada juego se renderiza como un cartucho/caja 3D (perspectiva + rotación) cuya cara frontal es la carátula. La **forma** depende del sistema (cartucho vertical SNES, ancho NES, jewel case PSX, etc.) vía un mapa `CARTRIDGE_TYPES`.
- **Proporción según la carátula**: al cargar la imagen se lee su relación de aspecto real (`naturalWidth/naturalHeight`) y el cartucho la respeta; si no hay carátula, se usa el ratio por-sistema del tipo de cartucho.
- **Navegación con teclado** adaptada a los 2 niveles (flechas + Enter + Esc para volver).

## Capabilities

### New Capabilities
- `arcade-cartridge-ux`: launcher Arcade con menú por consola y cartuchos 3D proporcionales a la carátula.

### Modified Capabilities
- Ninguna.

## Impact

- **Frontend**: refactor de `ArcadeLauncher.tsx` (estado `selectedSystem`, grilla de consolas, grilla por consola), mapa `CARTRIDGE_TYPES` y CSS 3D. Sin backend/API nuevos.
- **Otros**: verificación visual, README si aplica.

## Non-goals

- No librerías de animación/3D (CSS puro).
- No cambios de backend ni de la API.
- No metadatos adicionales por juego (año, género, etc.).
- No animaciones de inserción de cartucho (solo el look 3D).
