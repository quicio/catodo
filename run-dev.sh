#!/usr/bin/env bash
# Cátodo dev launcher — Vite (HMR) + Electron, con cleanup limpio en Ctrl+C.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

VITE_URL="http://127.0.0.1:1420"

VITE_PID=""
ELECTRON_PID=""
CLEANED=0

cleanup() {
    if [ "$CLEANED" -eq 1 ]; then
        return
    fi
    CLEANED=1
    echo
    echo "==> Stopping"
    [ -n "$ELECTRON_PID" ] && kill "$ELECTRON_PID" 2>/dev/null && wait "$ELECTRON_PID" 2>/dev/null
    [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null && wait "$VITE_PID" 2>/dev/null
    pkill -9 -f "vite" 2>/dev/null || true
    pkill -9 -f "electron.*catodo-frontend" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "==> Verificando backend (FastAPI en :8765)"
if ! curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/api/health | grep -q 200; then
    echo "    Backend no responde. Iniciando..."
    (cd "$ROOT_DIR/backend" && uv run python -m catodo) 2>&1 | tee -a /tmp/catodo-dev.log &
    BACKEND_PID=$!
    sleep 2
fi
curl -s http://127.0.0.1:8765/api/health
echo

echo "==> Limpiando procesos previos"
pkill -9 -f "vite" 2>/dev/null || true
pkill -9 -f "electron.*catodo-frontend" 2>/dev/null || true
sleep 1

echo "==> Iniciando Vite dev server (HMR) en $VITE_URL"
(cd "$FRONTEND_DIR" && npm run dev) &
VITE_PID=$!

echo "==> Esperando que Vite esté listo"
for i in {1..40}; do
    if curl -s -m 1 -o /dev/null -w "%{http_code}" "$VITE_URL" 2>/dev/null | grep -q 200; then
        echo "    Vite listo"
        break
    fi
    sleep 0.5
done

echo "==> Lanzando Electron castLabs (Widevine) apuntando a Vite"
CASTLAB_ELECTRON="$FRONTEND_DIR/electron-castlab/usr/lib/electron-castlab/electron"
if [ ! -x "$CASTLAB_ELECTRON" ]; then
    echo "    Electron castLabs no encontrado."
    echo "    Los canales DRM (Movistar TV, HBO Max) no tendrán Widevine."
    echo "    Instalalo con: bash scripts/install_castlab.sh"
    CASTLAB_ELECTRON=""
fi
(
    cd "$FRONTEND_DIR"
    if [ -n "$CASTLAB_ELECTRON" ]; then
        CATODO_BACKEND_URL="$VITE_URL" "$CASTLAB_ELECTRON" . 2>&1 | tee -a /tmp/catodo-dev.log
    else
        CATODO_BACKEND_URL="$VITE_URL" npx electron . 2>&1 | tee -a /tmp/catodo-dev.log
    fi
) &
ELECTRON_PID=$!

wait "$VITE_PID" "$ELECTRON_PID"
