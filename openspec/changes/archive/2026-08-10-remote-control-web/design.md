# Design

## Context

See proposal.md — Why. The remote is a second frontend with opposite constraints to the kiosk: unknown device, small touch screen, over the network. The main risks are scope creep (rebuilding the TV UI) and accidentally weakening the loopback-only security posture.

## Goals / Non-Goals

**Goals**
- Zero build tooling for the remote; a phone renders it from plain files.
- Loopback installs behave exactly as today.

**Non-Goals**
- No framework, no bundler, no service worker (bookmark-URL simplicity beats offline PWA here).
- No auth beyond one optional shared token.

## Decisions

### Decision 1: Vanilla HTML/JS at `backend/static/remote/`

A single `index.html` + `app.js` + `style.css`, mounted before the SPA static mount. No React, no build: the file is the artifact. WebSocket for live state; REST for commands. Artwork/images come from existing URLs (no proxying needed). Target: < 400 lines of JS.

### Decision 2: Token as a tiny ASGI middleware

If `token` is set (env first, then runtime config), a middleware rejects `/api/*` without the token (header `X-Catodo-Token` or `?token=` for the WS handshake, which cannot set headers from browsers). `/remote`, `/assets`, and static files stay open so the page can load and ask. The remote stores the token in `sessionStorage` (not localStorage — shared living-room devices shouldn't accumulate credentials).

### Decision 3: CORS follows the bind

Loopback → keep `*` (harmless, same-machine). Non-loopback → origins derived from the bind host/port. This is a small middleware config branch in `create_app()`.

### Decision 4: Host switching requires restart

`host`/`port` read at startup only (uvicorn binds once). `POST /api/config` can store them, and the response flags `restart_required: true` for those keys. No dynamic rebinding — out of scope and risky.

### Decision 5: Remote feature set = read + channel + transport + volume

Now-playing reads the spotify channel state (already exposed); transport commands go to the *current* channel when it accepts them. No anime episode browser on the phone (v1): channel switch + play/pause/next/prev covers couch usage.

### Dependency note

Best applied after `event-driven-state` (the remote leans on the WS snapshot + events; without them it falls back to a 2s poll — acceptable degradation, implemented as the same code path the kiosk used to have). `media-persistence` is independent.
