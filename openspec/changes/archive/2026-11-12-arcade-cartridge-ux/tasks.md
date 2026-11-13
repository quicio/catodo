## 1. Navegación de 2 niveles

- [x] 1.1 Refactor de `ArcadeLauncher.tsx`: estado `selectedSystem`; grilla de consolas (carátula representativa + nombre + contador) y grilla de juegos de la consola elegida.
- [x] 1.2 Teclado por nivel: flechas/Enter en consolas; flechas/Enter/Esc en juegos (Esc vuelve a consolas).

## 2. Cartucho 3D

- [x] 2.1 Mapa `CARTRIDGE_TYPES` (kind cart/jewel/marquee + ratio fallback por sistema) en el frontend.
- [x] 2.2 Componente/estilos de cartucho: cara frontal = carátula, `perspective` + `rotateY/rotateX`, lomo por gradientes y pestaña según `kind`; se levanta al enfocar.
- [x] 2.3 Leer `naturalWidth/naturalHeight` al `onLoad` de la imagen para fijar la proporción real (fallback al ratio del tipo).

## 3. Verificación

- [x] 3.1 E2E visual: entrar a una consola → se ven sus juegos como cartuchos con la proporción de su carátula; Esc vuelve a consolas; Enter lanza; sin carátula usa el fallback.
- [x] 3.2 Verificar que el indicador "JUGANDO" y el zapping existente no se rompan.
