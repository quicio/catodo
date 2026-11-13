---
id: adr-0007
status: aceptada
version: 1.0.0
updated: 2026-11-12
---

# ADR-0007 — Widevine empaquetado con Electron for Content Security

## Contexto

Los canales TV (Movistar) y HBO Max transmiten con DRM Widevine, y el Electron
stock no incluye el CDM. ADR-0003 resolvió el problema sólo para desarrollo:
`scripts/install_castlab.sh` bajaba el build de castLabs y el `.app`/AppImage se
quedaban sin DRM.

Al intentar empaquetar DRM aparecieron dos hechos:

1. El CDM **no viaja** en el zip de castLabs: se instala en runtime por la
   Component Updater de Chromium. En ECS 33 (la versión que acompañaba a nuestro
   Electron 33) la instalación falla con `Failed to install required components`:
   la tabla de [versiones soportadas](https://github.com/castlabs/electron-releases/wiki#supported-versions)
   marca `33.x` como *end-of-support* y fuera de la ventana de un año de releases
   de Chromium para el CDM.
2. Con ECS `45.2.1+wvcus` (Chromium 156) la instalación funciona:
   `components.whenReady()` deja el CDM `4.10.3112.0` y
   `navigator.requestMediaKeySystemAccess('com.widevine.alpha')` resuelve.

## Decisión

- El shell corre sobre **Electron for Content Security (ECS)** en dev y en los
  artefactos: `electron` se instala como devDependency desde el tarball de GitHub
  `https://github.com/castlabs/electron-releases/archive/refs/tags/v45.2.1+wvcus.tar.gz`
  (ECS no está publicado en el registry de npm; el tarball evita que el lockfile
  quede en `git+ssh`, que rompería `npm ci` en CI sin claves SSH).
- `frontend/package.json` agrega `postinstall: node node_modules/electron/install.js`
  porque el paquete de ECS no trae script de descarga propio, y
  `build.electronDist: node_modules/electron/dist` para que electron-builder
  empaquete ese dist en vez de intentar bajar `electron-v45.2.1+wvcus` de
  `electron/electron` (404).
- `frontend/electron/main.cjs` espera `components.whenReady()` antes de crear la
  ventana, con fallback silencioso si `components` no existe (Electron stock).
- Se elimina `scripts/install_castlab.sh`, el flag `install.sh --castlab` y el
  path `frontend/electron-castlab/`: hay un solo runtime, no dos.
- electron-builder sube a `^26.18.0` para soportar Electron 45.

## Consecuencias

Buenas:

- Los canales DRM funcionan en dev, en `Catodo.app` y en el AppImage sin pasos
  manuales ni binarios paralelos.
- Desaparece la divergencia dev/prod y el script de instalación de castLabs.
- El CDM se actualiza solo (background update de Component Updater).

Malas:

- El zip macOS pasa de ~102 MB a ~120 MB y `npm ci` descarga ~130 MB extra.
- La dependencia entra por GitHub, no por npm: se pinea por tag y un `npm ci`
  necesita red.
- La firma VMP incluida es la **de desarrollo**. Para licencias persistentes o
  proveedores que exijan VMP de producción hay que firmar con
  [EVS](https://github.com/castlabs/electron-releases/wiki/EVS) (servicio gratuito
  con registro).
- El primer arranque necesita red para bajar el CDM; sin ella los canales DRM no
  reproducen hasta que haya conexión.
- ECS publica un build por serie al mes: no siempre existe la última versión de
  Electron.

## Alternativas consideradas

- **Quedarse con Electron stock** (ADR-0003): TV y HBO Max no reproducen en la app
  instalada; era justamente lo que se quería resolver.
- **Empaquetar el CDM manualmente** (`--widevine-cdm-path`): distribuir el binario
  del CDM requiere licencia de Widevine/Google; el componente vía updater es el
  camino soportado.
- **Seguir en ECS 33**: el CDM ya no se sirve para esa versión, así que el DRM no
  funciona ni en dev.

## Relación con otros ADR

Reemplaza a [ADR-0003](0003-widevine-en-dev.md) (Widevine sólo en dev).
