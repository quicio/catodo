# Tasks

## 1. Motor de emisión genérico

- [x] 1.1 Quitar la creación implícita del canal `anime` y el caso especial `anime_progress` de `media.rs`/`channels.rs`; verificar con `cargo test -p catodo-server` que sin entradas `libraries` no existe un canal `anime`.
- [x] 1.2 Extender la entrada de biblioteca con `icon`, `color` y `order` y usarlos en el `ChannelInfo` del canal; verificar que `/api/channels` devuelve esos metadatos.
- [x] 1.3 Normalizar `kind: movies` a `videos` y aceptar `series`/`videos`; verificar con tests que un canal de videos agrupa todo en una lista plana y uno de series agrupa serie/temporada.
- [x] 1.4 Mantener escaneo con TTL, refresh, selección actual, `episode_changed`, `Range` y progreso por `media_progress_<id>`; verificar con tests de estado, seek y stream.

## 2. API de bibliotecas

- [x] 2.1 Implementar `POST /api/libraries` con nombre/path/kind, generación de id único, icon/color/order opcionales y registro en caliente; verificar que el canal aparece en `/api/channels`.
- [x] 2.2 Implementar `PATCH /api/libraries/{id}` para editar nombre/path/kind/icon/color/order sin cambiar el id, re-registrando el canal; verificar que el cambio se refleja sin reiniciar y que el progreso conserva la clave.
- [x] 2.3 Implementar `DELETE /api/libraries/{id}` sin builtin Anime, desregistrando y volviendo al Home si era el canal actual; verificar 404 para ids inexistentes y 403 para origen externo.
- [x] 2.4 Publicar `libraries_changed` en alta/edición/borrado y verificar con un test de broker que los eventos se emiten.

## 3. Defaults de plugins

- [x] 3.1 Cambiar `plugins-repo/index.json` para dejar `bundled: true` sólo en YouTube y `bundled: false` en TV, Crunchyroll, Max y proveedores; verificar con `GET /api/plugins/catalog` que una instalación nueva sólo siembra YouTube.
- [x] 3.2 Verificar que una instalación con TV/Crunchyroll/Max ya instalados los conserva y que instalar un proveedor desde el catálogo sigue registrando el canal sin reiniciar.

## 4. Frontend de emisión

- [x] 4.1 Agregar métodos al cliente para listar/crear/editar/borrar bibliotecas; verificar con `npm run typecheck`.
- [x] 4.2 Implementar la sección “Emisión” en Ajustes con lista, estado vacío y formulario de alta/edición (nombre, ruta, modo, icono, color, orden); verificar en `./run-dev.sh` que crear/editar/borrar refleja Home y barra sin recargar.
- [x] 4.3 Usar `ChannelInfo.icon/color/name` en `ChannelGrid` y `ChannelBar` para canales de emisión, con fallback genérico; verificar que dos canales distintos pueden tener iconos/colores propios.
- [x] 4.4 Refrescar Ajustes y canales al recibir `libraries_changed` y mostrar el error del backend sin perder el formulario; verificar forzando una ruta inválida y un id duplicado.

## 5. Documentación e integración

- [x] 5.1 Actualizar `README.md` y `docs/HANDOFF.md` con canales de emisión, defaults mínimos, migración de Anime y campos configurables; verificar que los endpoints documentados coinciden con la implementación.
- [x] 5.2 Correr `./scripts/check.sh`; verificar typecheck, versión, clippy, tests y límites de capas en verde.

## Workflow follow-up

- Archivar el change después de validar la migración de una instalación existente y sincronizar las specs principales.
