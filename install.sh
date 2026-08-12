#!/usr/bin/env bash
# Cátodo install script — backend venv + frontend build + Electron AppImage
# + systemd user service.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SERVICE_SRC="$BACKEND_DIR/systemd/catodo.service"
SERVICE_DST="$HOME/.config/systemd/user/catodo.service"

echo "==> Installing Cátodo backend (uv sync)"
(cd "$BACKEND_DIR" && uv sync)

echo "==> Building frontend"
(cd "$FRONTEND_DIR" && npm ci && npm run build)

echo "==> Copiando frontend a backend/static (preservando remote/ y cast/)"
for d in remote cast; do
    if [ -d "$BACKEND_DIR/static/$d" ]; then
        cp -r "$BACKEND_DIR/static/$d" "/tmp/catodo-$d-backup"
    fi
done
rm -rf "$BACKEND_DIR/static"
mkdir -p "$BACKEND_DIR/static"
cp -r "$FRONTEND_DIR/dist/"* "$BACKEND_DIR/static/"
for d in remote cast; do
    if [ -d "/tmp/catodo-$d-backup" ]; then
        cp -r "/tmp/catodo-$d-backup" "$BACKEND_DIR/static/$d"
        rm -rf "/tmp/catodo-$d-backup"
    fi
done

echo "==> Building Electron AppImage"
(cd "$FRONTEND_DIR" && npm run electron:build:linux)

APPIMAGE=$(find "$FRONTEND_DIR/release" -maxdepth 1 -name "*.AppImage" | head -n 1 || true)
if [ -n "$APPIMAGE" ]; then
    chmod +x "$APPIMAGE"
    echo "==> AppImage built: $APPIMAGE"
fi

echo "==> Provisioning plugin venv (dependencias de plugins)"
DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"
mkdir -p "$DATA_DIR"
if command -v uv >/dev/null 2>&1; then
    uv venv "$DATA_DIR/plugin-venv" >/dev/null 2>&1 || true
fi

if [ "${CATODO_SSL:-0}" = "1" ]; then
    echo "==> Generando certificado SSL (necesario para /cast y compartir pantalla)"
    bash "$PROJECT_DIR/scripts/make_cert.sh"
fi

echo "==> Installing systemd user service"
mkdir -p "$(dirname "$SERVICE_DST")"
cp "$SERVICE_SRC" "$SERVICE_DST"
systemctl --user daemon-reload
systemctl --user enable --now catodo.service

echo "==> Done. Status:"
systemctl --user --no-pager status catodo.service || true
