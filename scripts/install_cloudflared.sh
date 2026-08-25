#!/usr/bin/env bash
# Instala el binario de `cloudflared` (Cloudflare Tunnel daemon) en
# ~/.local/share/catodo/bin/ para que el módulo tunnel de Cátodo lo encuentre
# sin requerir root ni paquetes del sistema.
#
# Uso:
#   bash scripts/install_cloudflared.sh                # última versión estable
#   bash scripts/install_cloudflared.sh --version 2024.12.2
#   bash scripts/install_cloudflared.sh --force        # re-descarga aunque exista
#
# El binario queda en $DATA_DIR/bin/cloudflared (default:
# ~/.local/share/catodo/bin/cloudflared). El servicio systemd de Cátodo agrega
# ese dir a PATH vía Environment=PATH=... (ver install.sh).
set -euo pipefail

REPO="cloudflare/cloudflared"
BASE_URL="https://github.com/$REPO/releases/download"

FORCE=0
VERSION=""

for arg in "$@"; do
    case "$arg" in
        --version) ;;
        --version=*) VERSION="${arg#--version=}" ;;
        --force) FORCE=1 ;;
        --help|-h)
            echo "Uso: bash scripts/install_cloudflared.sh [--version <tag>] [--force]"
            exit 0
            ;;
        *)
            if [ -z "$VERSION" ] && [[ "$arg" != --* ]]; then
                VERSION="$arg"
            else
                echo "Opción desconocida: $arg (usa --help)" >&2
                exit 1
            fi
            ;;
    esac
done

DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"
DEST="$DATA_DIR/bin/cloudflared"
mkdir -p "$(dirname "$DEST")"

if [ -x "$DEST" ] && [ "$FORCE" -ne 1 ]; then
    echo "==> cloudflared ya instalado en $DEST"
    echo "    Para reinstalar: bash scripts/install_cloudflared.sh --force"
    exit 0
fi

# Detectar arquitectura (mapeo idéntico al de cloudflared releases)
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64) ASSET_ARCH="amd64" ;;
    aarch64|arm64) ASSET_ARCH="arm64" ;;
    armv7l|armv7) ASSET_ARCH="armhf" ;;
    *)
        echo "Arquitectura no soportada por cloudflared: $ARCH" >&2
        exit 1
        ;;
esac

# Última versión estable desde la API de GitHub (filtra pre-releases).
if [ -z "$VERSION" ]; then
    if ! command -v curl >/dev/null 2>&1; then
        echo "curl no está instalado. Especificá la versión: --version 2024.12.2" >&2
        exit 1
    fi
    echo "==> Buscando última versión estable de cloudflared..."
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases" 2>/dev/null \
        | python3 -c "
import sys, json
rels = json.load(sys.stdin)
for r in rels:
    tag = r.get('tag_name', '')
    if 'pre' in tag.lower() or 'rc' in tag.lower():
        continue
    print(tag)
    break
" || true)"
    if [ -z "$VERSION" ]; then
        echo "No se pudo resolver la versión. Especificá: --version 2024.12.2" >&2
        exit 1
    fi
    echo "    Última estable: $VERSION"
fi

ASSET="cloudflared-linux-${ASSET_ARCH}"
URL="$BASE_URL/$VERSION/$ASSET"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Descargando $ASSET"
echo "    $URL"
curl -fL --retry 3 --progress-bar "$URL" -o "$TMP/cloudflared"

# Verificación de integridad: el release JSON publica sha256 por asset.
echo "==> Verificando SHA256"
EXPECTED="$(curl -fsSL "https://github.com/$REPO/releases/download/$VERSION/$ASSET.sha256" 2>/dev/null || true)"
if [ -n "$EXPECTED" ]; then
    ACTUAL="$(sha256sum "$TMP/cloudflared" | awk '{print $1}')"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
        echo "Checksum mismatch. Esperado: $EXPECTED, real: $ACTUAL" >&2
        exit 1
    fi
    echo "    OK ($ACTUAL)"
else
    echo "    (no se publicó .sha256 para este release; saltando verificación)"
fi

mv "$TMP/cloudflared" "$DEST"
chmod +x "$DEST"
echo "==> cloudflared instalado: $DEST ($VERSION)"
echo "    El módulo tunnel de Cátodo lo va a detectar automáticamente."
