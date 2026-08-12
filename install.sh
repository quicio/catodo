#!/usr/bin/env bash
# Cátodo install script — detección de SO, verificación/instalación de
# dependencias del sistema, backend venv + frontend build + Electron AppImage
# + sistema de service systemd con rutas resueltas.
#
# Uso:
#   bash install.sh              # instala todo (pide sudo si faltan deps del sistema)
#   bash install.sh --check      # solo valida requisitos, no modifica el sistema
#   bash install.sh --yes        # instala deps del sistema sin confirmar
#   bash install.sh --autostart  # habilita arranque automático al login
set -euo pipefail

# ---------------------------------------------------------------------------
# Rutas resueltas desde la ubicación real del script (portable, sin asumir
# ~/projects/catodo ni ~/.local/bin/uv).
# ---------------------------------------------------------------------------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SERVICE_TEMPLATE="$BACKEND_DIR/systemd/catodo.service.in"
SERVICE_DST="$HOME/.config/systemd/user/catodo.service"
DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"

UV_BIN="$(command -v uv || true)"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
PYTHON_BIN="$(command -v python3 || true)"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
CHECK_ONLY=0
ASSUME_YES=0
AUTOSTART=0
INSTALL_CASTLAB=0
for arg in "$@"; do
    case "$arg" in
        --check) CHECK_ONLY=1 ;;
        --yes|-y) ASSUME_YES=1 ;;
        --autostart) AUTOSTART=1 ;;
        --castlab) INSTALL_CASTLAB=1 ;;
        --help|-h)
            echo "Uso: bash install.sh [--check] [--yes] [--autostart] [--castlab]"
            echo "  --check      solo valida requisitos (sin modificar el sistema)"
            echo "  --yes        instala dependencias del sistema sin confirmar"
            echo "  --autostart  habilita el arranque automático al iniciar sesión"
            echo "  --castlab    instala Electron castLabs (Widevine) para canales DRM"
            exit 0
            ;;
        *) echo "Opción desconocida: $arg (usa --help)" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Detección de SO y gestor de paquetes
# ---------------------------------------------------------------------------
distro_id=""
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    distro_id="${ID_LIKE:-$ID}"
fi
distro_id="$(echo "$distro_id" | tr 'A-Z' 'a-z')"

PM=""
PM_INSTALL=""
PM_UPDATE=""
case "$distro_id" in
    *arch*|*manjaro*)
        PM="pacman"; PM_INSTALL="sudo pacman -S --noconfirm"; PM_UPDATE="sudo pacman -Sy" ;;
    *debian*|*ubuntu*)
        PM="apt"; PM_INSTALL="sudo apt-get install -y"; PM_UPDATE="sudo apt-get update" ;;
    *fedora*|*rhel*|*centos*)
        PM="dnf"; PM_INSTALL="sudo dnf install -y"; PM_UPDATE="sudo dnf makecache" ;;
    *suse*)
        PM="zypper"; PM_INSTALL="sudo zypper install -y"; PM_UPDATE="sudo zypper refresh" ;;
esac

# ---------------------------------------------------------------------------
# Mapa de paquetes del sistema por gestor. Se verifica con `command -v` y,
# para instalar, se traduce el binario al nombre de paquete de la distro.
# ---------------------------------------------------------------------------
pkg_name() {
    # pkg_name <bin> — devuelve el nombre de paquete para el gestor detectado
    local bin="$1"
    case "$bin" in
        python3)
            case "$PM" in
                pacman) echo "python" ;;
                apt) echo "python3" ;;
                dnf|zypper) echo "python3" ;;
            esac ;;
        uv)
            case "$PM" in
                pacman) echo "uv" ;;
                apt) echo "uv" ;;
                dnf) echo "uv" ;;
                zypper) echo "python3-uv" ;;
            esac ;;
        node) case "$PM" in pacman) echo "nodejs";; apt) echo "nodejs";; dnf) echo "nodejs";; zypper) echo "nodejs";; esac ;;
        npm) case "$PM" in pacman) echo "npm";; apt) echo "npm";; dnf) echo "npm";; zypper) echo "npm";; esac ;;
        openssl) echo "openssl" ;;
        ip) echo "iproute2" ;;
        xdotool) echo "xdotool" ;;
        ydotool) echo "ydotool" ;;
        wpctl) echo "pipewire" ;;
        pactl) echo "pulseaudio" ;;
        gobject-introspection)
            case "$PM" in
                pacman) echo "gobject-introspection" ;;
                apt) echo "gir1.2-glib-2.0" ;;
                dnf) echo "gobject-introspection" ;;
                zypper) echo "gobject-introspection" ;;
            esac ;;
        pygobject)
            case "$PM" in
                pacman) echo "python-gobject" ;;
                apt) echo "python3-gi" ;;
                dnf) echo "python3-gobject" ;;
                zypper) echo "python3-gobject" ;;
            esac ;;
    esac
}

