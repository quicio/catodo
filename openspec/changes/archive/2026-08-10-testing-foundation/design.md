# Design

## Context

See proposal.md — Why. Constraint set: no DBus/Spotify/network in CI-like runs, no new production dependencies, keep it stdlib+pytest.

## Goals / Non-Goals

**Goals**
- `scripts/check.sh` is the only command a contributor needs.
- Tests double as executable spec scenarios.

**Non-Goals**
- No coverage gates, no browser/Electron automation, no mutation/property testing.

## Decisions

### Decision 1: Layout `backend/tests/`, dev group in `pyproject.toml`

```
backend/tests/
  conftest.py        # tmp data-dir fixtures, app factory with fake channels
  test_config.py     # runtime_config + store
  test_events.py     # broker pub/sub/close
  test_volume.py     # level parsing, mixer fallback logic (mixer faked)
  test_anime_scan.py # scan/grouping over a tmp tree
  test_api_smoke.py  # TestClient: health/channels/open-404/volume/config/ws
```

`[dependency-groups] dev = ["pytest", "pytest-asyncio", "ruff", "httpx"]` keeps production `uv sync` lean; `install.sh` unchanged.

### Decision 2: Seams, not frameworks

- Mixer: the module from `fix-critical-bugs` takes an injectable runner; tests inject a fake.
- DBus/MPRIS: channels already tolerate absence; tests never import `gi`.
- Time: anime scan TTL and watcher intervals accept constructor params; tests use 0.
- App factory: `create_app()` already exists; tests override `CATODO_DATA_DIR` to a `tmp_path` before import-time reads (config is frozen at import, so fixtures set env via `monkeypatch` + module reload where unavoidable — kept to one helper).

### Decision 3: WS test via TestClient

Starlette's `TestClient` supports websocket sessions; the smoke test connects, asserts the snapshot is first (post `event-driven-state`), triggers a REST action, and asserts the matching event arrives.

### Decision 4: ruff minimal ruleset

`ruff` with `E`, `F`, `I` (imports), `UP` (pyupgrade), `ASYNC` — catches real bugs (unused imports like today's dead ones, async mistakes) without style wars. Line length 110 to match current code.

### Decision 5: `scripts/check.sh`

`uv run --group dev ruff check backend/ && uv run --group dev pytest backend/tests -q && (cd frontend && npm run typecheck)` — three legs, fail-fast, echoes a summary. GitHub Actions only mirrors this script when the repo goes remote; not part of this change.

### Ordering note

Land after `fix-critical-bugs` and `backend-async-hardening` so tests pin the *fixed* behavior; scenarios for `event-driven-state`/`media-persistence` get their tests added by those changes' tasks following this foundation.
