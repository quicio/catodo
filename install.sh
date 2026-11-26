#!/usr/bin/env bash
# Cátodo — instalador del último release. Auto-detecta sistema operativo:
#
#   Linux  → paquete del gestor (pacman/apt/dnf/zypper) o AppImage en ~/.local
#   macOS  → Homebrew (cask quicio/tap/catodo) o el .zip en /Applications
#
# Instalación rápida (copiar y pegar):
#
#   curl -fsSL https://quicio.github.io/catodo/install.sh | bash
#
# No compila nada ni necesita Rust/Node: el backend Rust viaja como sidecar
# dentro de la app. Otros usos:
#
#   bash install.sh                  # última release
#   bash install.sh --version v0.14.0
#   bash install.sh --user           # sin sudo (~/.local o ~/Applications)
#   bash install.sh --check          # reporta, sin descargar
#   bash install.sh --dry-run        # muestra el plan, sin descargar
#   bash install.sh --uninstall
#
# Los tres modos del proyecto:
#   ./run-dev.sh         desarrollo (Vite + Electron, HMR)
#   ./install-local.sh   compilado local (build + systemd + menú)
#   ./install.sh         este archivo: release precompilado (el de la web)
set -euo pipefail

REPO="quicio/catodo"
RAW="https://raw.githubusercontent.com/$REPO"
RELEASES="https://github.com/$REPO/releases"
SITE="https://quicio.github.io/catodo/install.sh"

TAG=""
TAG_EXPLICIT=0
MODE="auto"          # auto | user
ASSET="auto"         # auto | appimage | deb | rpm | arch | zip
PREFIX="${HOME}/.local"
CHECK_ONLY=0
DRY_RUN=0
UNINSTALL=0
NO_SUDO=0
NO_BREW=0

# El helper de menú viaja inlineado en la copia publicada (Pages concatena
# scripts/_desktop.sh + este archivo); desde el repo se sourcea.
if ! command -v catodo_install_appimage >/dev/null 2>&1; then
    SELF_PATH="${BASH_SOURCE[0]:-}"
    if [ -n "$SELF_PATH" ] && [ -f "$SELF_PATH" ]; then
        SELF_DIR="$(cd "$(dirname "$SELF_PATH")" && pwd)"
        for helper in "$SELF_DIR/scripts/_desktop.sh" "$SELF_DIR/_desktop.sh"; do
            if [ -f "$helper" ]; then
                # shellcheck source=scripts/_desktop.sh
                . "$helper"
                break
            fi
        done
    fi
fi

say()  { printf '==> %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "falta curl (instalalo con tu gestor de paquetes)"

usage() {
    cat <<EOF
Uso: install.sh [opciones]

  --version <tag>      versión a instalar (ej. v0.14.0). Default: última release
  --user               instala sin sudo: AppImage en ~/.local o .app en ~/Applications
  --prefix <dir>       prefijo del modo usuario en Linux (default: ~/.local)
  --asset <tipo>       fuerza el formato: appimage | deb | rpm | arch | zip
  --no-brew            macOS: no usa Homebrew, baja el .zip
  --check              reporta el entorno y el método elegido, sin descargar
  --dry-run            igual que --check pero además muestra los pasos
  --uninstall          desinstala Cátodo
  --no-sudo            nunca usar sudo; cae a instalación de usuario
  -h, --help           esta ayuda

Ejemplos:
  curl -fsSL $SITE | bash
  curl -fsSL $SITE | bash -s -- --version v0.14.0
  curl -fsSL $SITE | bash -s -- --user
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --version) TAG="${2:-}"; [ -n "$TAG" ] || die "--version necesita un tag"; TAG_EXPLICIT=1; shift 2 ;;
        --version=*) TAG="${1#*=}"; TAG_EXPLICIT=1; shift ;;
        --user) MODE="user"; shift ;;
        --prefix) PREFIX="${2:-}"; [ -n "$PREFIX" ] || die "--prefix necesita un directorio"; shift 2 ;;
        --prefix=*) PREFIX="${1#*=}"; shift ;;
        --asset) ASSET="${2:-}"; [ -n "$ASSET" ] || die "--asset necesita un valor"; shift 2 ;;
        --asset=*) ASSET="${1#*=}"; shift ;;
        --no-brew) NO_BREW=1; shift ;;
        --check) CHECK_ONLY=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        --no-sudo) NO_SUDO=1; shift ;;
        --yes|-y) shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "opción desconocida: $1 (usá --help)" ;;
    esac
