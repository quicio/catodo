#!/usr/bin/env bash
# Cátodo build script — compila frontend + Electron y genera los ejecutables
# (AppImage + .deb) en ./release/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
RELEASE_DIR="$ROOT_DIR/release"

echo "==> Descargando wallpapers nuevos si hace falta"
python3 "$ROOT_DIR/scripts/fetch_wallpapers.py" 2 2>/dev/null || true

"$ROOT_DIR/scripts/build-static.sh"

echo "==> Build Electron (target según OS)"
if [ "$(uname -s)" = "Darwin" ]; then
    "$ROOT_DIR/scripts/package-macos-app.sh"
else
    "$ROOT_DIR/scripts/package-linux-app.sh"
fi

echo
echo "==> Listo. Ejecutables en $RELEASE_DIR:"
ls -lh "$RELEASE_DIR"
