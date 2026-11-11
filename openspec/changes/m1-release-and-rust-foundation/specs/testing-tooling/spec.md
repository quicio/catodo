## MODIFIED Requirements

### Requirement: Single check entry point

`scripts/check.sh` SHALL run backend lint (ruff), backend tests, frontend typecheck, version consistency, and the Rust workspace checks when `rust/Cargo.toml` exists. It SHALL fail fast with a non-zero exit on any failure. In CI (`CATODO_CI=1`), a missing `cargo` SHALL be a failure; locally, if `cargo` is not installed, the script SHALL report a visible skip for the Rust checks instead of failing.

#### Scenario: One command gate

- **WHEN** a developer runs `scripts/check.sh` on a clean tree with Rust installed
- **THEN** it exits 0 only if lint, tests, typecheck, version consistency, `cargo fmt`, `cargo clippy` and `cargo test` all pass

#### Scenario: CI without cargo fails

- **WHEN** `CATODO_CI=1` and `cargo` is not available
- **THEN** `scripts/check.sh` exits non-zero with a message that Rust is required in CI

#### Scenario: Local skip is visible

- **WHEN** a developer without `cargo` runs `scripts/check.sh`
- **THEN** the Python and TypeScript checks run normally and the output includes a visible "Rust checks skipped (cargo not found)" warning

## ADDED Requirements

### Requirement: Rust workspace checks

The repository SHALL provide `scripts/check-rust.sh` that runs `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` from `rust/`, plus `scripts/check-rust-layers.sh` for the crate dependency rules. CI SHALL run both scripts on Linux and macOS.

#### Scenario: Rust checks pass on a clean workspace

- **WHEN** `scripts/check-rust.sh` runs on the M1 workspace
- **THEN** formatting, clippy, tests and layer checks pass and the script exits 0

#### Scenario: Formatting drift fails

- **WHEN** a Rust file is not formatted with `rustfmt`
- **THEN** `scripts/check-rust.sh` exits non-zero and names the file

### Requirement: Version consistency check

The repository SHALL provide `scripts/check-version.sh` that compares `VERSION` with the backend, frontend, tray and Rust workspace manifests. CI and `scripts/check.sh` SHALL run it.

#### Scenario: Versions aligned

- **WHEN** all manifests match `VERSION`
- **THEN** `scripts/check-version.sh` exits 0

#### Scenario: Mismatch reported

- **WHEN** `frontend/package.json` declares a different version
- **THEN** `scripts/check-version.sh` exits non-zero and prints both versions and the file path
