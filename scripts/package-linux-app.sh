#!/usr/bin/env bash
# Construye AppImage/.deb y los copia a release/ con nombres canónicos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64|amd64) ARCH_LABEL="x86_64"; DEB_ARCH="amd64" ;;
    arm64|aarch64) ARCH_LABEL="arm64"; DEB_ARCH="arm64" ;;
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
mkdir -p "$STAGE"
rm -rf "$STAGE"/*
cp -R "$BUNDLE"/. "$STAGE"/

echo "==> Electron Linux"
(cd "$ROOT/frontend" && npm run electron:build:linux)

mkdir -p "$ROOT/release"
shopt -s nullglob
appimages=("$ROOT/frontend/release/Catodo-${VERSION}-"*.AppImage)
debs=("$ROOT/frontend/release/Catodo-${VERSION}-"*.deb)
shopt -u nullglob

if [ "${#appimages[@]}" -eq 0 ]; then
    echo "No se generó ningún AppImage" >&2
    exit 1
fi
if [ "${#debs[@]}" -eq 0 ]; then
    echo "No se generó ningún .deb" >&2
    exit 1
fi

APPIMAGE_OUT="$ROOT/release/Catodo-${VERSION}-linux-${ARCH_LABEL}.AppImage"
DEB_OUT="$ROOT/release/Catodo-${VERSION}-linux-${DEB_ARCH}.deb"
cp "${appimages[0]}" "$APPIMAGE_OUT"
cp "${debs[0]}" "$DEB_OUT"
chmod +x "$APPIMAGE_OUT"

echo "==> Listo:"
ls -lh "$APPIMAGE_OUT" "$DEB_OUT"
