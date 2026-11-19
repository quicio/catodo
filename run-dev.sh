#!/usr/bin/env bash
# Cátodo dev launcher — Vite (HMR) + Electron, con puertos libres por checkout.
#
# Cada checkout guarda sus puertos/PIDs en /tmp/catodo-dev-<hash>.env para
# reusar backend/Vite sanos sin pisar otras instancias.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

# shellcheck source=scripts/_lib.sh
source "$ROOT_DIR/scripts/_lib.sh"

PROD_PORT="${CATODO_PROD_PORT:-8767}"
REUSE="${CATODO_DEV_REUSE:-1}"
FORCE_NEW="${CATODO_DEV_FORCE_NEW:-0}"
EXPLICIT_BACKEND_PORT="${CATODO_DEV_PORT:-}"
EXPLICIT_VITE_PORT="${CATODO_DEV_VITE_PORT:-}"
DRY_RUN=0

usage() {
    cat <<'USAGE'
Uso: ./run-dev.sh [opciones]

Opciones:
  --port N          Puerto preferido del backend (default 8765)
  --vite-port N     Puerto preferido de Vite (default 1420)
  --no-reuse        No reusar backend/Vite previos de este checkout
  --force-new       Ignorar el estado y arrancar una instancia nueva
  --dry-run         Mostrar los puertos elegidos y salir
  -h, --help        Esta ayuda

Variables:
  CATODO_DEV_PORT, CATODO_DEV_VITE_PORT, CATODO_DEV_REUSE,
  CATODO_DEV_FORCE_NEW, CATODO_DEV_STATE_FILE
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --port)
            EXPLICIT_BACKEND_PORT="${2:-}"
            [ -z "$EXPLICIT_BACKEND_PORT" ] && { echo "Falta el valor de --port" >&2; exit 2; }
            shift 2
            ;;
        --port=*) EXPLICIT_BACKEND_PORT="${1#*=}"; shift ;;
        --vite-port)
            EXPLICIT_VITE_PORT="${2:-}"
            [ -z "$EXPLICIT_VITE_PORT" ] && { echo "Falta el valor de --vite-port" >&2; exit 2; }
            shift 2
            ;;
        --vite-port=*) EXPLICIT_VITE_PORT="${1#*=}"; shift ;;
        --no-reuse) REUSE=0; shift ;;
        --force-new) FORCE_NEW=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "Opción desconocida: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

STATE_ID=$(printf '%s' "$ROOT_DIR" | cksum | awk '{print $1}')
STATE_FILE="${CATODO_DEV_STATE_FILE:-/tmp/catodo-dev-${STATE_ID}.env}"

BACKEND_PORT=""
VITE_PORT=""
VITE_URL=""
BACKEND_PID=""
VITE_PID=""
ELECTRON_PID=""
LIVE_BACKEND_PID=""
LIVE_VITE_PID=""
STARTED_BACKEND=0
STARTED_VITE=0
CLEANED=0
BACKEND_LOG=""
VITE_LOG=""
ELECTRON_LOG=""

catodo_healthy() {
    local port="$1"
    curl -sf -m 2 "http://127.0.0.1:${port}/api/health" 2>/dev/null | grep -q '"status"' &&
        curl -sf -m 2 "http://127.0.0.1:${port}/api/version" 2>/dev/null | grep -q '"version"'
}

write_state() {
    [ -z "$BACKEND_PORT" ] && [ -z "$VITE_PORT" ] && return 0
    local tmp="${STATE_FILE}.tmp"
    {
        echo "ST_BACKEND_PORT=${BACKEND_PORT}"
        echo "ST_BACKEND_PID=${LIVE_BACKEND_PID}"
        echo "ST_VITE_PORT=${VITE_PORT}"
        echo "ST_VITE_PID=${LIVE_VITE_PID}"
        echo "ST_VITE_URL=${VITE_URL}"
        echo "ST_UPDATED=$(date +%s)"
    } > "$tmp" && mv "$tmp" "$STATE_FILE"
}

read_state() {
    ST_BACKEND_PORT=""
    ST_BACKEND_PID=""
    ST_VITE_PORT=""
    ST_VITE_PID=""
    ST_VITE_URL=""
    if [ -f "$STATE_FILE" ]; then
        # Archivo propio de este checkout: sólo puertos, PIDs y una URL simple.
        # shellcheck disable=SC1090
        . "$STATE_FILE" 2>/dev/null || true
    fi
}

persist_live_state() {
    if [ -n "$LIVE_BACKEND_PID" ] && ! kill -0 "$LIVE_BACKEND_PID" 2>/dev/null; then
        LIVE_BACKEND_PID=""
    fi
    if [ -n "$LIVE_VITE_PID" ] && ! kill -0 "$LIVE_VITE_PID" 2>/dev/null; then
        LIVE_VITE_PID=""
    fi
    if [ -n "$LIVE_BACKEND_PID" ] || [ -n "$LIVE_VITE_PID" ]; then
        write_state
    else
        rm -f "$STATE_FILE"
    fi
}

