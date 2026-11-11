## MODIFIED Requirements

### Requirement: HTTP client

The frontend SHALL communicate with the backend via HTTP. In development, the unpackaged app SHALL use `http://127.0.0.1:8765` unless `CATODO_BACKEND_URL` is set. The packaged macOS app SHALL start the bundled backend sidecar from `Contents/Resources/backend/catodo-backend` on a free loopback port, wait for `GET /api/health` to succeed, and then load the UI from that backend. If `CATODO_BACKEND_URL` is set, the app SHALL use that URL and SHALL NOT spawn the sidecar. On quit, the app SHALL terminate the sidecar gracefully. If the sidecar cannot start or never becomes healthy, the app SHALL show a retryable connection error instead of a blank window or a crash. A packaged app without a bundled backend (for example Linux) SHALL fall back to probing `:8767` and then `:8765`.

#### Scenario: Packaged macOS app starts its backend

- **WHEN** the app is packaged on macOS, no `CATODO_BACKEND_URL` is set, and the bundled backend exists
- **THEN** the app spawns the sidecar on a free loopback port, waits for `/api/health`, and loads the UI from that URL

#### Scenario: Development app uses the dev backend

- **WHEN** the app runs unpackaged from Vite and no `CATODO_BACKEND_URL` is set
- **THEN** the app uses `http://127.0.0.1:8765` and does not spawn a sidecar

#### Scenario: Explicit override wins

- **WHEN** `CATODO_BACKEND_URL=http://192.168.1.50:8767` is set
- **THEN** the app uses that URL for all API and WebSocket calls and does not spawn a sidecar

#### Scenario: Sidecar shutdown on quit

- **WHEN** the user quits the packaged app while the sidecar is running
- **THEN** the app sends SIGTERM to the sidecar, waits for it to exit, and force-kills it if it does not exit within the timeout

#### Scenario: Sidecar fails to start

- **WHEN** the bundled backend crashes or does not answer `/api/health` within the startup timeout
- **THEN** the app shows a connection error with a retry action and does not leave a blank window

#### Scenario: Linux packaged app without bundled backend

- **WHEN** a packaged Linux app has no `Contents/Resources/backend/catodo-backend` and no override
- **THEN** the app probes `:8767` and then `:8765` and uses the first healthy backend
