## Why

Los canales TV (Movistar) y HBO Max necesitan Widevine, pero el shell empaquetado
usa Electron stock: DRM sólo funciona en dev con `scripts/install_castlab.sh`
(ADR-0003). El CDM tampoco viaja en el zip de castLabs — se instala en runtime — y
la serie ECS 33 que acompañaba a Electron 33 ya está fuera de la ventana de
soporte del CDM, así que la instalación falla con
`Failed to install required components`.

## What Changes

- El shell corre sobre **Electron for Content Security (ECS) 45.x** en dev y en
  los artefactos; el CDM de Widevine se instala en runtime vía
  `components.whenReady()` antes de crear la ventana.
- `electron` se instala desde `github:castlabs/electron-releases#v45.2.1+wvcus`
  con un `postinstall` que baja el binario, y electron-builder empaqueta ese dist
  (`build.electronDist`).
- Desaparecen `scripts/install_castlab.sh`, el flag `install.sh --castlab` y el
  path `frontend/electron-castlab/`: un solo runtime para dev y producción.
- electron-builder sube a 26.x para soportar Electron 45.

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `kiosk-drm-engine`: el runtime único con ECS reemplaza el instalador portable y
  la detección por plataforma; el CDM se instala en runtime y los artefactos
  empaquetados incluyen Widevine.

## Impact

- **Frontend**: `package.json` (devDependency `electron`, `postinstall`,
  `electronDist`, electron-builder), `electron/main.cjs` (espera
  `components.whenReady()`).
- **Scripts**: se elimina `scripts/install_castlab.sh`; `run-dev.sh` usa el
  Electron de `node_modules`; `install.sh` pierde `--castlab`.
- **Docs**: README, `docs/ARCHITECTURE.md`, ADR-0007 (reemplaza ADR-0003).
- **Tamaño**: el zip macOS pasa de ~102 MB a ~120 MB.

## Non-goals

- Firmar con EVS/VMP de producción (queda para cuando haga falta licencias
  persistentes o un proveedor lo exija).
- Validar la reproducción real de Movistar/HBO Max con una cuenta (requiere
  credenciales y región).
