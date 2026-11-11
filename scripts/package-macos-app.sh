#!/usr/bin/env bash
# Construye el zip de la app macOS con el backend embebido en Contents/Resources/backend.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
ARCH="$(uname -m)"
case "$ARCH" in
    arm64) ARCH_LABEL="arm64" ;;
    x86_64) ARCH_LABEL="x86_64" ;;
    *) echo "Arquitectura no soportada: $ARCH" >&2; exit 1 ;;
esac

BUNDLE="$ROOT/release/backend-rust"
if [ ! -x "$BUNDLE/catodo-backend" ]; then
    echo "==> Backend Rust no encontrado; construyéndolo"
    "$ROOT/scripts/package-rust-backend.sh"
fi

STAGE="$ROOT/frontend/backend-bundle"
cleanup() {
    rm -rf "$STAGE"/*
    mkdir -p "$STAGE"
}
trap cleanup EXIT

echo "==> Copiando backend a $STAGE"
mkdir -p "$STAGE"
rm -rf "$STAGE"/*
cp -R "$BUNDLE"/. "$STAGE"/

echo "==> Electron macOS (dir)"
(cd "$ROOT/frontend" && npm run build && npx electron-builder --mac dir)

APP="$ROOT/frontend/release/mac-${ARCH_LABEL}/Catodo.app"
if [ ! -d "$APP" ]; then
    APP=$(find "$ROOT/frontend/release" -maxdepth 2 -name "Catodo.app" -type d | head -n 1)
fi
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
    echo "No se generó Catodo.app" >&2
    exit 1
fi

echo "==> Verificando backend embebido"
if [ ! -x "$APP/Contents/Resources/backend/catodo-backend" ]; then
    echo "El backend no quedó embebido en la app" >&2
    exit 1
fi

echo "==> Firmando ad-hoc"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

OUT="$ROOT/release/Catodo-${VERSION}-mac-${ARCH_LABEL}.zip"
echo "==> Empaquetando $OUT"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT"

echo "==> Smoke test del backend embebido"
"$ROOT/scripts/smoke-app-bundle.sh" "$OUT"

echo "==> Listo: $OUT"
