# Spec Delta — plugin-system

## ADDED Requirements

### Requirement: Set mínimo de plugins bundled

El repositorio SHALL marcar como `bundled: true` únicamente YouTube; TV, Crunchyroll, Max y los proveedores regionales SHALL quedar como `bundled: false` para instalarse desde el catálogo.

#### Scenario: Instalación nueva

- **WHEN** Cátodo arranca por primera vez con el data dir vacío
- **THEN** sólo YouTube se siembra como plugin bundled; no se copian TV, Crunchyroll, Max ni proveedores

#### Scenario: Proveedores disponibles

- **WHEN** se consulta `GET /api/plugins/catalog` en una instalación nueva
- **THEN** TV, Crunchyroll, Max y los proveedores aparecen como disponibles (`installed: false`)

#### Scenario: Instalar proveedor desde Ajustes

- **WHEN** el operador instala TV, Crunchyroll, Max o un proveedor desde el catálogo
- **THEN** se copia, se habilita y su canal se registra sin reiniciar

#### Scenario: Instalaciones existentes

- **WHEN** un data dir ya tiene TV, Crunchyroll o Max instalados antes de este cambio
- **THEN** siguen instalados hasta que el operador los desinstale; no se borran automáticamente
