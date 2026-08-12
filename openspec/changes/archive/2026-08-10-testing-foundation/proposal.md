# Testing Foundation

## Why

The project ships a 24/7 systemd service with zero automated tests — every fix so far was verified by hand. With five behavior changes queued (volume, hardening, events, persistence), manual verification becomes the bottleneck and regressions become invisible. We need a minimal safety net before those changes land, not after.

## What Changes

- **pytest scaffold** for the backend (`pytest`, `pytest-asyncio` as dev deps): unit tests for pure logic (volume parsing, runtime config, store, event broker, scan grouping) and API smoke tests using FastAPI's `TestClient` against a throwaway app instance with temp data dirs.
- **Contract tests from specs**: each API smoke test names the spec scenario it covers, so specs stop being aspirational documents.
- **Frontend typecheck gate**: `tsc --noEmit` already runs in build; add a standalone `npm run typecheck` and keep it green.
- **Lint baseline**: `ruff` for the backend with a minimal ruleset, wired into a `make check`/`scripts/check.sh` that runs everything.
- **CI (optional, local-first)**: a `scripts/check.sh` that is the single entry point; a GitHub Actions workflow only if the repo goes remote — local script is the contract.

No production code behavior changes; only testability seams where strictly needed (e.g. injectable clock/paths).

## Capabilities

### New Capabilities

- `testing-tooling`: the test runner setup, what must be covered, and the check entry point. (Tooling capability — behavior of the dev workflow, not the product.)

## Non-goals

- Coverage targets or gates (start with smoke + pure logic; percentages later).
- E2E/browser tests (Playwright) and Electron harnesses.
- Mocking Spotify/MPRIS beyond a simple fake — integration with real DBus stays manual.
- Load/performance testing.

## Impact

- `backend/pyproject.toml` (dev extras), new `backend/tests/`, `scripts/check.sh`, `frontend/package.json` (typecheck script).
- Zero runtime impact; `uv sync` stays lean for production via extras separation.
