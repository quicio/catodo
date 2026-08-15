# home-layouts Specification

## Purpose

Registro de layouts preset del Home y selección del layout activo vía `home_layout_id` en runtime config. El usuario puede elegir entre 6 layouts predefinidos (incluyendo el actual `default`) sin tocar código; un id desconocido cae al default sin romper Home.

## Requirements

### Requirement: 6 layouts preset disponibles

El frontend SHALL exponer 6 layouts preset en `LAYOUTS: Record<string, HomeLayout>` con los ids: `default` (el actual, intacto), `minimal-layout`, `cinema-layout`, `focus-layout`, `clean-layout`, `wallpaper-only-layout`. Cada layout SHALL componer un subconjunto distinto de slots y SHALL incluir al menos `wallpaper-background` y `clock`.

#### Scenario: Inventario completo

- **WHEN** se enumeran las keys de `LAYOUTS`
- **THEN** están los 6 ids listados, y cada uno resuelve a un `HomeLayout` válido

#### Scenario: Layout default preservado

- **WHEN** el usuario no configura nada (o configura `home_layout_id: "default"`)
- **THEN** se aplica exactamente el mismo layout que existía antes del change `home-layout` (8 componentes, mismo orden, dos overlays)

#### Scenario: Cada layout es distinto

- **WHEN** se comparan las listas de componentes de los 6 layouts
- **THEN** al menos 2 layouts tienen composición distinta de los demás (no son idénticos entre sí)

### Requirement: Selección vía `home_layout_id` en runtime config

El backend SHALL exponer la key `home_layout_id` (string, default `"default"`) en `/api/config`. El frontend SHALL leerla al boot y SHALL pasar el layout correspondiente al `<Home>`. La key SHALL persistirse con el mismo mecanismo que las demás (POST `/api/config`).

#### Scenario: Cambio desde el panel de settings

- **WHEN** el usuario selecciona un layout en el selector del panel de configuración
- **THEN** se persiste via `POST /api/config {home_layout_id: "<id>"}` y el Home se re-monta con el nuevo layout

#### Scenario: Boot aplica el layout configurado

- **WHEN** la app carga con `home_layout_id: "minimal-layout"` en config
- **THEN** el Home renderiza solo los slots del layout minimal

### Requirement: Fallback seguro a default

Un `home_layout_id` desconocido (no presente en `LAYOUTS` o string vacío) SHALL no romper Home: el backend SHALL devolver `"default"` en lecturas efectivas y el frontend SHALL aplicar el `DEFAULT_LAYOUT` si la key no resuelve.

#### Scenario: Id inválido en disco

- **WHEN** `config.json` tiene `home_layout_id: "this-does-not-exist"`
- **THEN** el getter efectivo devuelve `"default"` y el Home renderiza el layout default

#### Scenario: Id vacío

- **WHEN** `home_layout_id` es `""` o `null`
- **THEN** el getter efectivo devuelve `"default"`

### Requirement: Selector de Layout en panel de settings

El panel de configuración (AppearanceSettings) SHALL exponer un selector de Layout con los 6 ids como opciones etiquetadas. Cada opción SHALL tener la opción "Tema"/"Default" correspondiente — al menos el default SHALL poder seleccionarse. Cambiar el selector SHALL persistir vía `POST /api/config`.

#### Scenario: Selector visible

- **WHEN** el usuario abre el panel de configuración
- **THEN** aparece una sección "LAYOUT" con un control segmented/select listando los 6 layouts

#### Scenario: Reset al default

- **WHEN** el usuario elige el default en el selector
- **THEN** se persiste `"default"` y el layout vuelve al completo
