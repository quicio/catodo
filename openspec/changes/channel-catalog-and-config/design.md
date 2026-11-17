# Design

## Context

Ver `proposal.md` — Why. El estado actual que condiciona el diseño:

- `plugins-repo/` funciona hoy como catálogo **y** como origen de siembra.
  `main.rs` llama `seed_bundled` y luego `build_default_channels`, que lee
  manifests de `plugins-repo/` **y** de `~/.local/share/catodo/plugins/`, sin
  filtrar por `enabled`. El repo se comporta como "todo instalado".
- `plugins.rs` ya persiste estado por plugin (`enabled`, `origin`, `version`) y
  publica `plugins_changed`. `install` copia archivos pero no registra el canal;
  `set_enabled` sí registra/desregistra.
- `WebChannel` resuelve `channel_<id>_url` y luego el `config_key` del manifest.
  `POST /api/config` sólo acepta las claves estáticas de `KEYS`; las claves por
  canal no se exponen ni se validan, y no están marcadas local-only.
- El frontend no tiene cliente ni UI de plugins; sólo escucha `state_snapshot`
  para refrescar canales.

## Goals / Non-Goals

**Goals:**

- Separar catálogo (repo) de instalados (data dir) y hacer que el arranque
  registre únicamente plugins instalados y habilitados.
- Ciclo de vida completo y observable sin reinicio: instalar/desinstalar,
  habilitar/deshabilitar, ordenar.
- URL por canal configurable y segura (http/https, local-only).
- Una pantalla "Canales" que cubra plugins y canales nativos.
- Catálogo declarativo con los proveedores pedidos, sin código de terceros.

**Non-Goals:**

- Garantizar DRM de cada proveedor; sólo se marca `drm` y se valida a mano.
- Marketplace remoto, autenticación de proveedores o scraping.
- Convertir Spotify/Anime/Arcade/IPTV en manifests.
- Sincronizar plugins entre dispositivos o gestionar actualizaciones
  automáticas fuera del repo local.

## Decisions

### 1. Repo = catálogo; data dir = instalado

`plugins-repo/index.json` describe canales disponibles. `bundled: true` se
siembra en el arranque; `bundled: false` sólo se copia al instalar. El arranque
lee **sólo** `data_dir/plugins/` y registra los manifests con estado
`enabled != false`.

- **Por qué**: es la única forma de ofrecer "instalables" sin que aparezcan
  solos. Además corrige el bug actual de que un plugin deshabilitado se registre
  al arrancar.
- **Alternativa descartada**: mantener el repo como runtime y usar una lista de
  ocultos; duplica la fuente de verdad y no escala.

### 2. Catálogo en la API de plugins

Se agrega `GET /api/plugins/catalog`, que hace join entre:
- entradas del `index.json` (id, name, version, bundled),
- directorios instalados (versión del manifest local),
- estado persistido (`enabled`, `origin`).

`GET /api/plugins` sigue devolviendo sólo instalados. Las entradas del catálogo
incluyen metadatos del manifest necesarios para la UI: `url`, `user_agent`,
`partition`, `drm`, `order`.

- **Por qué**: una sola llamada para pintar instalados + disponibles sin que el
  frontend lea el filesystem ni conozca el repo.
- **Alternativa descartada**: que el frontend lea `index.json`; rompe la regla
  "la UI consume la API y nada más".

### 3. Instalar registra; desinstalar desregistra

`install` valida el manifest antes de copiar, persiste `enabled: true` y llama
al mismo camino de registro que `enable` (`channel_from_manifest` +
`manager.register` + `reorder`). Si falla el registro, se revierte la copia y el
estado. `DELETE /api/plugins/{id}`:
- 409 si el índice lo marca `bundled: true` (se deshabilita, no se desinstala),
- 404 si no está instalado,
- borra `plugins/<id>/`, su estado, y desregistra el canal.

Después de cualquier cambio se publica `plugins_changed`; si el canal actual
desapareció se publica además `channel_changed` con `channel_id: null`.

- **Por qué**: cumple "sin reiniciar" y evita estados zombis.
- **Alternativa descartada**: exigir reinicio; rompe la UX de kiosko 24/7.

### 4. Orden como override del manager

El estado del plugin acepta `order: number|null`. En vez de reconstruir el
canal, `ChannelManager` mantiene un mapa de overrides `id -> order` que usa
`reorder()` para ordenar (override → `info.order` → nombre). Se carga desde el
estado de plugins al arrancar y se actualiza con
`POST /api/plugins/{id}/order`.

- **Por qué**: reordenar no debe cerrar el canal actual ni perder su estado.
- **Alternativa descartada**: mutar `ChannelInfo.order` y re-registrar; corta la
  sesión y complica el rollback.

