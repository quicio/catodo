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

echo "==> Build frontend"
(cd "$FRONTEND_DIR" && npm run build)

echo "==> Copiando frontend a backend/static"
# Preservar backend/static/{remote,cast} (no forman parte del bundle Vite)
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

# recrear noise.png (usado por efectos del canal Anime)
python3 - <<'PY'
import struct, zlib, random
random.seed(42)
W, H = 128, 128
raw = b''
for y in range(H):
    raw += b'\x00'
    for x in range(W):
        v = random.randint(0, 255)
        raw += bytes([v, v, v, 255])
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
sig = b'\x89PNG\r\n\x1a\n'
png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
with open('/home/hugo/projects/catodo/backend/static/noise.png', 'wb') as f:
    f.write(png)
PY

echo "==> Build Electron (AppImage + deb)"
(cd "$FRONTEND_DIR" && npx electron-builder --linux AppImage deb)

echo "==> Copiando ejecutables a $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
cp "$FRONTEND_DIR"/release/*.AppImage "$FRONTEND_DIR"/release/*.deb "$RELEASE_DIR"/ 2>/dev/null || true

echo
echo "==> Listo. Ejecutables en $RELEASE_DIR:"
ls -lh "$RELEASE_DIR"
