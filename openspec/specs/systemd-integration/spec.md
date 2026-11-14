# systemd-integration Specification

## Purpose
TBD - created by archiving change initial-mvp. Update Purpose after archive.
## Requirements
### Requirement: Backend systemd user service

The backend SHALL be managed as a systemd user service named `catodo.service`, generated at install time with the resolved project paths.

#### Scenario: Service enablement

- **WHEN** `systemctl --user enable catodo.service` is run
- **THEN** the service starts on user login and auto-restarts on failure.

### Requirement: Service lifecycle

The service SHALL start the resolved Rust binary from the project directory, bound to the DBus session bus, with graceful stop timeout and forced kill. The unit SHALL be generated with the actual paths detected during installation, not fixed assumptions.

#### Scenario: Service start

- **WHEN** the service starts
- **THEN** it runs `<repo>/rust/target/release/catodo-server` with `CATODO_HOST=127.0.0.1`, `CATODO_PORT=8767`, `CATODO_STATIC_DIR=<repo>/backend/static`, `CATODO_PLUGINS_REPO=<repo>/plugins-repo`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/%U/bus`, and `Type=simple`, `Restart=on-failure`, `RestartSec=5`, `TimeoutStopSec=5`, `KillSignal=SIGKILL`, where `<repo>` is the real repository location.

### Requirement: Install script

The project SHALL provide an `install.sh` script that:
- Detects the OS/distro and installs or verifies system dependencies.
- Builds the Rust backend (`cargo build --release -p catodo-server`).
- Builds the Electron frontend.
- Generates and installs the systemd user service with resolved paths.
- Enables and starts the service.

#### Scenario: Install script execution

- **WHEN** `bash install.sh` is run from the project root
- **THEN** the backend is installed and running, and the Electron AppImage is built, on any supported distro.

#### Scenario: Install script from any location

- **WHEN** `bash /path/to/catodo/install.sh` is run from outside the repository
- **THEN** the script resolves the project root from its own location and installs successfully.

