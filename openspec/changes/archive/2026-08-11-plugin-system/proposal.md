## Why

Agregar un canal hoy requiere tocar código backend, frontend, home y remote a la vez y rebuildear. Queremos un mecanismo de instalación de canales tipo Kodi addons: declarar, instalar, habilitar y actualizar canales (y sus dependencias externas) sin tocar el código, y que Cátodo pueda arrancar limpio en entornos distintos.

## What Changes

- **Manifest de plugin** (`manifest.json`): `id`, `name`, `version`, `type`, `icon`, y para canales web `url`, `user_agent`, `partition`, más `dependencies` (pip).
- **Directorio de plugins** en `~/.local/share/catodo/plugins/<id>/`, fuera del repo.
- **Loader en el backend**: construye canales a partir de manifests (canales `web` declarativos, sin código) y los integra al `ChannelManager`.
- **CLI `catodo plugin`**: `install`, `list`, `remove`, `enable`, `disable`, `update`.
- **Repositorio remoto**: índice JSON (id, versión, checksum) configurable; instalación con verificación de checksum y compatibilidad de versión.
- **Provisioning de dependencias**: un venv compartido para plugins donde se instalan los `dependencies` declarados — así el sistema instala librerías externas si arranca en un entorno que no las tiene.
- **Frontend**: los canales `web` renderizan `<webview>` desde el manifest (patrón ya existente); el número de canales deja de ser fijo.

## Capabilities

### New Capabilities
- `plugin-system`: instalación, gestión y carga de canales como plugins declarativos (manifest + repo + CLI + dependencias).

### Modified Capabilities
- `channel-system`: el registro de canales ya no es solo una lista estática en `__init__.py`; los canales pueden provenir de plugins instalados en `plugins/`, y el manager debe resolverlos y exponer su estado. (Delta spec.)

## Non-goals

- Plugins de **código Python** (tipo `media` con MPRIS/DBus) en esta fase — se agregan en una fase posterior.
- Modelo de **sandboxing/seguridad** más allá del aislamiento del webview.
- Multi-usuario / permisos por plugin.
- Marketplace curado: el repo es un índice JSON, no una tienda.

## Impact

- **Backend**: `plugin_system.py` (loader + CLI), nueva carpeta `plugins/` en `data_dir`, registro dinámico en `ChannelManager`, endpoint `/api/plugins` (list/install/remove), config de repos.
- **Frontend (Electron)**: resolución dinámica de canales web desde manifests (ya soportado por `ChannelView`/webview); sin rebuild para canales declarativos nuevos.
- **Remote**: iconos/colores por manifest (fallback a defaults).
- **Build**: `install.sh`/`build.sh` documentan el provisioning del venv de plugins; los canales built-in se migran a manifests (YouTube/TV/Crunchyroll) **sin romper** la UX actual.