# Dependencias a validar/instalar: <bin> [<bin alternativo>...]
# - python3 es obligatorio (backend).
# - uv se auto-instala si falta (opción 1); también puede instalarse por gestor.
# - node/npm obligatorios para build del frontend.
# - gobject-introspection + pygobject: MPRIS de Spotify (control remoto).
# - openssl: certificados SSL (/cast). ip: detección de IP para el cert.
# - xdotool/ydotool: control de mouse/teclado (X11 / Wayland).
# - wpctl/pactl: control de volumen (PipeWire / PulseAudio).
MISSING=()
CHECK_DEPENDENCIES=(
    "python3"
    "uv"
    "node"
    "npm"
    "openssl"
    "ip"
    "xdotool|ydotool"
    "wpctl|pactl"
)

check_deps() {
    MISSING=()
    for entry in "${CHECK_DEPENDENCIES[@]}"; do
        IFS='|' read -ra alts <<< "$entry"
        found=""
        for bin in "${alts[@]}"; do
            if command -v "$bin" >/dev/null 2>&1; then
                found="$bin"
                break
            fi
        done
        if [ -n "$found" ]; then
            printf "  %-22s OK (%s)\n" "${alts[0]}" "$found"
        else
            printf "  %-22s FALTA\n" "${alts[0]}"
            MISSING+=("${alts[0]}")
        fi
    done
    # Chequeos de versión / feature
    if [ -n "$PYTHON_BIN" ]; then
        pyver="$("$PYTHON_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "0")"
        if [ "$(echo "$pyver" | cut -d. -f1)" -lt 3 ] || { [ "$(echo "$pyver" | cut -d. -f1)" -eq 3 ] && [ "$(echo "$pyver" | cut -d. -f2)" -lt 12 ]; }; then
            printf "  %-22s FALTA (se necesita Python >= 3.12, se tiene %s)\n" "python3-version" "$pyver"
            MISSING+=("python3-version")
        else
            printf "  %-22s OK (Python %s)\n" "python3-version" "$pyver"
        fi
    fi
}

report_missing() {
    echo
    echo "==> Dependencias del sistema faltantes:"
    for m in "${MISSING[@]}"; do
        pkg="$(pkg_name "$m")"
        if [ -n "$pkg" ]; then
            echo "    - $m → instalar con: $PM_INSTALL $pkg"
        else
            echo "    - $m (sin paquete mapeado para $PM)"
        fi
    done
}

install_missing() {
    if [ "${#MISSING[@]}" -eq 0 ]; then
        return 0
    fi
    echo
    echo "==> Instalando dependencias del sistema faltantes con $PM"
    if [ "$ASSUME_YES" -ne 1 ]; then
        echo "Se ejecutará: $PM_UPDATE y $PM_INSTALL (pide sudo)."
        read -r -p "¿Continuar? [y/N] " confirm
        case "$confirm" in
            y|Y|s|S) ;;
            *) echo "Cancelado."; exit 1 ;;
        esac
    fi
    # uv se auto-instala (curl install.sh de astral) porque es el gestor oficial.
    local need_uv=0
    local pkgs=()
    for m in "${MISSING[@]}"; do
        if [ "$m" = "uv" ]; then
            need_uv=1
            continue
        fi
        local pkg
        pkg="$(pkg_name "$m")"
        [ -n "$pkg" ] && pkgs+=("$pkg")
    done
    if [ "${#pkgs[@]}" -gt 0 ]; then
        $PM_UPDATE >/dev/null 2>&1 || true
        $PM_INSTALL "${pkgs[@]}"
    fi
    if [ "$need_uv" -eq 1 ] && ! command -v uv >/dev/null 2>&1; then
        echo "==> Instalando uv (Astral)"
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
    # Re-detectar bins tras instalar
    UV_BIN="$(command -v uv || true)"
    NODE_BIN="$(command -v node || true)"
    NPM_BIN="$(command -v npm || true)"
    PYTHON_BIN="$(command -v python3 || true)"
}

