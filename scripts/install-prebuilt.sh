#!/usr/bin/env bash
# Cátodo — instalador binario para Linux (no compila nada).
#
#   curl -fsSL https://quicio.github.io/catodo/install.sh | bash
#
# Baja el paquete de la última release (o de --version), verifica SHA256SUMS y
# lo instala con el gestor de la distro detectada. No necesita Rust ni Node:
# el backend Rust viaja como sidecar dentro de la app, así que tampoco crea un
# servicio systemd. Uso:
#
#   bash install-prebuilt.sh                  # última release, paquete del sistema
#   bash install-prebuilt.sh --version v0.14.0
#   bash install-prebuilt.sh --user           # AppImage en ~/.local, sin sudo
#   bash install-prebuilt.sh --prefix /opt/x  # prefijo del modo --user
#   bash install-prebuilt.sh --check          # sólo reporta (no descarga)
#   bash install-prebuilt.sh --dry-run        # muestra el plan (no descarga)
#   bash install-prebuilt.sh --uninstall
#
# También se llega acá con `bash install.sh --prebuilt`.
set -euo pipefail

REPO="quicio/catodo"
RAW="https://raw.githubusercontent.com/$REPO"
RELEASES="https://github.com/$REPO/releases"

TAG=""
MODE="auto"          # auto | user
ASSET="auto"         # auto | appimage | deb | rpm | arch
PREFIX="${HOME}/.local"
CHECK_ONLY=0
DRY_RUN=0
UNINSTALL=0
NO_SUDO=0

# El helper se sourcea desde el repo y viaja inlineado en la copia publicada
# (site/install.sh se arma concatenando _desktop.sh + este archivo).
if ! command -v catodo_install_appimage >/dev/null 2>&1; then
    SELF_PATH="${BASH_SOURCE[0]:-}"
    if [ -n "$SELF_PATH" ] && [ -f "$SELF_PATH" ]; then
        SELF_DIR="$(cd "$(dirname "$SELF_PATH")" && pwd)"
        # shellcheck source=scripts/_desktop.sh
        . "$SELF_DIR/_desktop.sh"
    else
        echo "error: instalador incompleto (falta scripts/_desktop.sh)" >&2
        exit 1
    fi
fi

say()  { printf '==> %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<'EOF'
Uso: install.sh [opciones]

  --version <tag>      versión a instalar (ej. v0.14.0). Default: última release
  --user               instala la AppImage en el prefijo del usuario, sin sudo
  --prefix <dir>       prefijo para --user (default: ~/.local)
  --asset <tipo>       fuerza el paquete: appimage | deb | rpm | arch
  --check              reporta el entorno y el asset elegido, sin descargar
  --dry-run            igual que --check pero además muestra los comandos
  --uninstall          desinstala Cátodo
  --no-sudo            nunca usar sudo; cae a instalación de usuario
  -h, --help           esta ayuda

Ejemplos:
  curl -fsSL https://quicio.github.io/catodo/install.sh | bash
  curl -fsSL https://quicio.github.io/catodo/install.sh | bash -s -- --user
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --version) TAG="${2:-}"; [ -n "$TAG" ] || die "--version necesita un tag"; shift 2 ;;
        --version=*) TAG="${1#*=}"; shift ;;
        --user) MODE="user"; shift ;;
        --prefix) PREFIX="${2:-}"; [ -n "$PREFIX" ] || die "--prefix necesita un directorio"; shift 2 ;;
        --prefix=*) PREFIX="${1#*=}"; shift ;;
        --asset) ASSET="${2:-}"; [ -n "$ASSET" ] || die "--asset necesita un valor"; shift 2 ;;
        --asset=*) ASSET="${1#*=}"; shift ;;
        --check) CHECK_ONLY=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        --no-sudo) NO_SUDO=1; shift ;;
        --yes|-y) shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "opción desconocida: $1 (usá --help)" ;;
    esac
done

case "$ASSET" in
    auto|appimage|deb|rpm|arch) ;;
    *) die "--asset inválido: $ASSET (appimage|deb|rpm|arch)" ;;
