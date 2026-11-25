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
# ensure_cargo
#   Garantiza que `cargo` esté en PATH. Los launchers pueden correr desde
#   shells que no cargaron rustup (fish abierto antes de instalarlo, launchers
#   gráficos, servicios). Si falta, sourcea ~/.cargo/env. Devuelve 1 con un
#   mensaje claro si no hay forma de encontrarlo.
# ---------------------------------------------------------------------------
ensure_cargo() {
    command -v cargo >/dev/null 2>&1 && return 0
    if [ -f "$HOME/.cargo/env" ]; then
        # shellcheck disable=SC1091
        . "$HOME/.cargo/env"
    fi
    command -v cargo >/dev/null 2>&1 && return 0
    echo "ERROR: no encontré 'cargo' en PATH. Instalá Rust con rustup (https://rustup.rs) o agregá \$HOME/.cargo/bin al PATH." >&2
    return 1
}

# ---------------------------------------------------------------------------
# ensure_node
#   Verifica que `node` esté disponible (Vite y Electron corren sobre Node,
#   incluso cuando se invocan los binarios de node_modules/.bin sin npm).
# ---------------------------------------------------------------------------
ensure_node() {
    command -v node >/dev/null 2>&1 && return 0
    echo "ERROR: no encontré 'node' en PATH. Instalá Node.js (en Arch: sudo pacman -S nodejs) o agregalo al PATH." >&2
    return 1
}

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
# ---------------------------------------------------------------------------
# port_in_use PORT
#   Devuelve 0 (true) si hay un proceso escuchando en PORT.
# ---------------------------------------------------------------------------
port_in_use() {
    [ -n "$(current_pid "$1")" ]
}

# ---------------------------------------------------------------------------
# free_port START END [EXCLUDE...]
#   Imprime el primer puerto libre en el rango, saltando los EXCLUDE.
#   Devuelve 1 si no encuentra ninguno.
# ---------------------------------------------------------------------------
free_port() {
    local start="$1"
    local end="$2"
    shift 2
    local port excluded skip
    for ((port = start; port <= end; port++)); do
        skip=0
        for excluded in "$@"; do
            if [ "$port" = "$excluded" ]; then
                skip=1
                break
            fi
        done
        [ "$skip" -eq 1 ] && continue
        if ! port_in_use "$port"; then
            echo "$port"
            return 0
        fi
    done
    return 1
}

# ---------------------------------------------------------------------------
# kill_tree PID [SIGNAL]
#   Mata el proceso y todos sus descendientes (default TERM). No toca otros
#   procesos del sistema: evita los pkill -f globales.
# ---------------------------------------------------------------------------
kill_tree() {
    local pid="$1"
    local signal="${2:-TERM}"
    [ -z "$pid" ] && return 0
    local children child
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        kill_tree "$child" "$signal"
    done
    kill -"$signal" "$pid" 2>/dev/null || true
}
