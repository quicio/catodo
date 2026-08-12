#!/usr/bin/env bash
# Cátodo quality gate — lint + tests + typecheck.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

echo "==> Backend lint (ruff)"
(cd "$ROOT/backend" && uv run --group dev ruff check) || FAIL=1

echo "==> Backend tests (pytest)"
(cd "$ROOT/backend" && uv run --group dev pytest -q --tb=short "$ROOT/backend/tests") || FAIL=1

echo "==> Frontend typecheck (tsc)"
(cd "$ROOT/frontend" && npx tsc --noEmit) || FAIL=1

if [ "$FAIL" -eq 0 ]; then
    echo "==> All checks passed"
else
    echo "==> Some checks FAILED" >&2
fi
exit $FAIL
