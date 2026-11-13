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
    pkill -9 -f "target/debug/catodo-server" 2>/dev/null || true
    pkill -9 -f "cargo run -q -p catodo-server" 2>/dev/null || true
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
# (main.rs de Rust) → el código cambió mientras corría → reiniciar.
NEED_BACKEND=1
OLD_PID=$(current_pid "${CATODO_DEV_PORT:-8765}")

echo "==> Verificando backend (Rust en :${CATODO_DEV_PORT:-8765})"
if [ -n "$OLD_PID" ] && curl -s -m 2 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${CATODO_DEV_PORT:-8765}/api/health" 2>/dev/null | grep -q 200; then
    if backend_stale "$OLD_PID" "$ROOT_DIR/rust/crates/catodo-server/src/main.rs"; then
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
    if [ "${CATODO_DEV_BACKEND:-rust}" = "python" ]; then
        (cd "$ROOT_DIR/backend" && CATODO_PORT="${CATODO_DEV_PORT:-8765}" uv run python -m catodo) 2>&1 | tee -a /tmp/catodo-dev.log &
    else
        (cd "$ROOT_DIR/rust" &&             CATODO_HOST=127.0.0.1             CATODO_PORT="${CATODO_DEV_PORT:-8765}"             CATODO_RS_PORT="${CATODO_DEV_PORT:-8765}"             CATODO_STATIC_DIR="$ROOT_DIR/backend/static"             CATODO_PLUGINS_REPO="$ROOT_DIR/plugins-repo"             cargo run -q -p catodo-server) 2>&1 | tee -a /tmp/catodo-dev.log &
    fi
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

echo "==> Lanzando Electron (ECS con Widevine) apuntando a Vite"
if [ ! -d "$FRONTEND_DIR/node_modules/electron/dist" ]; then
    echo "    Falta el binario de Electron. Corré: cd frontend && npm ci"
fi
ELECTRON_RUN_LOG="/tmp/catodo-electron-run.log"

launch_electron() {
    local extra=("$@")
    (
        cd "$FRONTEND_DIR"
        {
            CATODO_BACKEND_URL="$VITE_URL" npx electron "${extra[@]}" .
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
