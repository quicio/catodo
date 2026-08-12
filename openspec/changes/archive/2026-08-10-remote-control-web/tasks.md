# Tasks

## 1. Remote client

- [x] 1.1 Create `backend/static/remote/` (`index.html`, `app.js`, `style.css`): channel grid, transport buttons, volume slider + mute, now-playing card, connection banner.
- [x] 1.2 Wire the WS (snapshot + events) with a 2s REST poll fallback when the WS is unavailable.
- [x] 1.3 Verify: from a phone on the LAN (or a desktop browser emulating one), switching channels/transport/volume controls the TV and reflects TV-originated changes within ~1s.

## 2. Token middleware

- [x] 2.1 Add ASGI middleware: when token configured, protect `/api/*` (header or `?token=`), 401 otherwise; leave static/remote open.
- [x] 2.2 Remote page: prompt for the token on 401, keep it in `sessionStorage`, attach to REST + WS.
- [x] 2.3 Verify: with `CATODO_TOKEN=secret`, `curl /api/state` → 401, `curl -H 'X-Catodo-Token: secret' /api/state` → 200; without a token configured everything stays open.

## 3. LAN binding + CORS

- [x] 3.1 Honor `host` from runtime config at startup (env wins), log a warning when binding beyond loopback.
- [x] 3.2 Branch CORS: `*` on loopback, derived origins when LAN-bound.
- [x] 3.3 Verify: default start binds 127.0.0.1 (check `ss -ltnp`); `CATODO_HOST=0.0.0.0` binds LAN, logs the warning, and responses omit the wildcard origin.

## 4. Docs

- [x] 4.1 README: "Remote control" section — enable LAN bind, optional token, bookmark `http://<tv-ip>:8765/remote`, security note for home networks.
- [x] 4.2 Verify: following only the README, a phone controls the TV.

## 5. Regression pass

- [x] 5.1 Walk every scenario in this change's specs (401/200 matrix, loopback unchanged, live sync, failure banner) and record results.