esac

# ---------------------------------------------------------------------------
# Entorno: sólo Linux x86_64 (los releases no publican arm64 todavía).
# ---------------------------------------------------------------------------
[ "$(uname -s)" = "Linux" ] || die "este instalador es para Linux (en macOS: brew install --cask quicio/tap/catodo)"
case "$(uname -m)" in
    x86_64|amd64) ;;
    *) die "no hay paquetes para $(uname -m); sólo Linux x86_64 (o usá el tarball de fuente)" ;;
esac

PM=""
DISTRO=""
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO="${ID_LIKE:-${ID:-desconocida}}"
    DISTRO="$(printf '%s' "$DISTRO" | tr 'A-Z' 'a-z')"
fi

if command -v pacman >/dev/null 2>&1; then
    PM="pacman"
elif command -v apt-get >/dev/null 2>&1; then
    PM="apt"
elif command -v dnf >/dev/null 2>&1; then
    PM="dnf"
elif command -v zypper >/dev/null 2>&1; then
    PM="zypper"
fi

# ---------------------------------------------------------------------------
# Resolución de la release y del asset
# ---------------------------------------------------------------------------
resolve_tag() {
    local url tag
    # 1) Redirección de /releases/latest: sin API, sin rate limit.
    url="$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$RELEASES/latest" 2>/dev/null || true)"
    case "$url" in
        */releases/tag/v*) tag="${url##*/}"; printf '%s' "$tag"; return 0 ;;
    esac
    # 2) Fallback a la API.
    tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    case "$tag" in
        v*) printf '%s' "$tag" ;;
        *) return 1 ;;
    esac
}

asset_for() {
    local kind="$1" v="$2"
    case "$kind" in
        pacman|arch)    printf 'catodo-%s-1-x86_64.pkg.tar.zst' "$v" ;;
        apt|deb)        printf 'Catodo-%s-linux-amd64.deb' "$v" ;;
        dnf|rpm|zypper) printf 'catodo-%s-1.x86_64.rpm' "$v" ;;
        *)              printf 'Catodo-%s-linux-x86_64.AppImage' "$v" ;;
    esac
}

if [ -z "$TAG" ]; then
    TAG="$(resolve_tag)" || die "no pude resolver la última release (¿sin red?); probá --version vX.Y.Z"
fi
case "$TAG" in
    v*) ;;
    *) TAG="v$TAG" ;;
esac
VERSION="${TAG#v}"

if [ "$MODE" = "user" ]; then
    [ "$ASSET" = "auto" ] || warn "--asset se ignora con --user (siempre AppImage)"
    ASSET="appimage"
elif [ "$ASSET" = "auto" ]; then
    case "$PM" in
        pacman)     ASSET="arch" ;;
        apt)        ASSET="deb" ;;
        dnf|zypper) ASSET="rpm" ;;
        *)          ASSET="appimage" ;;
    esac
elif [ -z "$PM" ]; then
    warn "distro sin gestor reconocido; instalo la AppImage en $PREFIX"
    ASSET="appimage"
fi

# Un .deb no se instala con pacman ni un .rpm con apt: si se forzó un formato,
# exigimos el gestor correspondiente en lugar de fallar a mitad de la descarga.
case "$ASSET" in
    deb)  [ "$PM" = "apt" ] || die "--asset deb necesita apt (esta distro usa ${PM:-ninguno}); probá --asset appimage" ;;
    rpm)  case "$PM" in dnf|zypper) ;; *) die "--asset rpm necesita dnf/zypper (esta distro usa ${PM:-ninguno}); probá --asset appimage" ;; esac ;;
    arch) [ "$PM" = "pacman" ] || die "--asset arch necesita pacman (esta distro usa ${PM:-ninguno}); probá --asset appimage" ;;
esac

ASSET_NAME="$(asset_for "$ASSET" "$VERSION")"
ASSET_URL="$RELEASES/download/$TAG/$ASSET_NAME"
SUMS_URL="$RELEASES/download/$TAG/SHA256SUMS.txt"

