#!/usr/bin/env bash
# Verifica que todos los manifests declaren la misma versión que VERSION.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/check-version.mjs" "$ROOT"
