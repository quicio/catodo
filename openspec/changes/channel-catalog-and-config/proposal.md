# Proposal

## Why

Hoy Cátodo sólo trae cuatro canales web (`youtube`, `tv`, `crunchyroll`,
`hbomax`) y no hay forma de descubrir ni agregar otros desde la UI. Además,
`POST /api/plugins/install` copia el plugin pero no registra el canal hasta
reiniciar, la URL por canal no se expone en `/api/config` y no existe pantalla
de configuración de canales. El operador queda limitado a lo que vino compilado
y a editar `config.json` a mano.

## What Changes

- **Catálogo de canales**: `GET /api/plugins` se complementa con el catálogo del
  repo (disponibles vs. instalados, `bundled` vs. instalable). Las entradas del
  índice dejan de auto-instalarse salvo que sean `bundled: true`.
- **Manifests nuevos** en `plugins-repo/`: `netflix`, `disneyplus`, `max`
  (id `hbomax` conservado por compatibilidad de sesión), `movistar`, `claro`,
  `appletv`, `paramount`, `pluto`. Todos declarativos (`type: web`, sin código).
- **Ciclo de vida real**: instalar registra el canal en el manager sin
  reiniciar, y se agrega desinstalar (`DELETE /api/plugins/{id}`) además de
  habilitar/deshabilitar.
- **Configuración por canal**: se exponen y persisten claves
  `channel_<id>_url` (validadas y local-only) para apuntar cada canal web a la
  URL regional o proveedor que corresponda; se puede fijar un override de orden.
- **UI de Canales**: nueva pestaña en Ajustes con canales instalados
  (activar/desactivar, URL, orden, desinstalar) y catálogo disponible
  (instalar), refrescada por eventos `plugins_changed`.
- **IPTV**: el canal IPTV nativo se muestra en la misma pantalla con su
  playlist configurable; no se convierte en manifest.

## Capabilities

### New Capabilities

<!-- Ninguna: el comportamiento vive en las capacidades existentes. -->

### Modified Capabilities

- `plugin-system`: catálogo disponibles/instalados, install registra el canal,
  uninstall, orden configurable.
- `channel-system`: el canal aparece/desaparece sin reiniciar y la URL
  configurada por canal se resuelve en runtime.
- `runtime-config`: claves `channel_<id>_url` expuestas, validadas y local-only.
- `frontend-kiosk`: pestaña Canales (instalados + catálogo) y refresco por
  eventos.

## Impact

- `rust/crates/catodo-server/src/plugins.rs`: catálogo, install→register,
  uninstall, orden.
- `rust/crates/catodo-server/src/api.rs`: rutas de catálogo/uninstall.
- `rust/crates/catodo-server/src/config.rs`: patrón de claves por canal.
- `plugins-repo/index.json` y nuevos `plugins-repo/<id>/manifest.json`.
- `frontend/src/api/client.ts`, `AppearanceSettings.tsx` (tab Canales),
  `api/ws.ts` (plugin/channel events).
- Specs y docs de operación (`docs/HANDOFF.md`, README de plugins).

## Non-goals

- **No** garantizar DRM en Netflix/Disney+/Prime: se ofrecen como webviews con
  ECS+Widevine y Chrome UA sujetos a lo que cada proveedor permita; la
  validación con cuenta real queda como tarea manual.
- **No** hay marketplace remoto: el catálogo es el repo local configurado
  (`plugin_repo`); no se ejecuta código de terceros.
- **No** se gestionan credenciales ni APIs privadas de los proveedores: el
  login ocurre dentro del webview y su sesión vive en el `partition`.
- **No** se incluye Prime Video en este change; se agrega con el mismo manifest
  cuando se valide.
- **No** se toca el contrato `Channel` ni se convierten canales nativos
  (Spotify, Anime, Arcade, IPTV) en plugins declarativos.