cleanup() {
    if [ "$CLEANED" -eq 1 ]; then
        return
    fi
    CLEANED=1
    echo
    echo "==> Stopping"
    if [ -n "$ELECTRON_PID" ]; then
        kill_tree "$ELECTRON_PID" TERM
    fi
    if [ "$STARTED_VITE" -eq 1 ] && [ -n "$VITE_PID" ]; then
        kill_tree "$VITE_PID" TERM
        LIVE_VITE_PID=""
    fi
    if [ "$STARTED_BACKEND" -eq 1 ] && [ -n "$BACKEND_PID" ]; then
        kill_tree "$BACKEND_PID" TERM
        LIVE_BACKEND_PID=""
    fi
    sleep 0.4
    if [ -n "$ELECTRON_PID" ]; then
        kill_tree "$ELECTRON_PID" KILL
    fi
    if [ "$STARTED_VITE" -eq 1 ] && [ -n "$VITE_PID" ]; then
        kill_tree "$VITE_PID" KILL
    fi
    if [ "$STARTED_BACKEND" -eq 1 ] && [ -n "$BACKEND_PID" ]; then
        kill_tree "$BACKEND_PID" KILL
    fi
    persist_live_state
}

pick_backend_port() {
    local preferred="${EXPLICIT_BACKEND_PORT:-8765}"
    if [ "$preferred" = "$PROD_PORT" ] && [ -z "$EXPLICIT_BACKEND_PORT" ]; then
        preferred=8765
    fi
    if [ -n "$EXPLICIT_BACKEND_PORT" ] && [ "$preferred" = "$PROD_PORT" ]; then
        echo "    El puerto ${PROD_PORT} es de prod; elijo un puerto dev libre." >&2
        preferred=8765
    fi
    if ! port_in_use "$preferred"; then
        echo "$preferred"
        return 0
    fi
    if [ -n "$EXPLICIT_BACKEND_PORT" ]; then
        echo "    Puerto ${preferred} ocupado; busco el siguiente libre." >&2
    fi
    free_port 8765 8799 "$PROD_PORT"
}

pick_vite_port() {
    local preferred="${EXPLICIT_VITE_PORT:-1420}"
    if ! port_in_use "$preferred"; then
        echo "$preferred"
        return 0
    fi
    if [ -n "$EXPLICIT_VITE_PORT" ]; then
        echo "    Puerto Vite ${preferred} ocupado; busco el siguiente libre." >&2
    fi
    free_port 1420 1460
}

read_state

REUSE_BACKEND=0
REUSE_VITE=0
if [ "$REUSE" = "1" ] && [ "$FORCE_NEW" != "1" ]; then
    if [ -n "$ST_BACKEND_PID" ] &&
        kill -0 "$ST_BACKEND_PID" 2>/dev/null &&
        catodo_healthy "$ST_BACKEND_PORT" &&
        ! backend_stale "$ST_BACKEND_PID" "$ROOT_DIR/rust/crates/catodo-server/src/main.rs" &&
        { [ -z "$EXPLICIT_BACKEND_PORT" ] || [ "$EXPLICIT_BACKEND_PORT" = "$ST_BACKEND_PORT" ]; }; then
        REUSE_BACKEND=1
        BACKEND_PORT="$ST_BACKEND_PORT"
        LIVE_BACKEND_PID="$ST_BACKEND_PID"
        echo "==> Reusando backend de este checkout en :${BACKEND_PORT} (PID ${ST_BACKEND_PID})"
    else
        # Si el backend guardado existe pero está viejo, se descarta junto con
        # su Vite; el nuevo arranque usará puertos libres.
        if [ -n "$ST_BACKEND_PID" ] && kill -0 "$ST_BACKEND_PID" 2>/dev/null; then
            echo "==> El backend guardado (PID ${ST_BACKEND_PID}) está viejo o no responde; lo reinicio."
            kill_tree "$ST_BACKEND_PID" TERM
            sleep 0.3
            kill_tree "$ST_BACKEND_PID" KILL
        fi
        if [ -n "$ST_VITE_PID" ] && kill -0 "$ST_VITE_PID" 2>/dev/null; then
            kill_tree "$ST_VITE_PID" TERM
            sleep 0.3
            kill_tree "$ST_VITE_PID" KILL
        fi
        ST_BACKEND_PID=""
        ST_VITE_PID=""
    fi

    if [ "$REUSE_BACKEND" -eq 1 ] &&
        [ -n "$ST_VITE_PID" ] &&
        kill -0 "$ST_VITE_PID" 2>/dev/null &&
        [ -n "$ST_VITE_URL" ] &&
        curl -sf -m 2 "$ST_VITE_URL" >/dev/null 2>&1 &&
        { [ -z "$EXPLICIT_VITE_PORT" ] || [ "$EXPLICIT_VITE_PORT" = "$ST_VITE_PORT" ]; }; then
        REUSE_VITE=1
        VITE_PORT="$ST_VITE_PORT"
        VITE_URL="$ST_VITE_URL"
        LIVE_VITE_PID="$ST_VITE_PID"
        echo "==> Reusando Vite de este checkout en ${VITE_URL} (PID ${ST_VITE_PID})"
    fi
