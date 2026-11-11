---
id: adr-0005
status: aceptada
version: 2.0.0
updated: 2026-11-11
---

# ADR-0005 — Release reproducible con VERSION único, release-please y app única

## Contexto

Cátodo solo se instala desde el repo con `uv`, `npm` e `install.sh`. No hay CI,
releases versionados ni un canal de instalación para usuarios. La versión está
duplicada en seis archivos. En macOS el backend no depende de PyGObject porque
Spotify se controla por AppleScript, así que un bundle Python autocontenido es
viable como paso transitorio.

El objetivo de largo plazo es migrar todo el backend a Rust. Eso permite un
binario estático que puede viajar dentro de la app, elimina Python/uv/PyGObject y
hace innecesaria una formula de Homebrew con servicio launchd.

## Decisión

- `VERSION` en la raíz es la única fuente de verdad. release-please
  (`release-type: simple`) actualiza `VERSION`, los manifests y `CHANGELOG.md`
  en un PR de release; al mergearlo se crea el tag `vX.Y.Z`.
- CI y release corren en GitHub Actions: `ubuntu-22.04` (x86_64) y `macos-14`
  (arm64).
- macOS distribuye **una sola app**: `Catodo-<version>-mac-arm64.zip` contiene
  `Catodo.app` con el backend en `Contents/Resources/backend/`. Electron lanza el
  backend como sidecar en un puerto loopback libre, espera `/api/health` y lo
  apaga al salir. Hasta M4 el sidecar es el bundle PyInstaller de Python; desde
  M4 es el binario Rust.
- Homebrew usa un **cask estático** `catodo` en el tap existente
  `quicio/homebrew-tap`, con `version :latest`, `sha256 :no_check` y URL a
  `releases/latest/download`. No hay formula, `brew services` ni
  `HOMEBREW_TAP_TOKEN`; el cask no se actualiza por release.
- El nombre de archivo/producto es ASCII (`Catodo.app`) para evitar un crash de
  V8/Electron en macOS 26 con nombres de ejecutable acentuados. El nombre visible
  se mantiene como “Cátodo” vía `CFBundleDisplayName`.
- Linux mantiene `install.sh` + systemd y publica AppImage/.deb más un tarball
  fuente con `static/` construido. El AppImage autocontenido llega en M4, cuando
  el backend Rust elimine PyGObject.

## Consecuencias

Buenas:

- Un solo número de versión verificable y releases reproducibles por plataforma.
- Instalación macOS de un comando, sin servicio separado ni token de tap.
- El cask no se toca en cada release; apunta a `latest/download`.
- El backend Rust puede reemplazar al sidecar Python sin cambiar el packaging.

Malas:

- release-please obliga a usar Conventional Commits desde este cambio en adelante.
- El bundle macOS incluye el backend Python (transitorio) y pesa más hasta M4.
- El cask `version :latest` no fija versión ni verifica `sha256`; se publica
  `SHA256SUMS` para verificación manual.
- La app macOS sin notarizar muestra el warning de Gatekeeper.
- El sidecar agrega ciclo de vida (spawn, health, logs, SIGTERM/SIGKILL) que hay
  que probar en cada release.

## Alternativas descartadas

- **Formula de backend + cask separado**: agrega `brew services`, un tap que se
  actualiza por release y un token. Se descarta porque el destino Rust hace
  innecesario el servicio separado.
- **Un cask con `python@3.12` + venv**: depende de brew Python y de una lista de
  resources regenerada en cada release.
- **Bump manual**: no cumple el release automático.
- **Homebrew en Linux**: no es el canal natural para systemd/AppImage.

## Revisar si

El backend Rust reemplaza al sidecar Python (M4), si se decide notarizar y firmar
la app macOS, o si Homebrew cambia el soporte de `version :latest` para casks.
