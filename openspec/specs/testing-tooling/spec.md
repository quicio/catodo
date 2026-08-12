# testing-tooling Specification

## Purpose
Defines the minimal automated safety net: what is tested, how tests run, and the single command that proves the repo is healthy.
## Requirements
### Requirement: Backend test suite

The backend SHALL have a pytest suite (with `pytest-asyncio`) covering: volume level parsing, runtime config (defaults, overrides, atomicity, corrupt recovery), the event broker (publish/subscribe/shutdown), the shared JSON store, and anime library scan grouping.

#### Scenario: Pure-logic unit tests run offline

- **WHEN** `pytest` runs on a machine without Spotify, DBus, or network
- **THEN** the unit tests pass without skipping for missing services.

### Requirement: API smoke tests

The suite SHALL include API smoke tests (FastAPI test client, temp data dir) for: health, channel list, open unknown channel → 404, volume set/relative/invalid, config round-trip with unknown-key filtering, and the WebSocket snapshot/event flow.

#### Scenario: Smoke tests are hermetic

- **WHEN** API smoke tests run
- **THEN** they use a temporary data dir and do not touch the real `~/.local/share/catodo`.

### Requirement: Spec-linked tests

Each smoke test SHALL reference the spec scenario it covers (comment or test name), so a spec change points at its test.

#### Scenario: Traceable coverage

- **WHEN** reading a test like `test_volume_relative_plus`
- **THEN** its body names the scenario (e.g. "Volume endpoint parsing / Relative plus").

### Requirement: Single check entry point

`scripts/check.sh` SHALL run backend lint (ruff), backend tests, and the frontend typecheck, failing fast with a non-zero exit on any failure.

#### Scenario: One command gate

- **WHEN** a developer runs `scripts/check.sh` on a clean tree
- **THEN** it exits 0 only if lint, tests, and typecheck all pass.

### Requirement: Production install stays lean

Test/lint dependencies SHALL live in a dev extra/group and SHALL NOT be installed by the production `install.sh` path.

#### Scenario: Prod sync excludes dev deps

- **WHEN** `uv sync` runs without the dev group
- **THEN** pytest and ruff are not installed into the production environment.