fi

if [ -z "$BACKEND_PORT" ]; then
    BACKEND_PORT=$(pick_backend_port) || {
        echo "ERROR: no encontré un puerto libre para el backend (8765–8799)." >&2
        exit 1
    }
fi

if [ -z "$VITE_PORT" ]; then
    VITE_PORT=$(pick_vite_port) || {
        echo "ERROR: no encontré un puerto libre para Vite (1420–1460)." >&2
        exit 1
    }
fi

VITE_URL="http://127.0.0.1:${VITE_PORT}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
BACKEND_LOG="/tmp/catodo-dev-${BACKEND_PORT}.log"
VITE_LOG="/tmp/catodo-dev-vite-${VITE_PORT}.log"
ELECTRON_LOG="/tmp/catodo-electron-${VITE_PORT}.log"

echo "==> Puertos dev: backend :${BACKEND_PORT} · Vite :${VITE_PORT}"

if [ -n "$(current_pid "$PROD_PORT")" ]; then
    echo "==> Backend PROD en :${PROD_PORT} — este dev no lo toca"
fi

if [ "$DRY_RUN" -eq 1 ]; then
    echo "==> Dry run: no se inician procesos."
    exit 0
fi

trap cleanup INT TERM EXIT

if [ "$REUSE_BACKEND" -ne 1 ]; then
    echo "==> Iniciando backend Rust en :${BACKEND_PORT} (log ${BACKEND_LOG})"
    (cd "$ROOT_DIR/rust" && \
        CATODO_HOST=127.0.0.1 \
        CATODO_PORT="$BACKEND_PORT" \
        CATODO_RS_PORT="$BACKEND_PORT" \
        CATODO_STATIC_DIR="$ROOT_DIR/backend/static" \
        CATODO_PLUGINS_REPO="$ROOT_DIR/plugins-repo" \
        cargo run -q -p catodo-server) >>"$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
    STARTED_BACKEND=1
    LIVE_BACKEND_PID="$BACKEND_PID"

    for _ in {1..40}; do
        if catodo_healthy "$BACKEND_PORT"; then
            break
        fi
        sleep 0.5
    done
    if ! catodo_healthy "$BACKEND_PORT"; then
        echo "ERROR: el backend no respondió en :${BACKEND_PORT}. Últimas líneas:" >&2
        tail -20 "$BACKEND_LOG" >&2 || true
        exit 1
    fi
fi

if [ "$REUSE_VITE" -ne 1 ]; then
    echo "==> Iniciando Vite en ${VITE_URL} (log ${VITE_LOG})"
    (cd "$FRONTEND_DIR" && \
        CATODO_PORT="$BACKEND_PORT" \
        CATODO_BACKEND_URL="$BACKEND_URL" \
        CATODO_VITE_PORT="$VITE_PORT" \
        npm run dev) >>"$VITE_LOG" 2>&1 &
    VITE_PID=$!
    STARTED_VITE=1
    LIVE_VITE_PID="$VITE_PID"

    for _ in {1..40}; do
        if curl -sf -m 1 "$VITE_URL" >/dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
    if ! curl -sf -m 1 "$VITE_URL" >/dev/null 2>&1; then
        echo "ERROR: Vite no respondió en ${VITE_URL}. Últimas líneas:" >&2
        tail -20 "$VITE_LOG" >&2 || true
        exit 1
    fi
fi

write_state

echo "==> Lanzando Electron (ECS con Widevine) apuntando a ${VITE_URL}"
if [ ! -d "$FRONTEND_DIR/node_modules/electron/dist" ]; then
    echo "    Falta el binario de Electron. Corré: cd frontend && npm ci"
fi

launch_electron() {
    local extra=("$@")
    (
        cd "$FRONTEND_DIR"
        CATODO_BACKEND_URL="$VITE_URL" npx electron "${extra[@]}" .
    ) >>"$ELECTRON_LOG" 2>&1 &
    ELECTRON_PID=$!
}

launch_electron
sleep 4
if ! kill -0 "$ELECTRON_PID" 2>/dev/null && grep -qE "zygote_host|Check failed|sandbox" "$ELECTRON_LOG"; then
    echo "    Electron crasheó por restricciones del sandbox del entorno."
    echo "    Reintentando con --no-sandbox..."
    launch_electron --no-sandbox
    sleep 2
fi

wait "$ELECTRON_PID"
