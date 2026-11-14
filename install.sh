#!/usr/bin/env bash
# Cátodo install script — detección de SO, verificación/instalación de
# dependencias del sistema, backend Rust + frontend build + Electron AppImage
# + sistema de service systemd con rutas resueltas.
#
# Uso:
#   bash install.sh              # instala todo (pide sudo si faltan deps del sistema)
#   bash install.sh --check      # solo valida requisitos, no modifica el sistema
#   bash install.sh --yes        # instala deps del sistema sin confirmar
#   bash install.sh --autostart  # habilita arranque automático al login
#   bash install.sh --no-cloudflared  # no descarga cloudflared (módulo tunnel)
set -euo pipefail

# ---------------------------------------------------------------------------
# Rutas resueltas desde la ubicación real del script (portable, sin asumir
# ~/projects/catodo).
# ---------------------------------------------------------------------------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SERVICE_TEMPLATE="$BACKEND_DIR/systemd/catodo.service.in"
SERVICE_DST="$HOME/.config/systemd/user/catodo.service"
DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"

NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
CHECK_ONLY=0
ASSUME_YES=0
AUTOSTART=0
INSTALL_CLOUDFLARED=1
for arg in "$@"; do
    case "$arg" in
        --check) CHECK_ONLY=1 ;;
        --yes|-y) ASSUME_YES=1 ;;
        --autostart) AUTOSTART=1 ;;
        --no-cloudflared) INSTALL_CLOUDFLARED=0 ;;
        --cloudflared) INSTALL_CLOUDFLARED=1 ;;
        --help|-h)
            echo "Uso: bash install.sh [--check] [--yes] [--autostart] [--no-cloudflared]"
            echo "  --check            solo valida requisitos (sin modificar el sistema)"
            echo "  --yes              instala dependencias del sistema sin confirmar"
            echo "  --autostart        habilita el arranque automático al iniciar sesión"
            echo "  --no-cloudflared   no descarga el binario cloudflared (módulo tunnel)"
            echo "  --cloudflared      (default) descarga cloudflared a ~/.local/share/catodo/bin/"
            exit 0
            ;;
        *) echo "Opción desconocida: $arg (usa --help)" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Detección de SO y gestor de paquetes
# ---------------------------------------------------------------------------
distro_id=""
IS_MACOS=0
if [ "$(uname -s)" = "Darwin" ]; then
    IS_MACOS=1
    distro_id="macos"
elif [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    distro_id="${ID_LIKE:-$ID}"
fi
distro_id="$(echo "$distro_id" | tr 'A-Z' 'a-z')"

PM=""
PM_INSTALL=""
PM_UPDATE=""
if [ "$IS_MACOS" -eq 0 ]; then
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
fi

# ---------------------------------------------------------------------------
# Mapa de paquetes del sistema por gestor. Se verifica con `command -v` y,
# para instalar, se traduce el binario al nombre de paquete de la distro.
# ---------------------------------------------------------------------------
pkg_name() {
    # pkg_name <bin> — devuelve el nombre de paquete para el gestor detectado
    local bin="$1"
    if [ "$IS_MACOS" -eq 1 ]; then
        case "$bin" in
            cargo) echo "rust" ;;
            node) echo "node" ;;
            npm) echo "node" ;;            # viene con node
            openssl) echo "openssl" ;;     # preinstalado en macOS, no requiere brew
            brew) echo "brew" ;;           # el propio brew, no es instalable desde aquí
            cliclick) echo "cliclick" ;;
        esac
        return
    fi
    case "$bin" in
        cargo)
            case "$PM" in
                pacman) echo "rust" ;;
                apt) echo "cargo" ;;
                dnf) echo "cargo" ;;
                zypper) echo "cargo" ;;
            esac ;;
        node) case "$PM" in pacman) echo "nodejs";; apt) echo "nodejs";; dnf) echo "nodejs";; zypper) echo "nodejs";; esac ;;
        npm) case "$PM" in pacman) echo "npm";; apt) echo "npm";; dnf) echo "npm";; zypper) echo "npm";; esac ;;
        openssl) echo "openssl" ;;
        ip) echo "iproute2" ;;
        xdotool) echo "xdotool" ;;
        ydotool) echo "ydotool" ;;
        wpctl) echo "pipewire" ;;
        pactl) echo "pulseaudio" ;;
    esac
}

# Dependencias a validar/instalar: <bin> [<bin alternativo>...]
# - cargo: compila el backend Rust.
# - node/npm obligatorios para build del frontend.
# - openssl: certificados SSL (/cast). ip: detección de IP para el cert.
# - xdotool/ydotool: control de mouse/teclado (X11 / Wayland).
# - wpctl/pactl: control de volumen (PipeWire / PulseAudio).
MISSING=()
OPTIONAL_DEPENDENCIES=()
CHECK_DEPENDENCIES=(
    "cargo"
    "node"
    "npm"
    "openssl"
    "ip"
    "xdotool|ydotool"
    "wpctl|pactl"
)
# En macOS los equivalentes son cliclick + osascript (sin xdotool/ydotool ni
# wpctl/pactl) — el chequeo de binarios se ajusta más abajo si IS_MACOS.
if [ "$IS_MACOS" -eq 1 ]; then
    CHECK_DEPENDENCIES=(
        "cargo"
        "node"
        "npm"
        "brew"
        "cliclick"   # opcional: si falta, el remote trackpad usa osascript
    )
    OPTIONAL_DEPENDENCIES=("cliclick")
