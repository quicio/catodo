#!/usr/bin/env bash
# Empaqueta el árbol fuente del release con backend/static ya construido.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
NAME="catodo-${VERSION}"
OUT="$ROOT/release/${NAME}-src.tar.gz"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/catodo-src.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

if [ ! -f "$ROOT/backend/static/index.html" ]; then
    echo "Falta backend/static/index.html; corré scripts/build-static.sh primero." >&2
    exit 1
fi

echo "==> git archive HEAD"
mkdir -p "$TMP/$NAME"
git -C "$ROOT" archive HEAD | tar -x -C "$TMP/$NAME"

echo "==> Overlay backend/static y VERSION"
rm -rf "$TMP/$NAME/backend/static"
cp -R "$ROOT/backend/static" "$TMP/$NAME/backend/static"
cp "$ROOT/VERSION" "$TMP/$NAME/VERSION"

# Defensa por si el árbol de trabajo dejó basura tracked/untracked.
find "$TMP/$NAME" -type d \( -name node_modules -o -name .venv -o -name __pycache__ \
    -o -name .pytest_cache -o -name target -o -name dist \) -prune -exec rm -rf {} +
find "$TMP/$NAME" -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete

mkdir -p "$ROOT/release"
echo "==> Empaquetando $OUT"
tar -czf "$OUT" -C "$TMP" "$NAME"
echo "==> Listo: $OUT"
