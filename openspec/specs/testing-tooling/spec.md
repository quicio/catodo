# testing-tooling Specification

## Purpose
Defines the minimal automated safety net: what is tested, how tests run, and the single command that proves the repo is healthy. The suite is Rust + TypeScript; no Python.
## Requirements
### Requirement: Rust test suite

The backend SHALL have a Rust test suite covering: volume level parsing, runtime config (defaults, overrides, atomicity, corrupt recovery), the event broker (publish/subscribe/shutdown), the shared JSON store, anime library scan grouping, arcade RGB565 conversion, core pin verification, and pairing/auth.

#### Scenario: Pure-logic unit tests run offline

- **WHEN** `cargo test --workspace` runs on a machine without Spotify, DBus, or network
- **THEN** the unit tests pass without skipping for missing services.

### Requirement: API smoke tests

The suite SHALL include API integration tests (axum router with a temp data dir) for: health, channel list, open unknown channel → 404, volume set/relative/invalid, config round-trip with unknown-key filtering, the WebSocket snapshot/event flow, and unauthenticated LAN requests → 401.

#### Scenario: Smoke tests are hermetic

- **WHEN** API smoke tests run
- **THEN** they use a temporary data dir and do not touch the real `~/.local/share/catodo`.

### Requirement: Spec-linked tests

Each smoke test SHALL reference the spec scenario it covers (comment or test name), so a spec change points at its test.

#### Scenario: Traceable coverage

- **WHEN** reading a test like `volume_absolute_and_relative`
- **THEN** its body names the scenario (e.g. "Volume endpoint parsing / Relative plus").

### Requirement: Single check entry point

`scripts/check.sh` SHALL run the version consistency check, the frontend typecheck, and the Rust gate (`fmt`, `clippy`, tests, layer checks), failing with a non-zero exit on any failure.

#### Scenario: One command gate

- **WHEN** a developer runs `scripts/check.sh` on a clean tree
- **THEN** it exits 0 only if version, typecheck and Rust checks all pass.

### Requirement: Production install stays lean

The production `install.sh` path SHALL NOT install test or lint tooling; it SHALL only build the release binary and frontend.

#### Scenario: Release build excludes dev tooling

- **WHEN** `install.sh` runs
- **THEN** it runs `cargo build --release -p catodo-server` and does not install pytest, ruff, or any Python test dependency.
