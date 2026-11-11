#!/usr/bin/env bash
# Smoke test del backend embebido en Catodo.app (zip o .app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INPUT="${1:?uso: smoke-app-bundle.sh <zip|Catodo.app>}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/catodo-app-smoke.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

if [ -f "$INPUT" ]; then
    unzip -q "$INPUT" -d "$TMP"
    APP="$(find "$TMP" -maxdepth 2 -name "Catodo.app" -type d ! -path "*/__MACOSX/*" | head -n 1)"
else
    APP="$INPUT"
fi

if [ -z "${APP:-}" ] || [ ! -d "$APP" ]; then
    echo "No encontré Catodo.app en $INPUT" >&2
    exit 1
fi

BUNDLE="$APP/Contents/Resources/backend"
if [ ! -x "$BUNDLE/catodo-backend" ]; then
    echo "El backend no está embebido en $APP" >&2
    exit 1
fi

"$ROOT/scripts/smoke-backend-bundle.sh" "$BUNDLE"
