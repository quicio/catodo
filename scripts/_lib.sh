#!/usr/bin/env bash
# Cátodo — helpers portables para los launchers (run-dev.sh, run-prod.sh).
# Branch por OS en runtime con `uname -s`:
#   - Linux: ss + /proc/<pid>/stat + stat -c %Y
#   - macOS: lsof + ps -o lstart= + stat -f %m
#
# Las funciones se mantienen lo más fieles posible a las versiones inline que
# existían en run-dev.sh / run-prod.sh; cero cambios de comportamiento en
# Linux (regression-guard).
set -uo pipefail

# ---------------------------------------------------------------------------
# current_pid [PORT]
#   Devuelve el PID del proceso que escucha TCP en PORT (o $CATODO_PORT si
#   no se pasa argumento). Vacío si nadie escucha.
# ---------------------------------------------------------------------------
current_pid() {
    local port="${1:-${CATODO_PORT:-8767}}"
    if [ "$(uname -s)" = "Darwin" ]; then
        lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
    else
        ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1 || true
    fi
}

# ---------------------------------------------------------------------------
# backend_stale PID SRC_FILE
#   Devuelve 0 (true) si el proceso PID arrancó antes de la última
#   modificación de SRC_FILE. Esto es la heurística del backend-recycle:
#   si el código cambió mientras corría, hay que reiniciar.
# ---------------------------------------------------------------------------
backend_stale() {
    local pid="$1"
    local src="$2"
    [ -z "$pid" ] && return 0
    local src_mtime
    src_mtime=$(stat -c %Y "$src" 2>/dev/null || stat -f %m "$src" 2>/dev/null || echo 0)
    local start_epoch
    if [ "$(uname -s)" = "Darwin" ]; then
        # macOS: `ps -o lstart=` devuelve "Wed Aug 27 14:23:01 2025" → epoch.
        local lstart
        lstart=$(ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//' || true)
        if [ -z "$lstart" ]; then
            return 0  # no se pudo leer → asumir stale
        fi
        start_epoch=$(date -j -f "%a %b %d %T %Y" "$lstart" "+%s" 2>/dev/null || echo 0)
    else
        # Linux: /proc/<pid>/stat campo 22 = start time en clock ticks.
        local boot_jiffies pid_start_jiffies
        boot_jiffies=$(awk '/^btime/ {print $2}' /proc/stat 2>/dev/null || echo 0)
        pid_start_jiffies=$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || echo 0)
        [ "$pid_start_jiffies" -eq 0 ] && return 0
        start_epoch=$(( boot_jiffies + pid_start_jiffies / 100 ))
    fi
    [ -z "$start_epoch" ] && return 0
    [ "$start_epoch" -lt "$src_mtime" ]
}