# ---------------------------------------------------------------------------
# Helpers de sistema
# ---------------------------------------------------------------------------
run_root() {
    if [ "$EUID" -eq 0 ]; then
        "$@"
        return $?
    fi
    [ "$NO_SUDO" -eq 1 ] && return 127
    command -v sudo >/dev/null 2>&1 || return 127
    if [ -c /dev/tty ]; then
        sudo "$@"
    else
        sudo -n "$@"
    fi
}

installed_version() {
    if command -v pacman >/dev/null 2>&1 && pacman -Q catodo >/dev/null 2>&1; then
        pacman -Q catodo | awk '{print $2}'
    elif command -v dpkg-query >/dev/null 2>&1; then
        local status
        status="$(dpkg-query -W -f='${Status}' catodo 2>/dev/null || true)"
        case "$status" in
            *"install ok installed"*) dpkg-query -W -f='${Version}' catodo 2>/dev/null ;;
        esac
    elif command -v rpm >/dev/null 2>&1 && rpm -q catodo >/dev/null 2>&1; then
        rpm -q --qf '%{VERSION}' catodo 2>/dev/null
    fi
}

# ---------------------------------------------------------------------------
# --check / --dry-run
# ---------------------------------------------------------------------------
report() {
    local current
    current="$(installed_version || true)"
    printf '  %-18s %s\n' "sistema" "$(uname -s) $(uname -m)"
    printf '  %-18s %s\n' "distro" "${DISTRO:-desconocida}"
    printf '  %-18s %s\n' "gestor" "${PM:-ninguno (AppImage de usuario)}"
    printf '  %-18s %s\n' "versión" "$TAG"
    printf '  %-18s %s\n' "asset" "$ASSET_NAME"
    printf '  %-18s %s\n' "fuse (AppImage)" "$(catodo_fuse_ok && echo OK || echo "FALTA ($(catodo_fuse_hint "$PM"))")"
    printf '  %-18s %s\n' "instalado" "${current:-no}"
    if [ -d "$PREFIX/opt/catodo" ]; then
        printf '  %-18s %s\n' "copia usuario" "$PREFIX/opt/catodo"
    fi
    printf '  %-18s %s\n' "url" "$ASSET_URL"
}

if [ "$CHECK_ONLY" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then
    say "Cátodo $TAG — preflight"
    report
    if [ "$DRY_RUN" -eq 1 ]; then
        echo
        say "Plan"
        if [ "$ASSET" = "appimage" ]; then
            echo "    descargar  $ASSET_URL"
            echo "    verificar  SHA256SUMS.txt"
            echo "    instalar   $PREFIX/opt/catodo/Catodo.AppImage"
            echo "               $PREFIX/bin/catodo (symlink)"
            echo "               $PREFIX/share/applications/catodo.desktop"
        else
            case "$PM" in
                pacman) echo "    sudo pacman -U <archivo>" ;;
                apt)    echo "    sudo apt-get install -y <archivo>" ;;
                dnf)    echo "    sudo dnf install -y <archivo>" ;;
                zypper) echo "    sudo zypper --no-gpg-checks install <archivo>" ;;
                *)      echo "    AppImage en $PREFIX/opt/catodo" ;;
            esac
        fi
    fi
    exit 0
fi

# ---------------------------------------------------------------------------
# Desinstalación
# ---------------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
    say "Desinstalando Cátodo"
    removed=0
    if [ -n "$(installed_version || true)" ]; then
        case "$PM" in
            pacman) run_root pacman -Rns --noconfirm catodo && removed=1 ;;
            apt)    run_root apt-get remove -y catodo && removed=1 ;;
            dnf)    run_root dnf remove -y catodo && removed=1 ;;
            zypper) run_root zypper --non-interactive remove catodo && removed=1 ;;
        esac || true
    fi
    if catodo_uninstall_user "$PREFIX"; then
        removed=1
    fi
    if [ "$removed" -eq 0 ]; then
        say "No encontré una instalación de Cátodo"
    else
        say "Listo. Los datos de usuario quedan en ~/.local/share/catodo"
    fi
    exit 0
