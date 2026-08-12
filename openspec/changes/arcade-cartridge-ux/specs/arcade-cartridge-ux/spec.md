## Purpose

Mejora el launcher Arcade con un menú de dos niveles por consola y cartuchos 3D que usan la carátula como cara frontal con su proporción real.

## ADDED Requirements

### Requirement: Menú por consola
El launcher Arcade SHALL organizarse en dos niveles: primero la selección de consola y luego sus juegos.

#### Scenario: Grilla de consolas
- **WHEN** se abre el canal Arcade
- **THEN** se muestra una grilla de consolas, cada una con su nombre, contador de juegos y una carátula representativa

#### Scenario: Entrar a una consola
- **WHEN** el usuario elige una consola
- **THEN** se muestra la grilla de juegos de esa consola

#### Scenario: Volver
- **WHEN** el usuario presiona Esc o el botón de volver estando en una consola
- **THEN** se regresa a la grilla de consolas

### Requirement: Cartucho 3D por sistema
El sistema SHALL renderizar cada juego como un cartucho/caja 3D cuya forma depende del sistema.

#### Scenario: Forma según sistema
- **WHEN** se muestra un juego
- **THEN** su cartucho usa la forma/estilo definido para su sistema (cartucho vertical, ancho, jewel case, etc.)

#### Scenario: Carátula como cara frontal
- **WHEN** el juego tiene carátula
- **THEN** la carátula es la cara frontal del cartucho, con efecto de perspectiva/rotación

### Requirement: Proporción según la carátula
El cartucho SHALL respetar la relación de aspecto de la carátula real.

#### Scenario: Con carátula
- **WHEN** la carátula se carga
- **THEN** la cara frontal del cartucho usa su proporción real (ancho/alto de la imagen)

#### Scenario: Sin carátula
- **WHEN** el juego no tiene carátula
- **THEN** el cartucho usa la proporción por-sistema del tipo de cartucho con un placeholder

### Requirement: Navegación con teclado
La navegación con teclado SHALL funcionar en ambos niveles.

#### Scenario: En consolas
- **WHEN** se presionan las flechas en la grilla de consolas
- **THEN** el foco se mueve entre consolas y Enter entra a la seleccionada

#### Scenario: En juegos
- **WHEN** se presionan las flechas en la grilla de juegos
- **THEN** el foco se mueve entre juegos, Enter lanza y Esc vuelve a consolas
