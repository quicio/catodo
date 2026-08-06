# Systemd Integration

## ADDED Requirements

### Requirement: Backend systemd user service

The backend SHALL be managed as a systemd user service named `catodo.service`.

#### Scenario: Service enablement

- **WHEN** `systemctl --user enable catodo.service` is run
- **THEN** the service starts on user login and auto-restarts on failure.

### Requirement: Service lifecycle

The service SHALL start the backend with `uv run` from the project directory.

#### Scenario: Service start

- **WHEN** the service starts
- **THEN** it runs `uv run python -m catodo` from `~/projects/catodo/backend/`.

### Requirement: Install script

The project SHALL provide an `install.sh` script that:
- Sets up the Python venv with `uv`.
- Builds the Tauri frontend.
- Installs the systemd user service.
- Enables and starts the service.

#### Scenario: Install script execution

- **WHEN** `bash install.sh` is run from the project root
- **THEN** the backend is installed and running, and the Tauri binary is built.
