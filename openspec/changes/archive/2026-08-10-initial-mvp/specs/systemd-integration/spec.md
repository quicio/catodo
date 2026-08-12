# Systemd Integration

## ADDED Requirements

### Requirement: Backend systemd user service

The backend SHALL be managed as a systemd user service named `catodo.service`.

#### Scenario: Service enablement

- **WHEN** `systemctl --user enable catodo.service` is run
- **THEN** the service starts on user login and auto-restarts on failure.

### Requirement: Service lifecycle

The service SHALL start the backend with `uv run` from the project directory, bound to the DBus session bus, with graceful stop timeout and forced kill.

#### Scenario: Service start

- **WHEN** the service starts
- **THEN** it runs `uv run --directory %h/projects/catodo/backend python -m catodo` with `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/%U/bus` and `Type=simple`, `Restart=on-failure`, `RestartSec=5`, `TimeoutStopSec=5`, `KillSignal=SIGKILL`.

### Requirement: Install script

The project SHALL provide an `install.sh` script that:
- Sets up the Python venv with `uv`.
- Builds the Electron frontend.
- Installs the systemd user service.
- Enables and starts the service.

#### Scenario: Install script execution

- **WHEN** `bash install.sh` is run from the project root
- **THEN** the backend is installed and running, and the Electron AppImage is built.