done

# ---------------------------------------------------------------------------
# Sistema operativo y gestor de paquetes
# ---------------------------------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"
PM=""
DISTRO=""
BREW=0

case "$OS" in
    Linux)
        [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ] \
            || die "no hay paquetes Linux para $ARCH; sólo x86_64 (o compilá desde el repo)"
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
        ;;
    Darwin)
        [ "$ARCH" = "arm64" ] || die "no hay build macOS para $ARCH (sólo Apple Silicon); compilá desde el repo"
        command -v brew >/dev/null 2>&1 && BREW=1
        ;;
    *)
        die "sistema no soportado: $OS (Linux o macOS; en Windows usá WSL)"
        ;;
esac

if [ "$OS" = "Linux" ] && ! command -v catodo_install_appimage >/dev/null 2>&1; then
    die "instalador incompleto: falta scripts/_desktop.sh"
fi

# ---------------------------------------------------------------------------
# Release y asset
# ---------------------------------------------------------------------------
resolve_tag() {
    local url tag
    # Redirección de /releases/latest: sin API, sin rate limit.
    url="$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$RELEASES/latest" 2>/dev/null || true)"
    case "$url" in
        */releases/tag/v*) tag="${url##*/}"; printf '%s' "$tag"; return 0 ;;
    esac
    local json
    json="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || true)"
    tag="$(printf '%s\n' "$json" \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    tag="${tag%%$'\n'*}"
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
        mac|zip|darwin) printf 'Catodo-%s-mac-arm64.zip' "$v" ;;
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

# En macOS el cask apunta siempre a la última release: sólo sirve sin --version.
METHOD=""
if [ "$OS" = "Darwin" ]; then
    if [ "$ASSET" = "auto" ]; then
        ASSET="zip"
    elif [ "$ASSET" != "zip" ]; then
        die "--asset $ASSET no aplica en macOS (usá zip)"
    fi
    # El cask instala siempre la última: con --version o --user va el zip.
    if [ "$BREW" -eq 1 ] && [ "$NO_BREW" -eq 0 ] && [ "$TAG_EXPLICIT" -eq 0 ] && [ "$MODE" != "user" ]; then
        METHOD="brew"
    else
        METHOD="zip"
    fi
else
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
    [ "$ASSET" = "zip" ] && die "--asset zip es sólo para macOS"
    METHOD="package"
    [ "$ASSET" = "appimage" ] && METHOD="appimage"

    # Un .deb no se instala con pacman ni un .rpm con apt.
    case "$ASSET" in
        deb)  [ "$PM" = "apt" ] || die "--asset deb necesita apt (esta distro usa ${PM:-ninguno}); probá --asset appimage" ;;
        rpm)  case "$PM" in dnf|zypper) ;; *) die "--asset rpm necesita dnf/zypper (esta distro usa ${PM:-ninguno}); probá --asset appimage" ;; esac ;;
        arch) [ "$PM" = "pacman" ] || die "--asset arch necesita pacman (esta distro usa ${PM:-ninguno}); probá --asset appimage" ;;
    esac
fi
ASSET_NAME="$(asset_for "$ASSET" "$VERSION")"
ASSET_URL="$RELEASES/download/$TAG/$ASSET_NAME"
SUMS_URL="$RELEASES/download/$TAG/SHA256SUMS.txt"

