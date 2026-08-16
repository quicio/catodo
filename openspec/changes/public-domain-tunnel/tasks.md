## 1. Tunnel provider abstraction

- [x] 1.1 Create `catodo/tunnel/` package with `__init__.py`, `provider.py`, `manager.py`, `providers/__init__.py`
- [x] 1.2 Define `TunnelProvider` Protocol in `provider.py` with `name`, `validate_config`, `start`, `stop`, `is_running`, `health`
- [x] 1.3 Define `TunnelHandle` dataclass (`pid`, `started_at`) and `TunnelState` enum (`stopped`, `starting`, `running`, `failed`, `degraded`)
- [x] 1.4 Implement `register`/`get_provider`/`available` registry in `catodo/tunnel/__init__.py`

## 2. Cloudflare provider (default)

- [x] 2.1 Create `catodo/tunnel/providers/cloudflare.py` with `CloudflareTunnelProvider` (self-registers via `@register`)
- [x] 2.2 Implement `validate_config()`: `shutil.which("cloudflared")` + token file readable + `public_domain` non-empty; return list of human-readable errors
- [x] 2.3 Implement `start()`: `subprocess.Popen([...], start_new_session=True)` with `--no-autoupdate run --token-file <path>`; return `TunnelHandle`
- [x] 2.4 Implement `stop()`: SIGTERM to process group, wait `timeout`, escalate to SIGKILL
- [x] 2.5 Implement `is_running()`: `proc.poll() is None`
- [x] 2.6 Implement `health()`: `urllib.request.urlopen(https://<public_domain>/api/health, timeout=3)` returning `{reachable, latency_ms|last_error}`

## 3. Tunnel manager

- [x] 3.1 Implement `TunnelManager` in `manager.py` with state persistence in `~/.local/share/catodo/tunnel_state.json` (atomic write like `runtime_config._save_inner`)
- [x] 3.2 Implement `start()` / `stop()` / `status()` / `health()` / `providers()` methods that delegate to the active provider
- [x] 3.3 Wire `start()` to spawn a watcher task that reaps the child and updates state on non-zero exit
- [x] 3.4 Wire `health()` to a periodic background task that calls `provider.health()` and publishes `tunnel_state` transitions through `EventBroker`
- [x] 3.5 Implement provider swap: `start()` stops the previous provider before starting the new one (via `_stop_locked`)
- [x] 3.6 Singleton accessor + integration in `main.py` lifespan (`app.state.tunnel`); shutdown calls `manager.shutdown()` before lifespan closes

## 4. Runtime config keys

- [x] 4.1 Add `public_domain`, `tunnel_enabled`, `tunnel_provider`, `tunnel_token_path`, `tunnel_require_token` to `KEYS` in `runtime_config.py` with defaults
- [x] 4.2 Add `_normalize_public_domain()` helper (lowercase, strip scheme, strip trailing slash, strip path); reject invalid values in `POST /api/config`
- [x] 4.3 Add `validate_tunnel_provider()` that consults `tunnel.available()` and rejects unknown values
- [x] 4.4 Surface validation errors as `400` with `{"detail": "..."}` from `POST /api/config` (atomic: if any tunnel key fails, the whole tunnel group is rejected, non-tunnel keys in the same payload still go through)

## 5. Tunnel HTTP API

- [x] 5.1 Create `catodo/tunnel_api.py` with router exposing `POST /api/tunnel/{start,stop}`, `GET /api/tunnel/{status,health,providers}`
- [x] 5.2 Mount the router in `main.py` with prefix `/api/tunnel`
- [x] 5.3 Add `tunnel_state` events through `EventBroker` (see `catodo/events.py` for the existing broker)
- [ ] 5.4 Manual end-to-end test: start tunnel, hit `/api/health` through the public URL, verify status reflects `running` — requires a real Cloudflare tunnel + domain, deferred to deploy

## 6. Token enforcement

- [x] 6.1 Refactor token middleware in `main.py` so the predicate becomes `_is_token_required()` instead of `bool(_token)`
- [x] 6.2 `_is_token_required()` returns true if `CATODO_TOKEN` env is set, OR if `tunnel_enabled && tunnel_require_token` are both true
- [x] 6.3 Add `/api/tunnel/providers` and `/api/tunnel/status` to the public-exemption list (no token required) along with the existing `/api/health` and `/api/pair/info`
- [x] 6.4 Add a test for: tunnel enabled → no token → 401; tunnel disabled → no token → 200; tunnel enabled + correct token → 200 (in `tests/test_tunnel_integration.py`)

## 7. Pairing rewrite

- [x] 7.1 Rewrite `pair.py` to expose `pair_urls()` returning `{lan, public, primary, code}`; `primary` is `"public"` when the tunnel is enabled and `public_domain` is set, else `"lan"`
- [x] 7.2 Update `GET /api/pair/info` to return the full dict
- [x] 7.3 Update `GET /api/pair/qr` to encode `primary` by default; add `?which=lan` query param for explicit LAN
- [x] 7.4 Add a test: tunnel enabled → QR encodes public URL; tunnel disabled → QR encodes LAN URL (covered by `tests/test_pair.py` + `tests/test_tunnel_integration.py`)

