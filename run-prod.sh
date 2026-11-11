#!/usr/bin/env bash
# Levanta el backend de Cátodo como daemon estable. Pensado para usar después
# de ./install.sh + systemctl (o corriendo este script como servicio).
# - NO toca Vite ni Electron (eso es dev).
# - NO reinicia si ya hay un backend sirviendo el código actual.
# - Si hay uno viejo, lo recicla.
#
# Uso: ./run-prod.sh [start|stop|status|restart]
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_BIN="$ROOT_DIR/rust/target/release/catodo-server"
PORT="${CATODO_PROD_PORT:-8767}"
DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"
LOG="${CATODO_LOG:-$ROOT_DIR/catodo.log}"

# shellcheck source=scripts/_lib.sh
source "$ROOT_DIR/scripts/_lib.sh"

ACTION="${1:-status}"
PIDFILE="${CATODO_PIDFILE:-/tmp/catodo.backend.pid}"

start() {
    local pid
    pid=$(current_pid "$PORT")
    if [ -n "$pid" ] && curl -sf -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
        if backend_stale "$pid" "$ROOT_DIR/rust/crates/catodo-server/src/main.rs"; then
            echo "Backend viejo (PID $pid). Reiniciando..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        else
            echo "Backend ya corriendo (PID $pid, código al día). OK."
            return 0
        fi
    fi
    echo "Iniciando backend (Rust)..."
    if [ ! -x "$BACKEND_BIN" ]; then
        echo "    Compilando backend Rust..."
        (cd "$ROOT_DIR/rust" && cargo build --release -p catodo-server) || return 1
    fi
    mkdir -p "$DATA_DIR"
    (cd "$ROOT_DIR" && \
        CATODO_HOST=127.0.0.1 CATODO_PORT="$PORT" CATODO_RS_PORT="$PORT" \
        CATODO_DATA_DIR="$DATA_DIR" \
        CATODO_STATIC_DIR="$BACKEND_DIR/static" \
        CATODO_PLUGINS_REPO="$ROOT_DIR/plugins-repo" \
        nohup "$BACKEND_BIN" > "$LOG" 2>&1 & echo $! > "$PIDFILE") </dev/null
    for i in {1..20}; do
        if curl -sf -m 1 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
            echo "Backend listo (PID $(cat "$PIDFILE" 2>/dev/null))."
            return 0
        fi
        sleep 0.5
    done
    echo "ERROR: backend no respondió. Log: $LOG" >&2
    return 1
}

stop() {
    local pid
    pid=$(current_pid "$PORT")
    if [ -z "$pid" ] && [ -f "$PIDFILE" ]; then
        pid=$(cat "$PIDFILE")
    fi
    if [ -z "$pid" ]; then
        echo "No hay backend corriendo."
        return 0
    fi
    echo "Deteniendo backend (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    for i in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$PIDFILE"
}

status() {
    local pid
    pid=$(current_pid "$PORT")
    if [ -z "$pid" ]; then
        echo "Backend: no corriendo"
        return 1
    fi
    echo "Backend: PID $pid, puerto $PORT"
    if backend_stale "$pid" "$ROOT_DIR/rust/crates/catodo-server/src/main.rs"; then
        echo "  ⚠ código fuente más nuevo que el proceso — reiniciar"
    else
        echo "  ✓ código al día"
    fi
    curl -s "http://127.0.0.1:$PORT/api/version" 2>/dev/null | sed 's/^/  /'
    echo
}

case "$ACTION" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *)       echo "Uso: $0 {start|stop|restart|status}"; exit 2 ;;
esac