fi

# ---------------------------------------------------------------------------
# Descarga + verificación
# ---------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 || die "falta curl (instalalo con ${PM:-tu gestor} o usá el paquete de la release a mano)"
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 \
    || die "falta sha256sum/shasum para verificar la descarga"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/catodo-install.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

CURL=(curl -fL --retry 3 --connect-timeout 15)
[ -t 2 ] && CURL+=(--progress-bar)

verify_asset() {
    local name="$1"
    grep -F " $name" "$WORK/SHA256SUMS.txt" > "$WORK/expected.sha256" || true
    [ -s "$WORK/expected.sha256" ] || die "SHA256SUMS.txt no lista $name"
    if command -v sha256sum >/dev/null 2>&1; then
        ( cd "$WORK" && sha256sum -c expected.sha256 >/dev/null ) || die "checksum no coincide: descarga corrupta"
    else
        ( cd "$WORK" && shasum -a 256 -c expected.sha256 >/dev/null ) || die "checksum no coincide: descarga corrupta"
    fi
}

fetch_asset() {
    local name="$1"
    "${CURL[@]}" -o "$WORK/$name" "$RELEASES/download/$TAG/$name" || die "falló la descarga de $name"
    verify_asset "$name"
}

say "Descargando Cátodo $TAG ($ASSET_NAME)"
"${CURL[@]}" -sS -o "$WORK/SHA256SUMS.txt" "$SUMS_URL" || die "falló la descarga de SHA256SUMS.txt"
fetch_asset "$ASSET_NAME"
say "Checksum OK"

# Icono para el menú (si el tag no lo tiene, se extrae de la AppImage).
ICON=""
if curl -fsSL -o "$WORK/catodo.png" "$RAW/$TAG/catodo.png" 2>/dev/null; then
    ICON="$WORK/catodo.png"
fi

# ---------------------------------------------------------------------------
# Instalación
# ---------------------------------------------------------------------------
if [ "$ASSET" = "appimage" ]; then
    if [ -n "$(installed_version || true)" ]; then
        warn "hay un paquete de Cátodo instalado; desinstalalo para no tener dos entradas en el menú"
    fi
    catodo_install_appimage "$WORK/$ASSET_NAME" "$PREFIX" "$ICON"
else
    say "Instalando con $PM (pide sudo si hace falta)"
    rc=0
    case "$PM" in
        pacman) set +e; run_root pacman -U --noconfirm "$WORK/$ASSET_NAME"; rc=$?; set -e ;;
        apt)    set +e; run_root apt-get install -y "$WORK/$ASSET_NAME"; rc=$?; set -e ;;
        dnf)    set +e; run_root dnf install -y "$WORK/$ASSET_NAME"; rc=$?; set -e ;;
        zypper) set +e; run_root zypper --non-interactive --no-gpg-checks install "$WORK/$ASSET_NAME"; rc=$?; set -e ;;
        *)      rc=127 ;;
    esac
    if [ "$rc" -eq 127 ]; then
        warn "sin sudo disponible; instalo la AppImage en $PREFIX"
        APP_NAME="$(asset_for appimage "$VERSION")"
        fetch_asset "$APP_NAME"
        catodo_install_appimage "$WORK/$APP_NAME" "$PREFIX" "$ICON"
    elif [ "$rc" -ne 0 ]; then
        die "el gestor de paquetes falló (código $rc)"
    else
        # Si había una instalación de usuario previa, su entrada apuntaría a la
        # versión vieja: el paquete del sistema pasa a ser el único dueño.
        catodo_uninstall_user "$PREFIX" || true
    fi
fi

echo
say "Cátodo $TAG instalado. Abrí 'Cátodo' desde el menú o ejecutá: catodo"
echo "    El backend Rust corre como sidecar de la app; no hay servicio systemd que configurar."
echo "    Desinstalar: curl -fsSL https://quicio.github.io/catodo/install.sh | bash -s -- --uninstall"
