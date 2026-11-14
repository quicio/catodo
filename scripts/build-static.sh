#!/usr/bin/env bash
# Construye el frontend y lo copia a backend/static, preservando remote/ y cast/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_DIR="$ROOT/backend"
STATIC_DIR="$BACKEND_DIR/static"

echo "==> Build frontend"
(cd "$FRONTEND_DIR" && npm run build)

echo "==> Copiando frontend a backend/static"
for d in remote cast; do
    if [ -d "$STATIC_DIR/$d" ]; then
        cp -r "$STATIC_DIR/$d" "/tmp/catodo-$d-backup"
    fi
done
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -r "$FRONTEND_DIR/dist/"* "$STATIC_DIR/"
for d in remote cast; do
    if [ -d "/tmp/catodo-$d-backup" ]; then
        cp -r "/tmp/catodo-$d-backup" "$STATIC_DIR/$d"
        rm -rf "/tmp/catodo-$d-backup"
    fi
done

# noise.png lo usan los efectos del canal Anime; se regenera determinístico.
node "$ROOT/scripts/gen-noise.mjs" "$STATIC_DIR/noise.png"

echo "==> Static listo en $STATIC_DIR"
