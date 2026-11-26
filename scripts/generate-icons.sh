#!/usr/bin/env bash
# Regenera los tamaños de icono que usa electron-builder en Linux
# (`build.linux.icon: "build/icons"`).
#
# hicolor sólo declara tamaños hasta 512x512; un PNG únicamente en
# 1024x1024 no lo encuentran Qt/Noctalia ni KDE. Por eso se publican los
# tamaños estándar.
#
#   ./scripts/generate-icons.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/catodo.png"
OUT="$ROOT/frontend/build/icons"

[ -f "$SRC" ] || { echo "error: falta $SRC" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 \
    || { echo "error: hace falta ffmpeg para escalar los iconos" >&2; exit 1; }

mkdir -p "$OUT"
for size in 16 24 32 48 64 96 128 256 512; do
    ffmpeg -loglevel error -y -i "$SRC" \
        -vf "scale=${size}:${size}:flags=lanczos" -pix_fmt rgba \
        "$OUT/${size}x${size}.png"
done
echo "==> iconos regenerados en $OUT"
ls -lh "$OUT"
