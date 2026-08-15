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
PORT="${CATODO_PROD_PORT:-8767}"
DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"
LOG="${CATODO_LOG:-$ROOT_DIR/catodo.log}"

ACTION="${1:-status}"
PIDFILE="${CATODO_PIDFILE:-/tmp/catodo.backend.pid}"

backend_stale() {
    local pid="$1"
    local src="$BACKEND_DIR/catodo/themes.py"
    local src_mtime
    src_mtime=$(stat -c %Y "$src" 2>/dev/null || echo 0)
    local boot_jiffies pid_start_jiffies
    boot_jiffies=$(awk '/^btime/ {print $2}' /proc/stat 2>/dev/null || echo 0)
    pid_start_jiffies=$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || echo 0)
    [ "$pid_start_jiffies" -eq 0 ] && return 0
    local start_epoch=$(( boot_jiffies + pid_start_jiffies / 100 ))
    [ "$start_epoch" -lt "$src_mtime" ]
}

# PID del backend vivo en el puerto (vía ss + inode → PID)
current_pid() {
    ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1 || true
}

start() {
    local pid
    pid=$(current_pid)
    if [ -n "$pid" ] && curl -sf -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
        if backend_stale "$pid"; then
            echo "Backend viejo (PID $pid). Reiniciando..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        else
            echo "Backend ya corriendo (PID $pid, código al día). OK."
            return 0
        fi
    fi
    echo "Iniciando backend..."
    mkdir -p "$DATA_DIR"
    (cd "$BACKEND_DIR" && \
        CATODO_PORT="$PORT" CATODO_DATA_DIR="$DATA_DIR" \
        nohup uv run python -m catodo > "$LOG" 2>&1 & echo $! > "$PIDFILE") </dev/null
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
    pid=$(current_pid)
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
    pid=$(current_pid)
    if [ -z "$pid" ]; then
        echo "Backend: no corriendo"
        return 1
    fi
    echo "Backend: PID $pid, puerto $PORT"
    if backend_stale "$pid"; then
        echo "  ⚠ código fuente más nuevo que el proceso — reiniciar"
    else
        echo "  ✓ código al día"
    fi
    curl -s "http://127.0.0.1:$PORT/api/config" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'  {len(d[\"themes\"])} temas')
" 2>/dev/null
}

case "$ACTION" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *)       echo "Uso: $0 {start|stop|restart|status}"; exit 2 ;;
esac