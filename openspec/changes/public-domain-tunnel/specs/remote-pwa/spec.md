## Purpose

Converts the existing `/remote` page into a real Progressive Web App so that phones can install it as a standalone, fullscreen app from the browser (iOS Safari "Add to Home Screen", Android Chrome "Install app"), instead of being just a regular web page that only works while the tab is open.

## ADDED Requirements

### Requirement: Web manifest

The backend SHALL serve a `manifest.webmanifest` at `/remote/manifest.webmanifest` with at least `name`, `short_name`, `start_url`, `display: "standalone"`, `theme_color`, `background_color`, and icon entries at 192 px and 512 px (plus a 512 px `maskable` variant).

#### Scenario: Manifest reachable
- **WHEN** a browser requests `GET /remote/manifest.webmanifest`
- **THEN** the response is `200` with `Content-Type: application/manifest+json` and a body containing all required fields

#### Scenario: Manifest points to remote entry
- **WHEN** the manifest's `start_url` is read
- **THEN** it equals `"/remote/"` (relative to the served origin) so the app launches straight into the remote UI

#### Scenario: Icons resolve
- **WHEN** the manifest's `icons` array is read
- **THEN** each `src` URL returns a `200` image response of the declared size and format

### Requirement: Installable on iOS and Android

The `/remote` page SHALL include the metadata required by iOS Safari and Android Chrome to offer the user an "Add to Home Screen" / "Install app" prompt: `<link rel="manifest">`, Apple-specific meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`) and a viewport meta tag with `width=device-width, initial-scale=1`.

#### Scenario: iOS install prompt available
- **WHEN** an iPhone user opens `/remote` over HTTPS and chooses Share → Add to Home Screen
- **THEN** the installed icon launches the remote fullscreen (no Safari UI), with the configured `apple-mobile-web-app-title` and the configured status-bar style

#### Scenario: Android install prompt available
- **WHEN** an Android Chrome user opens `/remote` over HTTPS
- **THEN** the browser fires `beforeinstallprompt` (the app passes the PWA installability criteria) and the UI shows an "Instalar como app" banner

#### Scenario: No install prompt on HTTP
- **WHEN** `/remote` is served over plain HTTP
- **THEN** no install prompt is offered (the remote UI still works, but the banner is hidden)

### Requirement: Service worker for offline shell

The backend SHALL serve a JavaScript service worker at `/remote/sw.js` that caches the app shell (HTML, CSS, JS, icons) on install, uses network-first for `/api/*` requests, and falls back to the cached shell when offline.

#### Scenario: First visit caches the shell
- **WHEN** a browser fetches `/remote/` for the first time and the service worker activates
- **THEN** the shell assets are stored in a versioned cache

#### Scenario: API requests bypass cache
- **WHEN** a request targets `/api/*` while online
- **THEN** the service worker forwards it to the network without caching the response

#### Scenario: Offline shell fallback
- **WHEN** the browser is offline and the user opens `/remote/`
- **THEN** the service worker serves the cached shell and the remote shows its "disconnected" state (already implemented)

#### Scenario: Cache invalidation on update
- **WHEN** the frontend is rebuilt with a new bundle hash
- **THEN** the new service worker activates, replaces the old cache version and serves the new shell

### Requirement: Token-aware PWA bootstrap

The remote PWA SHALL retrieve the pairing token (if any) on first load without re-prompting the user on subsequent visits, so the remote keeps working from the home-screen icon without a manual re-pairing flow.

#### Scenario: Token in URL on first visit
- **WHEN** the user opens `/remote?code=<token>` from the QR or a bookmark
- **THEN** the remote UI uses the token for its next API call

#### Scenario: Token persisted
- **WHEN** the first API call with the token succeeds
- **THEN** the token is stored in `localStorage` under a versioned key

#### Scenario: Subsequent visits skip the URL
- **WHEN** the user re-opens `/remote` from the installed home-screen icon (no query string)
- **THEN** the remote UI reads the token from `localStorage` and authenticates the next API call

#### Scenario: Bad token cleared
- **WHEN** the API rejects the stored token with `401`
- **THEN** the remote clears the stored token and shows a "volvé a escanear el QR" hint

### Requirement: Install banner in UI

The remote SHALL show a dismissable banner with an "Instalar como app" button whenever `beforeinstallprompt` fires, and SHALL auto-hide it once the user installs the app or dismisses it (the dismissal is remembered per browser for the session).

#### Scenario: Banner appears on first installable visit
- **WHEN** a user opens `/remote` over HTTPS in an installable browser for the first time
- **THEN** the banner appears within a few seconds of `beforeinstallprompt`

#### Scenario: Banner hidden after install
- **WHEN** the user accepts the install prompt
- **THEN** the banner disappears and does not reappear on subsequent loads in the same browser profile
