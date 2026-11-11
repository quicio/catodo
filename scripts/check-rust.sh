#!/usr/bin/env bash
# Gate del workspace Rust: fmt + clippy + tests + límites de capas.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f rust/Cargo.toml ]; then
    echo "Rust workspace not found at rust/Cargo.toml; skipping"
    exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo not found; install the Rust toolchain to run Rust checks" >&2
    exit 1
fi

echo "==> cargo fmt --check"
(cd rust && cargo fmt --all --check)

echo "==> cargo clippy"
(cd rust && cargo clippy --workspace --all-targets -- -D warnings)

echo "==> cargo test"
(cd rust && cargo test --workspace)

echo "==> layer checks"
"$ROOT/scripts/check-rust-layers.sh"
