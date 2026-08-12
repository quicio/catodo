# Tasks — plugin-system

## 1. Backend — manifiesto y loader

- [x] 1.1 Definir schema de `manifest.json` y utilidad de validación (campos obligatorios, `id` kebab-case, `type` soportado, semver).
- [x] 1.2 Implementar `DeclarativeWebChannel` (subclase de `Channel`) reutilizable: `url`, `user_agent`, `partition`, `color`; `open/close/state/command` con passthrough y `set_url`.
- [x] 1.3 Implementar `plugin_system.py`: escanear `<data_dir>/plugins/*/manifest.json`, validar, respetar `plugins.json` (enabled/disabled), y construir canales a partir de manifests.
- [x] 1.4 Integrar el loader con `ChannelManager`/`build_default_registry`: registrar plugins habilitados después de los built-ins con orden estable.
- [x] 1.5 Archivo de estado `<data_dir>/plugins.json` (id → enabled, installed_version, origin) con lectura/escritura atómica.

## 2. Backend — CLI, repo y dependencias

- [x] 2.1 Dispatch `catodo plugin` en `__main__.py` (argparse) con subcomandos `list | install | remove | enable | disable`.
- [x] 2.2 Índice de repo JSON (id, name, version, url, sha256, requires_catodo) + `install` que descarga zip, verifica checksum y valida versión de Cátodo.
- [x] 2.3 Provisioning de dependencias: venv de plugins en `<data_dir>/plugin-venv` y `uv pip install` de los `dependencies` declarados en install/enable/arranque (respetando `CATODO_PLUGIN_AUTOINSTALL=0`).
- [x] 2.4 Tests: validación de manifest inválido, checksum fallido aborta, enable/disable/remove, y canal web creado por manifest aparece en `/api/channels`.

## 3. Backend — API

- [x] 3.1 `GET /api/plugins` (lista con estado), `POST /api/plugins/install`, `POST /api/plugins/{id}/enable|disable`.
- [x] 3.2 Refrescar el registry en runtime tras instalar/habilitar (canales nuevos sin reiniciar) con eventos WS `plugins_changed`.

## 4. Frontend — canal web genérico

- [x] 4.1 Componente `WebChannel` genérico: `<webview>` con `partition`/`user_agent` leídos de `/api/plugins/{id}` y url de `/api/channels/{id}/state`; migrar `YouTube/Tv/Crunchyroll` a usarlo (misma UX).
- [x] 4.2 Extender `main.cjs` para aplicar `user_agent` por plugin (fallback a `android-tv` para youtube/crunchyroll como hoy).
- [x] 4.3 Home y remote: icono/color de canal desde manifest con fallback a defaults.

## 5. Migración y empaquetado

- [x] 5.1 Migrar YouTube, TV y Crunchyroll a manifests **bundled** (repo por defecto incluido en el repo git) sin cambiar hotkeys/CH ni UX.
- [x] 5.2 Actualizar `install.sh`/`build.sh` para crear `plugin-venv` y copiar el repo bundled a `data_dir`.
- [x] 5.3 Tests del delta de `channel-system`: plugin deshabilitado no aparece, plugin inválido no bloquea el arranque, built-ins siguen cargando.
- [x] 5.4 Verificación E2E: instalar un canal web nuevo desde el CLI en un entorno limpio y confirmar que aparece y reproduce en el webview.

## 6. Documentación

- [x] 6.1 README: cómo escribir un manifest, instalar/deshabilitar plugins, configurar el repo y el provisioning de deps.
