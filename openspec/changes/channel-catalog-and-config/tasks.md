# Tasks

## 1. Catálogo y arranque desde instalados

- [x] 1.1 Cambiar `build_default_channels` para leer sólo `data_dir/plugins` y filtrar por estado `enabled != false`, dejando el repo como fuente de siembra/instalación; verificar con `cargo test -p catodo-server` que un manifest no-bundled del repo no se registra solo y que uno deshabilitado tampoco.
- [x] 1.2 Implementar `GET /api/plugins/catalog` con join de `index.json`, directorios instalados y estado persistido; verificar con un test que devuelve una entrada `bundled: false` como `installed: false` y una instalada como `installed: true`.
- [x] 1.3 Exponer metadatos del manifest en `/api/plugins` y `/api/plugins/catalog` (`url`, `user_agent`, `partition`, `drm`, `order`); verificar que el JSON del test incluye `drm` y `url` para un canal web.

## 2. Ciclo de vida de plugins

- [x] 2.1 Hacer que `install` valide el manifest, copie, persista `enabled: true` y registre el canal con `channel_from_manifest` + `manager.register` + `reorder`, revirtiendo copia/estado si falla; verificar con un test que tras instalar, `/api/channels` incluye el canal sin reiniciar.
- [x] 2.2 Agregar `DELETE /api/plugins/{id}` con 404 si no está instalado y 409 si es `bundled`, borrando directorio/estado y desregistrando el canal; verificar que al desinstalar el canal actual `/api/state` reporta `current_channel_id: null`.
- [x] 2.3 Persistir `order` por plugin y aplicar overrides en `ChannelManager::reorder` sin reconstruir el canal; verificar con tests que el orden cambia, se quita el override y sobrevive a un reinicio simulado.
- [x] 2.4 Emitir `plugins_changed` y, si desaparece el canal actual, `channel_changed` con `channel_id: null`; verificar con un test de broker que ambos eventos se publican en el caso correspondiente.

## 3. Configuración de URL por canal

- [x] 3.1 Aceptar y validar claves `channel_<slug>_url` en `POST /api/config` (http/https absoluta, host, largo máximo), exponerlas en `GET /api/config` para canales web instalados y marcarlas local-only; verificar con tests de clave válida, esquema inválido, slug inválido ignorado y origen externo 403.
- [x] 3.2 Reutilizar la misma validación en el comando `set_url` del canal; verificar con un test que una URL inválida no pisa la anterior y una válida cambia `configured_url`.

## 4. Manifests del catálogo

- [x] 4.1 Crear manifests declarativos `netflix`, `disneyplus`, `movistar`, `claro`, `appletv`, `paramount` y `pluto` en `plugins-repo/`, con `drm: true` donde aplique y `partition` propio; verificar que cada uno parsea con `serde_json` y pasa `valid_manifest`.
- [x] 4.2 Actualizar `hbomax` a nombre "Max", URL `https://www.max.com` y versión nueva conservando id y `persist:hbomax`; verificar que una instalación previa conserva la sesión por partición.
- [x] 4.3 Agregar las entradas nuevas a `plugins-repo/index.json` con `bundled: false`; verificar con `GET /api/plugins/catalog` que aparecen disponibles y que el arranque no las instala solas.

## 5. Frontend: API y pantalla Canales

- [x] 5.1 Agregar métodos al cliente para plugins, catálogo, instalar, desinstalar, habilitar/deshabilitar y fijar orden; verificar con `npm run typecheck`.
- [x] 5.2 Implementar la pestaña "Canales" con la lista de instalados (estado, origen, versión, acciones) y los nativos sin acciones de instalación; verificar en `./run-dev.sh` que las acciones reflejan el estado real.
- [x] 5.3 Implementar la sección de catálogo con botón Instalar y badge/aviso DRM; verificar en dev que instalar hace aparecer el canal en Home y barra sin recargar.
- [x] 5.4 Exponer la edición de URL por canal web y la playlist IPTV en la misma pestaña, persistiendo vía `/api/config`; verificar que el estado del canal refleja la URL nueva sin reiniciar.
- [x] 5.5 Implementar el cambio de orden desde la UI y refrescar Home/barra/hotkeys al recibir `plugins_changed`; verificar en dev que reordenar cambia el hotkey 1 y el orden de la barra.
- [x] 5.6 Verificar que la pestaña muestra el error del backend y conserva el estado anterior cuando una acción falla; comprobarlo forzando un id inexistente o una URL inválida en dev.

## 6. Integración y documentación

- [x] 6.1 Actualizar la sección de plugins del README y `docs/HANDOFF.md` con catálogo, instalación, desinstalación, orden y claves `channel_<id>_url`; verificar que los comandos/endpoints documentados coinciden con la implementación.
- [x] 6.2 Correr `./scripts/check.sh` y `./scripts/check-rust.sh`; verificar que quedan verdes y que los límites de capas siguen OK.

## Workflow follow-up

- Archivar el change después de validar DRM con cuentas reales y sincronizar las specs principales.
