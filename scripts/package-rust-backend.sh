#!/usr/bin/env bash
# Construye el backend Rust y arma un bundle con binario + static + plugins.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
OUT="$ROOT/release/backend-rust"

if [ ! -f "$ROOT/backend/static/index.html" ]; then
    echo "Falta backend/static/index.html; corré scripts/build-static.sh primero." >&2
    exit 1
fi

echo "==> cargo build --release -p catodo-server"
(cd "$ROOT/rust" && cargo build --release -p catodo-server)

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$ROOT/rust/target/release/catodo-server" "$OUT/catodo-backend"
chmod +x "$OUT/catodo-backend"
cp -R "$ROOT/backend/static" "$OUT/static"
cp -R "$ROOT/plugins-repo" "$OUT/plugins-repo"
cp "$ROOT/VERSION" "$OUT/VERSION"

echo "==> Smoke test del backend Rust"
"$ROOT/scripts/smoke-backend-bundle.sh" "$OUT"

echo "==> Bundle Rust listo en $OUT"
