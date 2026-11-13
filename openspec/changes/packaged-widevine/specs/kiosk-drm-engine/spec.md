## ADDED Requirements

### Requirement: Runtime único sobre ECS con CDM en runtime

El shell SHALL ejecutarse sobre Electron for Content Security (ECS) en desarrollo y
en los artefactos publicados, en lugar de mantener builds separados de Electron
stock y castLabs. La aplicación SHALL esperar `components.whenReady()` antes de
crear la ventana cuando la `components` API esté disponible, de modo que el CDM de
Widevine quede instalado antes del primer request de playback. Si la instalación
del componente falla, la app SHALL seguir arrancando sin DRM y registrar el error.

#### Scenario: Arranque con CDM listo

- **WHEN** la app arranca sobre ECS con red disponible
- **THEN** `components.whenReady()` resuelve con el CDM de Widevine instalado, y `navigator.requestMediaKeySystemAccess('com.widevine.alpha', …)` resuelve antes de que el usuario abra un canal DRM

#### Scenario: Falla la instalación del CDM

- **WHEN** `components.whenReady()` rechaza (sin red o componente no disponible)
- **THEN** la app igual abre la ventana, loguea el error y los canales no-DRM siguen funcionando

### Requirement: Artefactos empaquetados con el dist de ECS

El empaquetado SHALL usar el binario de ECS instalado en `node_modules/electron/dist`
(no una descarga paralela) y SHALL producir un `.app`/AppImage con Widevine
disponible. La descarga del binario SHALL quedar cubierta por el `postinstall` del
proyecto, porque el paquete de ECS no trae script propio.

#### Scenario: App macOS con Widevine

- **WHEN** se empaqueta `Catodo.app` y se abre
- **THEN** `com.widevine.alpha` está disponible y el CDM reporta estado `updated`

#### Scenario: Instalación desde un clone limpio

- **WHEN** alguien corre `npm ci` en `frontend/`
- **THEN** `postinstall` deja `node_modules/electron/dist` con el binario de ECS y electron-builder puede empaquetar sin descargar Electron de `electron/electron`

## MODIFIED Requirements

### Requirement: Fallback a stock Electron sin DRM

El kiosk SHALL funcionar sin DRM cuando el CDM no está disponible (sin red en el
primer arranque, instalación fallida o un Electron sin `components`). Los canales
que no requieren DRM (YouTube TV, Crunchyroll, Anime local, Arcade) SHALL seguir
funcionando. La ausencia de Widevine SHALL ser visible en el log, pero NO SHALL
impedir el arranque del kiosk.

#### Scenario: YouTube funciona sin castLabs

- **WHEN** el CDM no está disponible y el usuario abre el canal YouTube
- **THEN** el webview carga normalmente (YouTube TV no requiere Widevine para su interfaz base)

#### Scenario: TV Movistar sin castLabs

- **WHEN** el CDM no está disponible y el usuario abre el canal TV (Movistar)
- **THEN** el webview abre la URL configurada pero el contenido con DRM no reproduce, y la limitación queda logueada

## REMOVED Requirements

### Requirement: Install portable de Electron castLabs por plataforma

**Reason**: ECS se instala como devDependency desde GitHub; ya no hay un instalador portable por plataforma ni un layout FHS propio.

**Migration**: `cd frontend && npm ci`. El binario queda en `node_modules/electron/dist`.

### Requirement: Dev launcher detecta castLabs por plataforma

**Reason**: Hay un solo runtime (ECS en `node_modules`), así que no hay nada que detectar ni fallback por plataforma.

**Migration**: `run-dev.sh` lanza `npx electron` apuntando a Vite.

### Requirement: Asset URL portable

**Reason**: El script que construía la URL del zip de castLabs fue eliminado; el binario lo resuelve el paquete de ECS.

**Migration**: Actualizar la URL del tarball en `frontend/package.json` (`https://github.com/castlabs/electron-releases/archive/refs/tags/vX.Y.Z+wvcus.tar.gz`).
