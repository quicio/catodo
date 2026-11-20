# installation Specification

## Purpose
Instalación de Cátodo por tres caminos separados —desarrollo, compilado local y
release precompilado— en Linux y macOS: detección de SO y gestor de paquetes,
verificación de requisitos, checksum de los binarios y registro en el menú.
## Requirements
### Requirement: Tres modos de instalación separados

El proyecto SHALL ofrecer tres modos sin solapamiento: `run-dev.sh` para desarrollo (Vite + Electron con HMR), `install-local.sh` para compilar e instalar desde el repositorio, e `install.sh` para instalar el release precompilado. `install.sh` SHALL ser el mismo archivo que se publica en `https://quicio.github.io/catodo/install.sh` para el one-liner, y SHALL NOT compilar nada.

#### Scenario: Modo desarrollo

- **WHEN** se ejecuta `./run-dev.sh` en un clon
- **THEN** levanta backend y Vite locales y abre Electron, sin instalar paquetes ni servicios.

#### Scenario: Compilado local

- **WHEN** se ejecuta `./install-local.sh`
- **THEN** compila backend y frontend desde el clon y los instala localmente.

#### Scenario: Release

- **WHEN** se ejecuta `curl -fsSL https://quicio.github.io/catodo/install.sh | bash`
- **THEN** descarga e instala el release sin requerir Rust ni Node.

### Requirement: Detección de SO y gestor de paquetes

El instalador local SHALL detectar la distribución Linux en ejecución y seleccionar el gestor de paquetes correspondiente entre al menos pacman, apt, dnf y zypper. Si no reconoce la distro, SHALL abortar con un mensaje claro listando los paquetes requeridos y el comando para instalarlos.

#### Scenario: Distro Arch

- **WHEN** el instalador corre en una distro basada en Arch con `pacman` disponible
- **THEN** instala o verifica dependencias usando `pacman`.

#### Scenario: Distro Debian

- **WHEN** el instalador corre en una distro basada en Debian con `apt` disponible
- **THEN** instala o verifica dependencias usando `apt`.

#### Scenario: Distro desconocida

- **WHEN** el instalador corre en una distro sin gestor reconocido
- **THEN** aborta con un mensaje que lista las dependencias y el comando de instalación manual.

### Requirement: Verificación de dependencias del sistema

El instalador local SHALL verificar la presencia de cada dependencia del sistema requerida (cargo/Rust, node/npm, openssl, xdotool o ydotool, pipewire o pulseaudio, iproute2) antes de proceder. Las dependencias faltantes SHALL reportarse con nombre del paquete por distro y comando de instalación.

#### Scenario: Dependencias presentes

- **WHEN** todas las dependencias requeridas están instaladas
- **THEN** el instalador continúa sin interacción.

#### Scenario: Dependencia faltante

- **WHEN** una dependencia requerida no está instalada
- **THEN** el instalador informa qué falta y ofrece instalarla con el gestor de la distro detectada.

### Requirement: Rutas del proyecto independientes del repositorio

El instalador local SHALL resolver todas las rutas (directorio del proyecto, backend, binario Rust, data dir, servicio systemd) desde la ubicación real del repositorio y de las herramientas detectadas en el PATH, sin asumir `~/projects/catodo`.

#### Scenario: Repo en ubicación arbitraria

- **WHEN** el repositorio está clonado en cualquier ruta (ej. `~/src/catodo`)
- **THEN** el instalador genera la configuración del servicio con esa ruta real.

#### Scenario: cargo fuera de ~/.cargo/bin

- **WHEN** `cargo` está instalado en otro directorio del PATH (ej. `/usr/local/bin/cargo`)
- **THEN** el instalador usa la ruta detectada por `command -v cargo`.

### Requirement: Generación de unit de systemd

El instalador local SHALL generar el unit `catodo.service` con las rutas resueltas (WorkingDirectory, ExecStart con la ruta del binario Rust) en lugar de usar un template con rutas fijas. El modo release no crea servicios: el backend viaja como sidecar dentro de la app.

#### Scenario: Unit generado correcto

- **WHEN** se completa la instalación local en Linux
- **THEN** el unit instalado en `~/.config/systemd/user/catodo.service` contiene las rutas reales detectadas.

### Requirement: Modo verificación de requisitos

El instalador local SHALL ofrecer un modo `--check` que solo valida requisitos y reporta el estado (OK/faltante) de cada dependencia, sin modificar el sistema.

