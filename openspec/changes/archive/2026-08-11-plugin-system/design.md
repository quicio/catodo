# Design — plugin-system

## Context

See `proposal.md` — Why. Hoy los canales son clases Python registradas estáticamente en `channels/__init__.py` y componentes React hardcodeados. Los canales `web` (YouTube, TV, Crunchyroll) son prácticamente idénticos: URL + user-agent + partition. Eso los hace el candidato perfecto para ser **plugins declarativos**.

## Goals / Non-Goals

- **Goal**: manifests de plugin, loader en backend, CLI `catodo plugin`, repo JSON, provisioning de deps en un venv aislado, y migración de los canales web built-in a manifests.
- **Non-Goal**: plugins de código Python (`media`/MPRIS) en esta fase; sandboxing más allá del webview; marketplace.

## Decisions

### 1. Fase 1 = plugins declarativos de tipo `web` únicamente
Un manifest es suficiente para YouTube/TV/Crunchyroll y para cualquier futuro canal web. Los canales `media` (Spotify) y `app` (Anime) siguen siendo código built-in.
- **Alternativa**: permitir código Python desde el inicio → complejidad de venv/seguridad que conviene diferir. Se documenta en `Non-goals`.

### 2. Schema de `manifest.json`
```
{
  "id": "crunchyroll",            // kebab-case, único
  "name": "Crunchyroll",
  "version": "1.0.0",             // semver
  "type": "web",
  "icon": "play",                 // fallback en frontend
  "url": "https://www.crunchyroll.com",
  "user_agent": "android-tv",     // enum: default | chrome | android-tv
  "partition": "persist:crunchyroll",
  "color": "#f47521",             // para home/remote
  "requires_catodo": { "min": "0.1.0" },
  "dependencies": []              // pip packages
}
```
Validación estricta: `id`/`name`/`version`/`type` obligatorios; `type` no soportado → rechazo con log.

### 3. Loader → instancias `Channel` en el manager
`plugin_system.py` escanea `<data_dir>/plugins/*/manifest.json`, valida, y para cada plugin habilitado construye un `DeclarativeWebChannel` (una sola clase reutilizable que implementa `Channel`: `open/close/state/command` con passthrough y `set_url`). Se registra tras los built-ins (orden estable por nombre para no romper hotkeys CH1-4).

### 4. El frontend generaliza los canales web
Se reemplazan los componentes `YouTube/Tv/Crunchyroll` por un único `WebChannel` genérico que:
- lee `/api/channels/{id}/state` (url) y `/api/plugins/{id}` (partition, user_agent, color),
- renderiza `<webview>` con `partition` y UA desde el manifest.
Esto es un **refactor interno**: la UX no cambia. `main.cjs` ya aplica UAs por host (youtube/crunchyroll) — se extiende para leer el manifest y aplicar `user_agent` por plugin.

### 5. Estado de plugins: `plugins.json` central
`<data_dir>/plugins.json`: `{ "<id>": { "enabled": true, "installed_version": "1.0.0", "origin": "repo|local" } }`. El CLI y el loader lo usan como fuente de verdad; los archivos del plugin viven en `plugins/<id>/`.

### 6. CLI `catodo plugin`
Dispatch en `__main__.py` (argparse): `catodo plugin list|install|remove|enable|disable`. Sin dependencias nuevas.

### 7. Repo JSON + checksum
Índice remoto:
```
{ "plugins": [ { "id", "name", "version", "url", "sha256", "requires_catodo": {min,max} } ] }
```
`install` descarga el zip, verifica `sha256`, valida `requires_catodo`, extrae a `plugins/<id>/`. Repo URL en `runtime_config` (`plugin_repo`, default: repo bundled en el repo git).

### 8. Provisioning de dependencias en un venv aislado
Venv compartido en `<data_dir>/plugin-venv`. En `install`/`enable` (y al arrancar, si falta algo) se instalan los `dependencies` declarados con `uv pip install --python <venv>`. El venv principal no se toca. `CATODO_PLUGIN_AUTOINSTALL=0` desactiva el auto-install al arranque (el sistema solo loguea).

### 9. API
`GET /api/plugins` (lista con estado), `POST /api/plugins/install`, `POST /api/plugins/{id}/enable|disable`. Protegidas por el middleware de token existente. Refrescan el registry en runtime vía el loader (los canales nuevos quedan disponibles sin reiniciar).

## Risks / Trade-offs

- **Zips maliciosos / repo comprometido** → los plugins Fase 1 son declarativos (sin ejecución de código propio del plugin); webview ya aislado. Mitigación: checksum + HTTPS + repo por defecto controlado.
- **Provisioning de venv lento o falla de red al arrancar** → no fatal: el plugin queda "roto" (log) y se reintenta en el próximo `install/enable`.
- **Hotkeys/orden al instalar plugins** → orden estable (built-ins primero, luego plugins por nombre); documentado.
- **Refactor de los canales web a `WebChannel`** → riesgo de regresión de UX; mitigado por tests de humo existentes y revisión manual de YouTube/TV/Crunchyroll.

## Migration Plan

1. Agregar el loader + CLI + repo + venv (aditivo, no toca canales actuales).
2. Migrar YouTube/TV/Crunchyroll a manifests **bundled** (se incluyen como repo por defecto) y a `WebChannel` genérico — misma UX.
3. `install.sh`/`build.sh`: asegurar `plugin-venv` y copiar el repo bundled.
- Rollback: quitar el loader y volver al registry estático; los manifests bundled no cambian la API de canales.

## Open Questions

- Ninguna que cambie specs/approach; el nombre del "repo por defecto" y su URL exacta se resuelven en implementación.
