## MODIFIED Requirements

### Requirement: Served remote client

The backend SHALL serve a self-contained remote-control page at `/remote` (static assets, no build step, no external CDN dependencies).

#### Scenario: Open from a phone

- **WHEN** a device on the network opens `http://<host>:8765/remote`
- **THEN** a usable remote UI loads without installing anything.

#### Scenario: Open from the public URL

- **WHEN** a device on any network opens `https://<public_domain>/remote` while the tunnel is running
- **THEN** a usable remote UI loads, the PWA install prompt is offered (manifest + service worker), and the remote uses the `CATODO_TOKEN` from the URL or `localStorage` to authenticate subsequent calls.

### Requirement: Channel control

The remote SHALL list available channels, show the current one, and switch channels on tap (via the existing open endpoint).

#### Scenario: Tap switches TV

- **WHEN** the user taps a channel in the remote
- **THEN** the TV switches to that channel and the remote highlights it as current.

### Requirement: Transport and volume control

The remote SHALL provide play/pause (toggle), next, previous for the current media channel, and a volume control mapped to the global volume endpoint (0–100), plus a mute shortcut that restores the previous level.

#### Scenario: Volume drag

- **WHEN** the user drags the volume slider to 30
- **THEN** the TV's output volume becomes 30 and the HUD-level state reflects it.

### Requirement: Live sync

The remote SHALL subscribe to `/api/ws` and reflect channel, playback, volume, and now-playing changes within a second, including changes made on the TV itself.

#### Scenario: Two-way reflection

- **WHEN** someone pauses Spotify on the TV
- **THEN** the remote shows the paused state without manual refresh.

#### Scenario: Tunnel adds acceptable latency

- **WHEN** the remote is connected through the public tunnel instead of the LAN
- **THEN** state changes are reflected within 2 seconds (Cloudflare Tunnel adds 10–30 ms; total round-trip stays well under the 1 s live-sync budget, with some headroom).

### Requirement: Now playing display

When the current media channel reports track metadata, the remote SHALL show title, artist, and artwork.

#### Scenario: Track visible

- **WHEN** Spotify is playing and the remote is open
- **THEN** the current track's title, artist, and art are visible.

### Requirement: Failure feedback

Unreachable-backend and command-failure states SHALL be visible (connection banner, command error toast) rather than silently stale.

#### Scenario: Backend down

- **WHEN** the backend stops while the remote is open
- **THEN** a disconnected indicator appears and controls are disabled until reconnect.

#### Scenario: Unauthorized when tunnel token missing

- **WHEN** the tunnel is public and the remote has no token (fresh install, user cleared storage)
- **THEN** the remote shows a "volvé a escanear el QR" hint instead of staying silently broken.

### Requirement: Pairing exposes LAN and public URLs

The backend SHALL expose both the LAN URL and the public URL of the remote (when a tunnel is configured), so the Home screen can offer a "send to phone" experience that works from any network.

#### Scenario: Both URLs available

- **WHEN** a tunnel is configured and running
- **THEN** `GET /api/pair/info` returns `{lan: "http://<ip>:<port>/remote[?code=…]", public: "https://<public_domain>/remote[?code=…]", primary: "public", code: "<token or empty>"}`.

#### Scenario: Only LAN when tunnel disabled

- **WHEN** the tunnel is disabled or not configured
- **THEN** `GET /api/pair/info` returns `{lan: "http://<ip>:<port>/remote[?code=…]", public: null, primary: "lan", code: "<token or empty>"}`.

#### Scenario: QR uses primary URL

- **WHEN** `GET /api/pair/qr` is called without `?which=lan`
- **THEN** the QR encodes `primary` (`public` when available, else `lan`).

#### Scenario: QR fallback to LAN

- **WHEN** `GET /api/pair/qr?which=lan` is called
- **THEN** the QR encodes the LAN URL even when a public URL is available (useful when both endpoints are reachable and the user prefers the local one).