fi

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
            optional=0
            for opt in "${OPTIONAL_DEPENDENCIES[@]}"; do
                [ "$opt" = "${alts[0]}" ] && optional=1
            done
            if [ "$optional" -eq 1 ]; then
                printf "  %-22s OPCIONAL (falta)\n" "${alts[0]}"
            else
                printf "  %-22s FALTA\n" "${alts[0]}"
                MISSING+=("${alts[0]}")
            fi
        fi
    done
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
    if [ "$IS_MACOS" -eq 1 ]; then
        echo "==> Dependencias faltantes para macOS"
        if [ "$ASSUME_YES" -ne 1 ]; then
            echo "Se ejecutará: brew install (sin sudo)."
            read -r -p "¿Continuar? [y/N] " confirm
            case "$confirm" in
                y|Y|s|S) ;;
                *) echo "Cancelado."; exit 1 ;;
            esac
        fi
        local pkgs=()
        for m in "${MISSING[@]}"; do
            local pkg
            pkg="$(pkg_name "$m")"
            [ -n "$pkg" ] && pkgs+=("$pkg")
        done
        if [ "${#pkgs[@]}" -gt 0 ]; then
            brew install "${pkgs[@]}"
        fi
    else
        echo "==> Instalando dependencias del sistema faltantes con $PM"
        if [ "$ASSUME_YES" -ne 1 ]; then
            echo "Se ejecutará: $PM_UPDATE y $PM_INSTALL (pide sudo)."
            read -r -p "¿Continuar? [y/N] " confirm
            case "$confirm" in
                y|Y|s|S) ;;
                *) echo "Cancelado."; exit 1 ;;
            esac
        fi
        local pkgs=()
        for m in "${MISSING[@]}"; do
            local pkg
            pkg="$(pkg_name "$m")"
            [ -n "$pkg" ] && pkgs+=("$pkg")
        done
        if [ "${#pkgs[@]}" -gt 0 ]; then
            $PM_UPDATE >/dev/null 2>&1 || true
            $PM_INSTALL "${pkgs[@]}"
        fi
    fi
    # Re-detectar bins tras instalar
    NODE_BIN="$(command -v node || true)"
    NPM_BIN="$(command -v npm || true)"
}

# ---------------------------------------------------------------------------
# Validación de requisitos (mode --check o pre-instalación)
# ---------------------------------------------------------------------------
echo "==> Detectando sistema: distro='${distro_id:-desconocida}' gestor='${PM:-brew/ninguno}'"
if [ -z "$PM" ] && [ "$IS_MACOS" -eq 0 ]; then
    echo
    echo "==> No se reconoció el gestor de paquetes de la distro." >&2
    echo "    Instalá manualmente: cargo (Rust), nodejs, npm, openssl, iproute2," >&2
    echo "    xdotool o ydotool, y pipewire o pulseaudio." >&2
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

if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
    echo "==> Faltan herramientas esenciales (node/npm). Revisá lo anterior." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Instalación
# ---------------------------------------------------------------------------
echo "==> Compilando backend Rust"
(cd "$PROJECT_DIR/rust" && cargo build --release -p catodo-server)
BACKEND_BIN="$PROJECT_DIR/rust/target/release/catodo-server"

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

if [ "$INSTALL_CLOUDFLARED" -eq 1 ]; then
    echo "==> Instalando cloudflared (módulo tunnel)"
    bash "$PROJECT_DIR/scripts/install_cloudflared.sh"
fi

APPIMAGE=$(find "$FRONTEND_DIR/release" -maxdepth 1 -name "*.AppImage" | head -n 1 || true)
if [ -n "$APPIMAGE" ]; then
    chmod +x "$APPIMAGE"
    echo "==> AppImage built: $APPIMAGE"
fi

mkdir -p "$DATA_DIR"

if [ "${CATODO_SSL:-0}" = "1" ]; then
    echo "==> Generando certificado SSL (necesario para /cast y compartir pantalla)"
    bash "$PROJECT_DIR/scripts/make_cert.sh"
fi

if [ "$IS_MACOS" -eq 1 ]; then
    echo
    echo "==> macOS autostart (no automatico)"
    echo "    El unit de systemd no aplica. Para que el backend arranque al login:"
    echo "      1. Abre System Settings → General → Login Items → Open at Login."
    echo "      2. Agregá un '+' y elegí un shell script que ejecute:"
    echo "           bash $PROJECT_DIR/run-prod.sh start"
    echo "      3. (Alternativa) Creá un .app con Automator que corra el script."
    echo
    echo "==> Done. Para arrancar manualmente: bash run-prod.sh start"
else
    echo "==> Installing systemd user service"
    mkdir -p "$(dirname "$SERVICE_DST")"
    PROD_PORT="${CATODO_PROD_PORT:-8767}"
    sed -e "s|@PROJECT_DIR@|$PROJECT_DIR|g" -e "s|@BACKEND_BIN@|$BACKEND_BIN|g" -e "s|@PROD_PORT@|$PROD_PORT|g" \
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
fi