# ---------------------------------------------------------------------------
# Helpers
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
    if [ "$OS" = "Darwin" ]; then
        local plist
        for plist in /Applications/Catodo.app/Contents/Info.plist "$HOME/Applications/Catodo.app/Contents/Info.plist"; do
            if [ -f "$plist" ]; then
                /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist" 2>/dev/null && return 0
            fi
        done
        return 0
    fi
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

mac_app_dir() {
    if [ "$MODE" = "user" ] || [ ! -w /Applications ]; then
        printf '%s/Applications' "$HOME"
    else
        printf '/Applications'
    fi
}

# ---------------------------------------------------------------------------
# --check / --dry-run
# ---------------------------------------------------------------------------
report() {
    local current
    current="$(installed_version || true)"
    printf '  %-18s %s\n' "sistema" "$OS $ARCH"
    if [ "$OS" = "Linux" ]; then
        printf '  %-18s %s\n' "distro" "${DISTRO:-desconocida}"
        printf '  %-18s %s\n' "gestor" "${PM:-ninguno (AppImage de usuario)}"
        if command -v catodo_fuse_ok >/dev/null 2>&1; then
            printf '  %-18s %s\n' "fuse (AppImage)" "$(catodo_fuse_ok && echo OK || echo "FALTA ($(catodo_fuse_hint "$PM"))")"
        else
            printf '  %-18s %s\n' "fuse (AppImage)" "?"
        fi
    else
        printf '  %-18s %s\n' "homebrew" "$([ "$BREW" -eq 1 ] && echo sí || echo no)"
    fi
    printf '  %-18s %s\n' "versión" "$TAG"
    printf '  %-18s %s\n' "método" "$METHOD"
    printf '  %-18s %s\n' "asset" "$ASSET_NAME"
    printf '  %-18s %s\n' "instalado" "${current:-no}"
    if [ "$OS" = "Darwin" ]; then
        printf '  %-18s %s\n' "destino" "$(mac_app_dir)/Catodo.app"
    elif [ -d "$PREFIX/opt/catodo" ]; then
        printf '  %-18s %s\n' "copia usuario" "$PREFIX/opt/catodo"
    fi
    [ "$METHOD" = "brew" ] || printf '  %-18s %s\n' "url" "$ASSET_URL"
}

if [ "$CHECK_ONLY" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then
    say "Cátodo $TAG — preflight"
    report
    if [ "$DRY_RUN" -eq 1 ]; then
        echo
        say "Plan"
        if [ "$OS" = "Darwin" ]; then
            if [ "$METHOD" = "brew" ]; then
                echo "    brew install --cask quicio/tap/catodo"
            else
                echo "    descargar  $ASSET_URL"
                echo "    verificar  SHA256SUMS.txt"
                echo "    instalar   $(mac_app_dir)/Catodo.app"
            fi
        elif [ "$METHOD" = "appimage" ]; then
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
        if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1 && brew list --cask catodo >/dev/null 2>&1; then
            brew uninstall --cask catodo && removed=1
        elif [ "$OS" = "Linux" ]; then
            case "$PM" in
                pacman) run_root pacman -Rns --noconfirm catodo && removed=1 ;;
                apt)    run_root apt-get remove -y catodo && removed=1 ;;
                dnf)    run_root dnf remove -y catodo && removed=1 ;;
                zypper) run_root zypper --non-interactive remove catodo && removed=1 ;;
            esac || true
        fi
    fi
    if [ "$OS" = "Darwin" ]; then
        for app in /Applications/Catodo.app "$HOME/Applications/Catodo.app"; do
            if [ -d "$app" ]; then rm -rf "$app" && removed=1; fi
        done
    elif catodo_uninstall_user "$PREFIX"; then
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
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 \
    || die "falta sha256sum/shasum para verificar la descarga"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/catodo-install.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

CURL=(curl -fL --retry 3 --connect-timeout 15)
[ -t 2 ] && CURL+=(--progress-bar)

