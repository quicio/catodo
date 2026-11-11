#!/usr/bin/env bash
# Smoke test de un bundle de backend (directorio o tarball).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
INPUT="${1:-$ROOT/release/backend/catodo-backend}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/catodo-smoke.XXXXXX")"
PID=""
cleanup() {
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
        wait "$PID" 2>/dev/null || true
    fi
    rm -rf "$TMP"
}
trap cleanup EXIT

if [ -f "$INPUT" ]; then
    tar -xzf "$INPUT" -C "$TMP"
    BUNDLE="$TMP/catodo-backend"
else
    BUNDLE="$INPUT"
fi

if [ ! -x "$BUNDLE/catodo-backend" ]; then
    echo "No encuentro el ejecutable en $BUNDLE" >&2
    exit 1
fi

echo "==> catodo --version"
VERSION_OUT="$("$BUNDLE/catodo-backend" --version)"
echo "$VERSION_OUT"
case "$VERSION_OUT" in
    *"$VERSION"*) ;;
    *) echo "Versión inesperada: $VERSION_OUT (esperaba $VERSION)" >&2; exit 1 ;;
esac

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DATA="$TMP/data"
mkdir -p "$DATA"
LOG="$TMP/backend.log"
CATODO_PORT="$PORT" CATODO_DATA_DIR="$DATA" "$BUNDLE/catodo-backend" >"$LOG" 2>&1 &
PID=$!

for _ in $(seq 1 40); do
    if curl -sf -m 1 "http://127.0.0.1:$PORT/api/health" >"$TMP/health.json"; then
        break
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "El backend murió durante el arranque" >&2
        cat "$LOG" >&2
        exit 1
    fi
    sleep 0.5
done

if [ ! -s "$TMP/health.json" ]; then
    echo "El backend no respondió /api/health" >&2
    cat "$LOG" >&2
    exit 1
fi
grep -q '"status":"ok"' "$TMP/health.json"

curl -sf -m 2 "http://127.0.0.1:$PORT/api/version" >"$TMP/version.json"
grep -q "\"version\":\"$VERSION\"" "$TMP/version.json"

curl -sf -m 2 "http://127.0.0.1:$PORT/" >"$TMP/index.html"
grep -q "id=\"root\"" "$TMP/index.html"

echo "==> Smoke OK (health, version, static)"
