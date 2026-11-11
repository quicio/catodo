#!/usr/bin/env bash
# Cátodo quality gate — lint + tests + typecheck + version + Rust.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

echo "==> Version consistency"
"$ROOT/scripts/check-version.sh" || FAIL=1

echo "==> Backend lint (ruff)"
(cd "$ROOT/backend" && uv run --group dev ruff check) || FAIL=1

echo "==> Backend tests (pytest)"
(cd "$ROOT/backend" && uv run --group dev pytest -q --tb=short "$ROOT/backend/tests") || FAIL=1

echo "==> Frontend typecheck (tsc)"
(cd "$ROOT/frontend" && npm run typecheck) || FAIL=1

if [ -f "$ROOT/rust/Cargo.toml" ]; then
    if command -v cargo >/dev/null 2>&1; then
        echo "==> Rust checks"
        "$ROOT/scripts/check-rust.sh" || FAIL=1
    elif [ "${CATODO_CI:-0}" = "1" ]; then
        echo "==> Rust checks FAILED: cargo not found (required in CI)" >&2
        FAIL=1
    else
        echo "==> Rust checks skipped (cargo not found)"
    fi
fi

if [ "$FAIL" -eq 0 ]; then
    echo "==> All checks passed"
else
    echo "==> Some checks FAILED" >&2
fi
exit $FAIL
