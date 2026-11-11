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
NOISE_TARGET="$STATIC_DIR/noise.png" python3 - <<'PY'
import os, struct, zlib, random
random.seed(42)
W, H = 128, 128
raw = b''
for _y in range(H):
    raw += b'\x00'
    for _x in range(W):
        v = random.randint(0, 255)
        raw += bytes([v, v, v, 255])
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
sig = b'\x89PNG\r\n\x1a\n'
png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
with open(os.environ["NOISE_TARGET"], 'wb') as f:
    f.write(png)
PY

echo "==> Static listo en $STATIC_DIR"
