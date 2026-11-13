# Tasks — packaged-widevine

## 1. Runtime ECS

- [x] 1.1 Instalar `electron` desde el tarball `v45.2.1+wvcus` (no `github:` shorthand, que deja `git+ssh` en el lock) y subir electron-builder a `^26.18.0`; verificar `npm ci` sin SSH.
- [x] 1.2 Agregar `postinstall` (`node node_modules/electron/install.js`) porque el paquete de ECS no trae descarga propia; verificar que `npm ci` deje `node_modules/electron/dist`.
- [x] 1.3 Esperar `components.whenReady()` en `frontend/electron/main.cjs` antes de `createWindow()`, con fallback si `components` no existe.

## 2. Empaquetado

- [x] 2.1 Setear `build.electronDist: node_modules/electron/dist` para que electron-builder no intente bajar `electron-v45.2.1+wvcus` de `electron/electron` (404).
- [x] 2.2 Empaquetar `Catodo.app` con `./scripts/package-macos-app.sh` y verificar que el framework sea `45.2.1+wvcus`.
- [x] 2.3 Verificar Widevine en la app empaquetada: `com.widevine.alpha` disponible y CDM `4.10.3112.0` en estado `updated` (vía CDP).
- [x] 2.4 Verificar que el sidecar Rust arranca y responde `/api/health` y `/api/version` en esa misma app.

## 3. Limpieza de la etapa dev-only

- [x] 3.1 Eliminar `scripts/install_castlab.sh`, el flag `install.sh --castlab` y el path `frontend/electron-castlab/`.
- [x] 3.2 `run-dev.sh` lanza el Electron de `node_modules` (sin detección de castLabs).

## 4. Documentación

- [x] 4.1 ADR-0007 (reemplaza ADR-0003) con el porqué del upgrade a ECS 45 (CDM fuera de soporte en 33), tamaño y VMP de desarrollo.
- [x] 4.2 Actualizar README (nota DRM, dev local, empaquetado, limitaciones) y `docs/ARCHITECTURE.md`.

## 5. Validación pendiente

- [ ] 5.1 Reproducir un canal DRM real (Movistar TV o HBO Max) con cuenta en la app empaquetada y registrar el resultado.
- [ ] 5.2 Probar el AppImage de Linux con Widevine en una máquina limpia (VMP no existe en Linux; L3 software).
- [ ] 5.3 Evaluar EVS (VMP de producción) si algún proveedor rechaza la firma de desarrollo.
