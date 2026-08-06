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

echo "==> Building Electron AppImage"
(cd "$FRONTEND_DIR" && npm run electron:build:linux)

APPIMAGE=$(find "$FRONTEND_DIR/release" -maxdepth 1 -name "*.AppImage" | head -n 1 || true)
if [ -n "$APPIMAGE" ]; then
    chmod +x "$APPIMAGE"
    echo "==> AppImage built: $APPIMAGE"
fi

echo "==> Installing systemd user service"
mkdir -p "$(dirname "$SERVICE_DST")"
cp "$SERVICE_SRC" "$SERVICE_DST"
systemctl --user daemon-reload
systemctl --user enable --now catodo.service

echo "==> Done. Status:"
systemctl --user --no-pager status catodo.service || true
