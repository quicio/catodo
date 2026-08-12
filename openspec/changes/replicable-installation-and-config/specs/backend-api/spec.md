## ADDED Requirements

### Requirement: Configuración consistente de backend URL

The system SHALL resolve the backend address from a single configuration source: the `CATODO_BACKEND_URL` environment variable, falling back to the default `http://127.0.0.1:<port>` where `<port>` matches the backend's configured port. The address SHALL NOT be duplicated as hardcoded literals across the Electron shell and frontend dev proxy.

#### Scenario: Default loopback

- **WHEN** no `CATODO_BACKEND_URL` is set
- **THEN** the shell and dev proxy target `http://127.0.0.1:8765`.

#### Scenario: Custom backend URL

- **WHEN** `CATODO_BACKEND_URL=https://catodo.lan:8766` is set
- **THEN** the shell loads the app from that URL and issues `/api/*` calls against it.

### Requirement: Autodetección de HTTPS del backend

The Electron shell SHALL detect whether the backend serves HTTPS and select the correct scheme automatically, without assuming the port scheme.

#### Scenario: Backend con HTTPS

- **WHEN** the backend responds to the HTTPS probe
- **THEN** the shell uses `https://...` and passes the `wss:` scheme to WebSocket clients.

#### Scenario: Backend en HTTP

- **WHEN** the backend only responds over HTTP
- **THEN** the shell uses `http://...` and `ws:`.
