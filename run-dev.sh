#!/usr/bin/env bash
# Cátodo dev launcher — Vite (HMR) + Electron, con cleanup limpio en Ctrl+C.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

# shellcheck source=scripts/_lib.sh
source "$ROOT_DIR/scripts/_lib.sh"

VITE_URL="http://127.0.0.1:1420"

VITE_PID=""
ELECTRON_PID=""
BACKEND_PID=""
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
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null
    pkill -9 -f "vite" 2>/dev/null || true
    pkill -9 -f "electron.*catodo-frontend" 2>/dev/null || true
    pkill -9 -f "python -m catodo" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

BACKEND_PORT="${CATODO_DEV_PORT:-8765}"
PROD_PORT="${CATODO_PROD_PORT:-8767}"

# Aviso si hay un backend prod (8767) corriendo, para que sepas que está intacto.
PROD_PID=$(current_pid "${CATODO_PROD_PORT:-8767}")
if [ -n "$PROD_PID" ]; then
    echo "==> Backend PROD en :${CATODO_PROD_PORT:-8767} (PID $PROD_PID) — este dev no lo toca"
fi

# ¿El backend que está corriendo es más viejo que el código fuente?
# Heurística: el start time del proceso es anterior al mtime del entrypoint
# (themes.py) → el código cambió mientras corría → reiniciar.
NEED_BACKEND=1
OLD_PID=$(current_pid "${CATODO_DEV_PORT:-8765}")

echo "==> Verificando backend (FastAPI en :${CATODO_DEV_PORT:-8765})"
if [ -n "$OLD_PID" ] && curl -s -m 2 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${CATODO_DEV_PORT:-8765}/api/health" 2>/dev/null | grep -q 200; then
    if backend_stale "$OLD_PID" "$ROOT_DIR/backend/catodo/themes.py"; then
        echo "    PID $OLD_PID arrancó antes del último cambio en el código. Lo reinicio."
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
        kill -9 "$OLD_PID" 2>/dev/null || true
        sleep 1
    else
        echo "    Backend al día (PID $OLD_PID). Lo reutilizo."
        echo "    Pasá --no-reuse para forzar reinicio."
        if [ "${CATODO_DEV_REUSE:-1}" = "1" ]; then
            NEED_BACKEND=0
        fi
    fi
fi

if [ "$NEED_BACKEND" -eq 1 ]; then
    echo "    Iniciando backend con el código actual..."
    (cd "$ROOT_DIR/backend" && CATODO_PORT="${CATODO_DEV_PORT:-8765}" uv run python -m catodo) 2>&1 | tee -a /tmp/catodo-dev.log &
    BACKEND_PID=$!

    for i in {1..20}; do
        if curl -s -m 1 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${CATODO_DEV_PORT:-8765}/api/health" 2>/dev/null | grep -q 200; then
            break
        fi
        sleep 0.5
    done
fi
curl -s "http://127.0.0.1:${CATODO_DEV_PORT:-8765}/api/health"
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
if [ "$(uname -s)" = "Darwin" ]; then
    CASTLAB_ELECTRON="$FRONTEND_DIR/electron-castlab/Electron.app/Contents/MacOS/Electron"
else
    CASTLAB_ELECTRON="$FRONTEND_DIR/electron-castlab/usr/lib/electron-castlab/electron"
fi
if [ ! -x "$CASTLAB_ELECTRON" ]; then
    echo "    Electron castLabs no encontrado."
    echo "    Los canales DRM (Movistar TV, HBO Max) no tendrán Widevine."
    echo "    Instalalo con: bash scripts/install_castlab.sh"
    CASTLAB_ELECTRON=""
fi
ELECTRON_RUN_LOG="/tmp/catodo-electron-run.log"

launch_electron() {
    local extra=("$@")
    (
        cd "$FRONTEND_DIR"
        {
            if [ -n "$CASTLAB_ELECTRON" ]; then
                CATODO_BACKEND_URL="$VITE_URL" "$CASTLAB_ELECTRON" "${extra[@]}" .
            else
                CATODO_BACKEND_URL="$VITE_URL" npx electron "${extra[@]}" .
            fi
        } 2>&1 | tee -a /tmp/catodo-dev.log
    ) > "$ELECTRON_RUN_LOG" &
    ELECTRON_PID=$!
}

launch_electron
sleep 4
if ! kill -0 "$ELECTRON_PID" 2>/dev/null && grep -qE "zygote_host|Check failed|sandbox" "$ELECTRON_RUN_LOG"; then
    echo "    Electron crasheó por restricciones del sandbox del entorno."
    echo "    Reintentando con --no-sandbox..."
    launch_electron --no-sandbox
fi

wait "$VITE_PID" "$ELECTRON_PID"