#### Scenario: Check sin cambios

- **WHEN** se ejecuta `install-local.sh --check` en una máquina con todo instalado
- **THEN** imprime el listado de dependencias como OK y no modifica el sistema.

### Requirement: Instalación de servicio y autostart

El instalador local SHALL habilitar y arrancar el servicio de usuario `catodo.service` con `systemctl --user enable --now`, y SHALL ofrecer una opción explícita de autostart al iniciar sesión.

#### Scenario: Servicio habilitado

- **WHEN** se completa la instalación local
- **THEN** `systemctl --user is-enabled catodo.service` reporta `enabled` y el proceso corre.

### Requirement: Reinstalación idempotente

Ejecutar el instalador dos veces sobre el mismo repositorio SHALL producir el mismo resultado sin errores ni duplicados.

#### Scenario: Doble ejecución

- **WHEN** `install-local.sh` se ejecuta dos veces seguidas
- **THEN** ambas terminan con éxito y el servicio queda en el mismo estado.

### Requirement: Instalación de release de un comando

El instalador de release SHALL ejecutarse con `curl -fsSL https://quicio.github.io/catodo/install.sh | bash` y SHALL detectar el sistema operativo sin intervención. SHALL resolver la última release (o `--version <tag>`), descargar el asset correspondiente, verificar el SHA-256 contra `SHA256SUMS.txt` y abortar si no coincide.

En Linux x86_64 SHALL elegir `.pkg.tar.zst` para pacman, `.deb` para apt, `.rpm` para dnf/zypper y AppImage para el resto, e instalar con el gestor detectado. En macOS Apple Silicon SHALL usar Homebrew (`brew install --cask quicio/tap/catodo`) cuando esté disponible y no se haya fijado versión ni pedido modo usuario; en caso contrario SHALL bajar `Catodo-<ver>-mac-arm64.zip`, copiar `Catodo.app` a `/Applications` (o `~/Applications` con `--user`) y quitar la cuarentena de Gatekeeper.

#### Scenario: Distro Arch

- **WHEN** se ejecuta el instalador de release en una distro basada en Arch
- **THEN** descarga `catodo-<ver>-1-x86_64.pkg.tar.zst`, verifica el checksum y lo instala con `pacman -U`.

#### Scenario: macOS con Homebrew

- **WHEN** se ejecuta el instalador de release en macOS con `brew` y sin `--version`
- **THEN** instala con `brew install --cask quicio/tap/catodo`; si falla, cae al `.zip`.

#### Scenario: macOS sin Homebrew

- **WHEN** no hay `brew` o se pasa `--no-brew`
- **THEN** descarga el `.zip`, verifica el checksum y deja `Catodo.app` en `/Applications` sin cuarentena.

#### Scenario: Checksum inválido

- **WHEN** el asset descargado no coincide con `SHA256SUMS.txt`
- **THEN** el instalador aborta sin instalar ni modificar el sistema.

#### Scenario: Sin sudo

- **WHEN** se pasa `--user` o no hay `sudo` disponible
- **THEN** en Linux instala la AppImage en `$PREFIX/opt/catodo` (default `~/.local`) y en macOS deja la app en `~/Applications`, sin privilegios.

### Requirement: Registro en el menú de aplicaciones

El instalador SHALL registrar Cátodo en `share/applications/catodo.desktop` con un `Exec` que apunte a la build recién instalada, un symlink `bin/catodo` y un icono en `hicolor`. La entrada SHALL reescribirse en cada instalación para que el launcher no siga abriendo una versión anterior. Las extracciones viejas en `opt/Catodo` (mayúscula) SHALL retirarse y los autostart que las referencien SHALL repuntarse al binario nuevo.

#### Scenario: Instalación desde el repo

- **WHEN** `install-local.sh` compila la AppImage de la versión actual
- **THEN** el menú de aplicaciones abre esa AppImage y no una copia previa en `~/.local/opt/Catodo`.

#### Scenario: Actualización

- **WHEN** se reinstala una versión nueva
- **THEN** la entrada del menú y el symlink `bin/catodo` apuntan a la versión nueva, y la app instalada reporta la versión nueva en `/api/version`.

#### Scenario: Instalación vieja presente

- **WHEN** existe `~/.local/opt/Catodo` de una instalación anterior
- **THEN** el instalador la mueve a un `.bak` y deja una sola entrada de Cátodo en el menú.
