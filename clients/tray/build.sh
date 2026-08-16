#!/usr/bin/env bash
# Build the native Cátodo tray installer for the host platform and copy the
# bundle to release/tray/<platform>/. Requires Rust + cargo-tauri.
#
# Usage:
#   bash build.sh                  # release build
#   bash build.sh dev              # dev build (faster, with debug symbols)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE="${1:-release}"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
BUNDLE_DIR="$ROOT_DIR/target/${PROFILE}/bundle"
DEST_DIR="$ROOT_DIR/../../release/tray/${PLATFORM}"

cd "$ROOT_DIR"

if [ "$PROFILE" = "dev" ]; then
    echo "==> Building Cátodo tray (dev)"
    cargo build
else
    echo "==> Building Cátodo tray (release)"
    cargo tauri build
fi

mkdir -p "$DEST_DIR"
if [ -d "$BUNDLE_DIR" ]; then
    # Copy whatever cargo-tauri produced (dmg, msi, deb, appimage, etc.)
    cp -r "$BUNDLE_DIR"/* "$DEST_DIR/"
    echo "==> Bundle copied to $DEST_DIR"
    ls -la "$DEST_DIR"
else
    echo "==> No bundle directory at $BUNDLE_DIR; binary is at target/${PROFILE}/catodo-tray"
fi