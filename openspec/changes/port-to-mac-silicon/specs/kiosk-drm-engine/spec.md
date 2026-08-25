## Purpose

Permite al kiosk shell reproducir contenido con DRM (Movistar TV, HBO Max) en cada plataforma soportada usando el build de Electron con Widevine de castLabs, instalado y detectado por el launcher dev de forma portable cross-OS.

## ADDED Requirements

### Requirement: Install portable de Electron castLabs por plataforma

El sistema SHALL proveer `scripts/install_castlab.sh` que detecta el OS en runtime y baja el asset de castLabs correcto: en Linux SHALL bajar `electron-${VERSION}-linux-${ARCH}.zip` y extraerlo al layout FHS existente (`frontend/electron-castlab/usr/lib/electron-castlab/`); en macOS SHALL bajar `electron-${VERSION}-darwin-${ARCH}.zip` y extraerlo de modo que produzca un bundle `frontend/electron-castlab/Electron.app/`. El binario SHALL quedar accesible en el path esperado por el dev launcher para esa plataforma.

#### Scenario: Install castLabs en Linux x64
- **WHEN** `bash scripts/install_castlab.sh` corre en Linux x86_64
- **THEN** descarga `electron-${VERSION}-linux-x64.zip`, extrae a `frontend/electron-castlab/usr/lib/electron-castlab/`, y el binario queda en `frontend/electron-castlab/usr/lib/electron-castlab/electron` con `chrome-sandbox` chmod +x.

#### Scenario: Install castLabs en macOS arm64
- **WHEN** `bash scripts/install_castlab.sh` corre en macOS arm64 (Apple Silicon)
- **THEN** descarga `electron-${VERSION}-darwin-arm64.zip`, extrae a `frontend/electron-castlab/`, y el binario queda en `frontend/electron-castlab/Electron.app/Contents/MacOS/Electron`. No SHALL crearse wrapper bash ni `chrome-sandbox` chmod +x.

#### Scenario: Install castLabs en macOS x64
- **WHEN** `bash scripts/install_castlab.sh` corre en macOS x86_64
- **THEN** descarga `electron-${VERSION}-darwin-x64.zip` y extrae al mismo layout `Electron.app/` que en arm64.

#### Scenario: Install idempotente
- **WHEN** el script corre y la instalación previa existe
- **THEN** SHALL loggear "castLabs ya instalado en <path>" y salir con código 0 sin re-descargar (a menos que se pase `--force`).

### Requirement: Dev launcher detecta castLabs por plataforma

`./run-dev.sh` SHALL resolver el path del binario de Electron castLabs según la plataforma detectada con `uname -s`. En Linux SHALL buscar `frontend/electron-castlab/usr/lib/electron-castlab/electron`; en macOS SHALL buscar `frontend/electron-castlab/Electron.app/Contents/MacOS/Electron`. Cuando el binario existe y es ejecutable SHALL lanzarlo apuntando a Vite (con DRM disponible). Cuando NO existe SHALL caer a `npx electron` con un warning que explique que los canales con DRM no tendrán Widevine.

#### Scenario: Dev launcher en macOS con castLabs instalado
- **WHEN** `./run-dev.sh` corre en macOS y existe `frontend/electron-castlab/Electron.app/Contents/MacOS/Electron`
- **THEN** SHALL lanzar el shell con ese binario apuntando a `http://127.0.0.1:1420` (Vite). Los canales DRM tendrán Widevine disponible.

#### Scenario: Dev launcher en Linux con castLabs instalado
- **WHEN** `./run-dev.sh` corre en Linux y existe `frontend/electron-castlab/usr/lib/electron-castlab/electron`
- **THEN** SHALL lanzar el shell con ese binario (mismo comportamiento que la versión actual, preservado).

#### Scenario: Dev launcher sin castLabs
- **WHEN** `./run-dev.sh` corre y el binario de castLabs NO existe en el path esperado
- **THEN** SHALL loggear "Electron castLabs no encontrado. Los canales DRM (Movistar TV, HBO Max) no tendrán Widevine. Instalalo con: bash scripts/install_castlab.sh" y SHALL caer a `npx electron` para mantener el dev funcional sin DRM.

### Requirement: Fallback a stock Electron sin DRM

El sistema SHALL permitir que el kiosk funcione sin castLabs (sin DRM). Los canales web que no requieren DRM (YouTube TV user-agent, Crunchyroll, Anime local, Arcade) SHALL seguir funcionando con `npx electron` en ambas plataformas. La ausencia de castLabs SHALL ser visible (warning al arrancar) pero NO SHALL impedir el dev local ni el uso de canales no-DRM.

#### Scenario: YouTube funciona sin castLabs
- **WHEN** el launcher usa `npx electron` y el usuario abre el canal YouTube
- **THEN** el canal SHALL abrir el webview normalmente (YouTube TV no requiere Widevine para su interfaz base).

#### Scenario: TV Movistar sin castLabs
- **WHEN** el launcher usa `npx electron` y el usuario abre el canal TV (Movistar)
- **THEN** el webview SHALL abrir la URL configurada pero el contenido con DRM SHALL no reproducirse (limitación documentada, fuera del alcance de este change bundlear castLabs en el .app empaquetado).

### Requirement: Asset URL portable

El script `scripts/install_castlab.sh` SHALL construir la URL del asset de castLabs combinando `https://github.com/castlabs/electron-releases/releases/download/${VERSION}/electron-${VERSION}-${OS_SEGMENT}-${ARCH}.zip`, donde `OS_SEGMENT` es `linux` en Linux y `darwin` en macOS. La versión SHALL seguir resolviéndose vía la API de GitHub Releases (mismo filtro `+wvcus` y exclusión de `-alpha`/`-beta`/`-rc` que ya existe).

#### Scenario: URL correcta en cada OS
- **WHEN** el script corre en Linux arm64 con versión `v42.8.0+wvcus`
- **THEN** SHALL apuntar a `https://github.com/castlabs/electron-releases/releases/download/v42.8.0+wvcus/electron-v42.8.0+wvcus-linux-arm64.zip`.

- **WHEN** el script corre en macOS arm64 con versión `v42.8.0+wvcus`
- **THEN** SHALL apuntar a `https://github.com/castlabs/electron-releases/releases/download/v42.8.0+wvcus/electron-v42.8.0+wvcus-darwin-arm64.zip`.