# ---------------------------------------------------------------------------
# Validación de requisitos (mode --check o pre-instalación)
# ---------------------------------------------------------------------------
echo "==> Detectando sistema: distro='${distro_id:-desconocida}' gestor='${PM:-ninguno}'"
if [ -z "$PM" ]; then
    echo
    echo "==> No se reconoció el gestor de paquetes de la distro." >&2
    echo "    Instalá manualmente: python3, uv, nodejs, npm, openssl, iproute2," >&2
    echo "    xdotool o ydotool, pipewire o pulseaudio, y pygobject (python-gobject)." >&2
    if [ "$CHECK_ONLY" -eq 1 ]; then exit 1; fi
fi

echo "==> Verificando dependencias del sistema"
check_deps

if [ "$CHECK_ONLY" -eq 1 ]; then
    if [ "${#MISSING[@]}" -eq 0 ]; then
        echo
        echo "==> Todo en orden. Se puede instalar con: bash install.sh"
        exit 0
    fi
    report_missing
    exit 1
fi

if [ "${#MISSING[@]}" -gt 0 ]; then
    install_missing
    check_deps
    if [ "${#MISSING[@]}" -gt 0 ]; then
        report_missing
        echo "==> No se pudieron resolver todas las dependencias. Abortando." >&2
        exit 1
    fi
fi

if [ -z "$UV_BIN" ] || [ -z "$NODE_BIN" ] || [ -z "$PYTHON_BIN" ]; then
    echo "==> Faltan herramientas esenciales (uv/node/python3). Revisá lo anterior." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Instalación
# ---------------------------------------------------------------------------
echo "==> Instalando Cátodo backend (uv sync)"
(cd "$BACKEND_DIR" && "$UV_BIN" sync)

echo "==> Building frontend"
(cd "$FRONTEND_DIR" && "$NPM_BIN" ci && "$NPM_BIN" run build)

echo "==> Copiando frontend a backend/static (preservando remote/ y cast/)"
for d in remote cast; do
    if [ -d "$BACKEND_DIR/static/$d" ]; then
        cp -r "$BACKEND_DIR/static/$d" "/tmp/catodo-$d-backup"
    fi
done
rm -rf "$BACKEND_DIR/static"
mkdir -p "$BACKEND_DIR/static"
cp -r "$FRONTEND_DIR/dist/"* "$BACKEND_DIR/static/"
for d in remote cast; do
    if [ -d "/tmp/catodo-$d-backup" ]; then
        cp -r "/tmp/catodo-$d-backup" "$BACKEND_DIR/static/$d"
        rm -rf "/tmp/catodo-$d-backup"
    fi
done

echo "==> Building Electron AppImage"
(cd "$FRONTEND_DIR" && "$NPM_BIN" run electron:build:linux)

if [ "$INSTALL_CASTLAB" -eq 1 ]; then
    echo "==> Instalando Electron castLabs (Widevine)"
    bash "$PROJECT_DIR/scripts/install_castlab.sh"
fi

APPIMAGE=$(find "$FRONTEND_DIR/release" -maxdepth 1 -name "*.AppImage" | head -n 1 || true)
if [ -n "$APPIMAGE" ]; then
    chmod +x "$APPIMAGE"
    echo "==> AppImage built: $APPIMAGE"
fi

echo "==> Provisioning plugin venv (dependencias de plugins)"
mkdir -p "$DATA_DIR"
if command -v uv >/dev/null 2>&1; then
    uv venv "$DATA_DIR/plugin-venv" >/dev/null 2>&1 || true
fi

if [ "${CATODO_SSL:-0}" = "1" ]; then
    echo "==> Generando certificado SSL (necesario para /cast y compartir pantalla)"
    bash "$PROJECT_DIR/scripts/make_cert.sh"
fi

echo "==> Installing systemd user service"
mkdir -p "$(dirname "$SERVICE_DST")"
sed -e "s|@PROJECT_DIR@|$PROJECT_DIR|g" -e "s|@UV_BIN@|$UV_BIN|g" \
    "$SERVICE_TEMPLATE" > "$SERVICE_DST"
systemctl --user daemon-reload
if [ "$AUTOSTART" -eq 1 ]; then
    systemctl --user enable --now catodo.service
else
    systemctl --user enable catodo.service
    systemctl --user start catodo.service
fi

echo "==> Done. Status:"
systemctl --user --no-pager status catodo.service || true