## 8. PWA manifest + service worker

- [x] 8.1 Add `backend/static/remote/manifest.webmanifest` with `name`, `short_name`, `start_url`, `display: standalone`, theme/background colors, icons 192/512/maskable
- [x] 8.2 Add `backend/static/remote/sw.js` with versioned cache of the shell, network-first for `/api/*`, offline fallback to cached shell
- [x] 8.3 Add `backend/static/remote/icons/icon-192.png`, `icon-512.png`, `icon-maskable.png` (generated from existing `catodo.png`)
- [x] 8.4 Verify the existing `StaticFiles` mount in `main.py:144` already serves these new files at `/remote/*` (covered by `tests/test_pwa_static.py`)

## 9. Frontend PWA wiring

- [x] 9.1 Add `<link rel="manifest" href="/remote/manifest.webmanifest">`, Apple meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`), and `viewport` meta tag to `frontend/index.html`
- [x] 9.2 Create `RemotePWAInstaller` component in `frontend/src/` that registers `/remote/sw.js` only when `location.pathname.startsWith("/remote")` and shows a dismissable "Instalar como app" banner on `beforeinstallprompt`
- [x] 9.3 Add token persistence in the remote: read `code` from URL on first load, store in `localStorage` after first successful API call, clear on `401` (fetch interceptor in `RemotePWAInstaller`)
- [ ] 9.4 Verify with `npm run build` + serve locally with HTTPS (`mkcert` or tunnel preview) and Lighthouse "Installable" criteria — deferred to manual verification

## 10. Settings UI

- [x] 10.1 Add `TunnelSection` in the existing Settings panel (`AppearanceSettings.tsx`) with inputs for domain, provider select (populated from `/api/tunnel/providers`), token path, toggles, and Start/Stop buttons
- [x] 10.2 Live status indicator: poll `GET /api/tunnel/health` every 5 s while section is open, show latency + state
- [x] 10.3 Add "Copiar URL pública" button (uses `/api/pair/info` `public` URL)
- [x] 10.4 Add inline help text explaining the Cloudflare CNAME setup (one-time, manual, outside Cátodo)

## 11. Installer

- [x] 11.1 Create `scripts/install_cloudflared.sh` that downloads the latest `cloudflared` binary from the GitHub release JSON into `~/.local/share/catodo/bin/`
- [x] 11.2 Verify SHA256 of the downloaded binary against the value published in the release JSON
- [x] 11.3 Add `~/.local/share/catodo/bin` to `PATH` for the systemd service's `Environment=PATH=...`
- [x] 11.4 Add `--no-cloudflared` opt-out for users who already have `cloudflared` system-wide or don't want this module
- [ ] 11.5 Manual test on a clean VM: `bash install.sh` brings up a working `cloudflared`; `systemctl --user status catodo` shows the binary resolvable — deferred to deploy

## 12. Docs

- [x] 12.1 Add a "Dominio público y túnel" section to `README.md`: prerequisites (dominio en Cloudflare), one-time setup (create tunnel + CNAME), runtime toggles, security notes
- [x] 12.2 Update the "Remote en el celular (PWA + QR)" section to describe the install-on-phone flow
- [x] 12.3 Update the "Proyección de pantalla (Screen Cast)" section to mention the tunnel-based HTTPS path

## 13. Rollback

- [x] 13.1 Document rollback in `design.md` Migration Plan section: delete `catodo/tunnel/`, revert deltas in `pair.py`, `main.py`, `runtime_config.py`; existing `config.json` keeps the new keys (silently ignored)
- [x] 13.2 Smoke test for backend boot: covered by `tests/test_api_smoke.py::test_health_ok` (asserts `/api/health` returns 200)

## 14. Tailscale Funnel provider (added during implementation)

- [x] 14.1 Create `catodo/tunnel/providers/tailscale.py` with `TailscaleFunnelProvider` (self-registers via `@register` as `tailscale-funnel`)
- [x] 14.2 `validate_config()`: `tailscale` on PATH + `tailscale status --json` returns a `Self.DNSName` (i.e. authenticated)
- [x] 14.3 `start()`: `tailscale funnel --bg <port>` (the wrapper exits quickly; the listener lives in tailscaled); the manager keeps tailscaled's PID for liveness
- [x] 14.4 `stop()`: `tailscale funnel <port> off`
- [x] 14.5 `is_running()`: tailscaled alive AND `tailscale funnel status` lists the configured port
- [x] 14.6 `health()`: GET against `https://<node>.<tailnet>.ts.net/api/health`
- [x] 14.7 `public_url()` helper so `pair_urls()` can build the public URL from the live Tailscale state (Cloudflare still uses `public_domain` from config)
- [x] 14.8 Tests: registration, missing binary, unauthenticated state, public_url parsing
- [x] 14.9 `pair.py` updated to delegate URL construction to the active provider when it's Tailscale (Tailscale owns its hostname)
- [x] 14.10 README: "Alternativa sin dominio (Tailscale Funnel)" section
