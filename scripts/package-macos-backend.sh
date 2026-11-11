#!/usr/bin/env bash
# Construye el bundle macOS autocontenido del backend y lo empaqueta.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
ARCH="$(uname -m)"
case "$ARCH" in
    arm64) ARCH_LABEL="arm64" ;;
    x86_64) ARCH_LABEL="x86_64" ;;
    *) echo "Arquitectura no soportada: $ARCH" >&2; exit 1 ;;
esac

if [ ! -f "$ROOT/backend/static/index.html" ]; then
    echo "Falta backend/static/index.html; corré scripts/build-static.sh primero." >&2
    exit 1
fi

echo "==> PyInstaller (macOS $ARCH_LABEL)"
(cd "$ROOT/backend" && \
    uv run --no-default-groups --group packaging pyinstaller \
        --noconfirm --clean \
        --distpath "$ROOT/release/backend" \
        --workpath "$ROOT/release/pyinstaller-work" \
        "$ROOT/packaging/macos/catodo.spec")

BUNDLE="$ROOT/release/backend/catodo-backend"
if [ ! -x "$BUNDLE/catodo-backend" ]; then
    echo "El bundle no se generó en $BUNDLE" >&2
    exit 1
fi

echo "==> Validando higiene del bundle"
if find "$BUNDLE" -type d \( -name tests -o -name __pycache__ \) -print -quit | grep -q .; then
    echo "El bundle contiene tests o __pycache__" >&2
    exit 1
fi
if find "$BUNDLE" -type f \( -name 'pytest' -o -name 'ruff' -o -name 'test_*.py' \) -print -quit | grep -q .; then
    echo "El bundle contiene dev dependencies" >&2
    exit 1
fi

OUT="$ROOT/release/catodo-backend-${VERSION}-macos-${ARCH_LABEL}.tar.gz"
echo "==> Empaquetando $OUT"
tar -czf "$OUT" -C "$ROOT/release/backend" catodo-backend

echo "==> Smoke test"
"$ROOT/scripts/smoke-backend-bundle.sh" "$BUNDLE"

echo "==> Listo: $OUT"
shasum -a 256 "$OUT"