### 5. URL de canal: clave genérica validada y local-only

- `POST /api/config` acepta `channel_<slug>_url` además de `KEYS`.
- Validación: URL absoluta `http`/`https`, host no vacío, largo máximo.
- `GET /api/config` añade `channel_<id>_url` para cada canal web instalado, con
  la URL efectiva.
- `is_local_only_key` reconoce el patrón: un remote no puede redirigir canales.
- `WebChannel` sigue prefiriendo la clave genérica; los `config_key` legacy
  (`tv_url`, `youtube_url`, `crunchyroll_url`) quedan como fallback.

- **Por qué**: los manifiestos nuevos no necesitan tocar `KEYS` y el operador
  puede fijar la URL regional desde Ajustes.
- **Alternativa descartada**: una clave estática por proveedor; obliga a
  recompilar por cada canal nuevo.

### 6. Manifests del catálogo

Se agregan en `plugins-repo/<id>/manifest.json` (todos `type: web`, sin código):
`netflix`, `disneyplus`, `movistar`, `claro`, `appletv`, `paramount`, `pluto`.
`hbomax` conserva id y `partition` (para no perder la sesión) pero pasa a
nombre "Max" y `https://www.max.com` en una versión nueva. `tv` sigue siendo el
canal genérico; `movistar`/`claro` son presets de proveedor.

Los que usan Widevine declaran `"drm": true`. La UI muestra un aviso; no se
promete reproducción. `pluto` (free) y `movistar`/`claro` según región quedan
sujetos a validación manual.

- **Por qué**: el catálogo crece sin tocar Rust; el aviso evita expectativas
  falsas.
- **Alternativa descartada**: renombrar `hbomax` a `max`; perdería la sesión y
  el estado persistido.

### 7. UI: pestaña Canales

Nueva tab en `AppearanceSettings`:
- **Instalados**: nombre, origen, versión, estado; acciones enable/disable,
  desinstalar (no bundled), editar URL (web) y orden (subir/bajar o número).
- **Disponibles**: entradas del catálogo con Instalar; muestra badge DRM.
- **Nativos**: canales que no están en `/api/plugins` (Spotify, Anime, Arcade,
  IPTV) sin acciones de instalación; IPTV expone `iptv_playlist`.
- La lista se refresca al recibir `plugins_changed` (refetch de
  `/api/channels` y del catálogo) y el Home/barra se actualizan desde el estado
  central.

- **Por qué**: concentra el ciclo de vida en Ajustes sin crear otra pantalla.
- **Alternativa descartada**: gestión sólo por API/CLI; el kiosko no tiene
  terminal.

### 8. Eventos y consistencia

Se mantiene el patrón event-driven: `plugins_changed` para el ciclo de vida,
`config_changed` para URLs, `channel_changed` para el canal actual. El frontend
no hace polling; al reconectar, `state_snapshot` ya trae `available_channels`.

## Risks / Trade-offs

- **DRM bloqueado por el proveedor** → se marca `drm: true`, se documenta como
  best-effort y se valida con cuenta real antes de anunciarlo como soportado.
- **Cambio de arranque oculta canales si falla la siembra** → `seed_bundled`
  corre antes de registrar; tests de arranque con data dir vacío y con plugin
  deshabilitado.
- **URL de canal maliciosa/typo** → validación http/https + local-only; error
  400/403 sin pisar el valor anterior.
- **Desinstalar el canal actual deja la UI colgada** → `channel_changed: null`
  y refetch de estado; test de manager sin canal actual.
- **Reordenar con canales nativos** → los overrides sólo aplican a ids de
  plugin; los nativos conservan su `order`.
- **Claves legacy vs genéricas** → la genérica gana; se documenta la migración y
  se evita borrar las legacy para no romper configs existentes.

## Migration Plan

1. Sembrar bundled como hoy; los plugins ya instalados siguen en
   `data_dir/plugins` con su estado (`version` se conserva).
2. El arranque nuevo deja de leer el repo: un canal no-bundled que estuviera
   apareciendo sin instalarse deja de aparecer hasta que se instale (esperado).
3. `hbomax` recibe manifest nuevo por versión; la sesión se conserva por
   `partition: persist:hbomax`.
4. UI escribe `channel_<id>_url`; las claves legacy siguen funcionando como
   fallback.
5. Rollback: revertir el change. Los plugins instalados y las claves genéricas
   son inertes para el código anterior (las claves se ignoran como
   desconocidas); no hay migración destructiva de datos.

## Open Questions

Ninguna que bloquee el diseño. La única validación externa es probar con cuenta
real qué proveedores DRM cargan en ECS (Netflix, Disney+, Max, Apple TV+,
Paramount+, Movistar, Claro) antes de prometerlos.
