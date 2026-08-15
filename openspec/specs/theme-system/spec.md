# theme-system Specification

## Purpose
Sistema de themes para Cátodo: paletas de color definidas por tokens, themes predefinidos y custom, con selector en la UI y persistencia en la config del backend.
## Requirements
### Requirement: Tokens de color

The system SHALL define the UI appearance through CSS custom properties (tokens) covering at least: fondo, superficie, texto primario, texto secundario, acento, acento-suave, borde, danger, success, y colores por canal (spotify, youtube, tv, anime, crunchyroll, arcade).

#### Scenario: Tokens presentes

- **WHEN** se aplica un theme
- **THEN** las variables CSS de la paleta están definidas en el `:root` y los componentes las consumen en lugar de literales.

### Requirement: Themes predefinidos

The system SHALL ship at least 3 themes predefinidos seleccionables, cubriendo modos distintos (oscuro, claro, y variante con acento diferente). Cada theme SHALL definir la paleta completa de tokens y el modo de color.

#### Scenario: Tema oscuro por defecto

- **WHEN** el sistema arranca sin theme configurado
- **THEN** se aplica el theme por defecto (oscuro, con el acento verde actual).

#### Scenario: Cambio de theme predefinido

- **WHEN** el usuario selecciona otro theme predefinido
- **THEN** la UI cambia los tokens y el modo de color al instante.

### Requirement: Themes custom por JSON

The user SHALL be able to define themes propios en `<data_dir>/config.json` bajo la clave `themes`, cada uno con el mismo esquema de tokens que los predefinidos, sin tocar código.

#### Scenario: Theme custom aplicado

- **WHEN** se define un theme custom en config.json y se selecciona
- **THEN** la UI lo aplica igual que un theme predefinido.

#### Scenario: Theme custom inválido

- **WHEN** un theme custom tiene tokens inválidos o incompletos
- **THEN** el sistema lo ignora y mantiene el theme activo anterior sin romperse.

### Requirement: Persistencia del theme activo

The active theme SHALL be stored in the backend runtime config (clave `theme`) and SHALL survive backend restarts.

#### Scenario: Theme persiste tras reinicio

- **WHEN** se selecciona un theme y el backend se reinicia
- **THEN** la UI arranca con ese theme activo.

### Requirement: Efectos CRT configurables

The theme SHALL control si se aplican los efectos CRT (scanlines y vignette) a través del token correspondiente, y el usuario SHALL poder apagarlos sin cambiar de theme.

#### Scenario: CRT off

- **WHEN** el theme o la config desactivan los efectos CRT
- **THEN** la UI no renderiza scanlines ni vignette.

#### Scenario: CRT on

- **WHEN** los efectos CRT están activos
- **THEN** scanlines y vignette se aplican sobre todos los canales excepto la proyección de pantalla (cast).

### Requirement: Modo claro/oscuro por theme

Each theme SHALL define el `color-scheme` (dark/light) y el frontend SHALL aplicarlo de modo que los colores del sistema (scrollbars, inputs) sigan al theme.

#### Scenario: Tema claro

- **WHEN** se activa un theme claro
- **THEN** el `color-scheme` es `light` y los fondos son claros.

#### Scenario: Tema oscuro

- **WHEN** se activa un theme oscuro
- **THEN** el `color-scheme` es `dark` y los fondos son oscuros.