# El release se publica antes de que termine `release.yml`: los assets
# (incluido SHA256SUMS.txt) aparecen unos minutos después. Reintentamos un poco
# y, si sigue faltando, explicamos la ventana en vez de fallar con el curl crudo.
fetch_sums() {
    local attempt
    for attempt in 1 2 3; do
        if "${CURL[@]}" -sS -o "$WORK/SHA256SUMS.txt" "$SUMS_URL"; then
            return 0
        fi
        [ "$attempt" -lt 3 ] && sleep 5
    done
    die "no pude descargar SHA256SUMS.txt de $TAG. Si el release recién se publicó, los artefactos pueden tardar unos minutos en estar listos: reintentá en un rato o fijá un tag anterior con --version vX.Y.Z."
}

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
    "${CURL[@]}" -sS -o "$WORK/$name" "$RELEASES/download/$TAG/$name" || die "falló la descarga de $name"
    verify_asset "$name"
}

# ---------------------------------------------------------------------------
# Instalación
# ---------------------------------------------------------------------------
install_macos_zip() {
    local zip="$1" dest appsrc cand
    dest="$(mac_app_dir)"
    mkdir -p "$dest"
    ditto -x -k "$zip" "$WORK/unzip"
    appsrc=""
    for cand in "$WORK/unzip"/*.app "$WORK/unzip"/*/*.app; do
        if [ -d "$cand" ]; then appsrc="$cand"; break; fi
    done
    [ -n "$appsrc" ] || die "el zip no contiene Catodo.app"
    rm -rf "$dest/Catodo.app"
    ditto "$appsrc" "$dest/Catodo.app"
    # No está notarizada: sin esto Gatekeeper pide clic derecho → Abrir.
    xattr -dr com.apple.quarantine "$dest/Catodo.app" 2>/dev/null || true
    say "Instalado en $dest/Catodo.app"
    say "Abrilo desde Launchpad o con: open \"$dest/Catodo.app\""
}

if [ "$OS" = "Darwin" ]; then
    if [ "$METHOD" = "brew" ]; then
        say "Instalando con Homebrew (cask quicio/tap/catodo)"
        if ! brew install --cask quicio/tap/catodo; then
            warn "Homebrew falló (¿Brew 5+ sin confiar en el tap? probá: brew trust quicio/tap)"
            warn "bajo el .zip directamente"
            fetch_sums
            fetch_asset "$ASSET_NAME"
            install_macos_zip "$WORK/$ASSET_NAME"
        fi
    else
        say "Descargando Cátodo $TAG ($ASSET_NAME)"
        fetch_sums
        fetch_asset "$ASSET_NAME"
        say "Checksum OK"
        install_macos_zip "$WORK/$ASSET_NAME"
    fi
else
    say "Descargando Cátodo $TAG ($ASSET_NAME)"
    fetch_sums
    fetch_asset "$ASSET_NAME"
    say "Checksum OK"

    # Icono para el menú (si el tag no lo tiene, se extrae de la AppImage).
    ICON=""
    if curl -fsSL -o "$WORK/catodo.png" "$RAW/$TAG/catodo.png" 2>/dev/null; then
        ICON="$WORK/catodo.png"
    fi

    if [ "$METHOD" = "appimage" ]; then
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
            # Una instalación de usuario previa dejaría dos entradas en el menú.
            catodo_uninstall_user "$PREFIX" || true
        fi
    fi
fi

echo
say "Cátodo $TAG instalado."
if [ "$OS" = "Darwin" ]; then
    echo "    Abrí 'Cátodo' desde Launchpad (o ~/Applications)."
else
    echo "    Abrí 'Cátodo' desde el menú o ejecutá: catodo"
    echo "    El backend Rust corre como sidecar de la app; no hay servicio systemd que configurar."
fi
echo "    Desinstalar: curl -fsSL $SITE | bash -s -- --uninstall"
