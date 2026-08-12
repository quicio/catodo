## Purpose

Instalación reproducible de Cátodo en cualquier distro Linux: detección de SO, gestión de dependencias del sistema, verificación de requisitos y generación de la configuración de servicio.

## ADDED Requirements

### Requirement: Detección de SO y gestor de paquetes

El instalador SHALL detectar la distribución Linux en ejecución y seleccionar el gestor de paquetes correspondiente entre al menos pacman, apt, dnf y zypper. Si no reconoce la distro, SHALL abortar con un mensaje claro listando los paquetes requeridos y el comando para instalarlos.

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

El instalador SHALL verificar la presencia de cada dependencia del sistema requerida (python3 ≥3.12, uv, node/npm, pygobject/gir1.2, openssl, xdotool o ydotool, pipewire o pulseaudio, iproute2) antes de proceder. Las dependencias faltantes SHALL reportarse con nombre del paquete por distro y comando de instalación.

#### Scenario: Dependencias presentes

- **WHEN** todas las dependencias requeridas están instaladas
- **THEN** el instalador continúa sin interacción.

#### Scenario: Dependencia faltante

- **WHEN** una dependencia requerida no está instalada
- **THEN** el instalador informa qué falta y ofrece instalarla con el gestor de la distro detectada.

### Requirement: Rutas del proyecto independientes del repositorio

El instalador SHALL resolver todas las rutas (directorio del proyecto, backend, uv, data dir, servicio systemd) desde la ubicación real del repositorio y de las herramientas detectadas en el PATH, sin asumir `~/projects/catodo` ni `~/.local/bin/uv`.

#### Scenario: Repo en ubicación arbitraria

- **WHEN** el repositorio está clonado en cualquier ruta (ej. `~/src/catodo`)
- **THEN** el instalador genera la configuración del servicio con esa ruta real.

#### Scenario: uv fuera de ~/.local/bin

- **WHEN** `uv` está instalado en otro directorio del PATH (ej. `/usr/local/bin/uv`)
- **THEN** el instalador usa la ruta detectada por `command -v uv`.

### Requirement: Generación de unit de systemd

El instalador SHALL generar el unit `catodo.service` con las rutas resueltas (WorkingDirectory, ExecStart con ruta de uv) en lugar de usar un template con rutas fijas.

#### Scenario: Unit generado correcto

- **WHEN** se completa la instalación
- **THEN** el unit instalado en `~/.config/systemd/user/catodo.service` contiene las rutas reales detectadas.

### Requirement: Modo verificación de requisitos

El instalador SHALL ofrecer un modo `--check` que solo valida requisitos y reporta el estado (OK/faltante) de cada dependencia, sin modificar el sistema.

#### Scenario: Check sin cambios

- **WHEN** se ejecuta `install.sh --check` en una máquina con todo instalado
- **THEN** imprime el listado de dependencias como OK y no modifica el sistema.

### Requirement: Instalación de servicio y autostart

El instalador SHALL habilitar y arrancar el servicio de usuario `catodo.service` con `systemctl --user enable --now`, y SHALL ofrecer una opción explícita de autostart al iniciar sesión.

#### Scenario: Servicio habilitado

- **WHEN** se completa la instalación
- **THEN** `systemctl --user is-enabled catodo.service` reporta `enabled` y el proceso corre.

### Requirement: Reinstalación idempotente

Ejecutar el instalador dos veces sobre el mismo repositorio SHALL producir el mismo resultado sin errores ni duplicados.

#### Scenario: Doble ejecución

- **WHEN** `install.sh` se ejecuta dos veces seguidas
- **THEN** ambas terminan con éxito y el servicio queda en el mismo estado.
