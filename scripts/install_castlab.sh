#!/usr/bin/env bash
# Instala el binario de Electron castLabs (Widevine/DRM) local al repo en
# frontend/electron-castlab/, para que run-dev.sh tenga canales con DRM
# (Movistar TV, HBO Max) sin depender del AUR.
#
# Uso:
#   bash scripts/install_castlab.sh                # última versión estable
#   bash scripts/install_castlab.sh --version v42.8.0+wvcus
#   bash scripts/install_castlab.sh --force        # re-descarga aunque exista
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ROOT="$PROJECT_DIR/frontend/electron-castlab"
LIB_DIR="$DEST_ROOT/usr/lib/electron-castlab"
BIN_DIR="$DEST_ROOT/usr/bin"
REPO="castlabs/electron-releases"
BASE_URL="https://github.com/$REPO/releases/download"

FORCE=0
VERSION=""

for arg in "$@"; do
    case "$arg" in
        --version) ;;
        --version=*) VERSION="${arg#--version=}" ;;
        --force) FORCE=1 ;;
        --help|-h)
            echo "Uso: bash scripts/install_castlab.sh [--version <tag>] [--force]"
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

# ---------------------------------------------------------------------------
# Detectar arquitectura
# ---------------------------------------------------------------------------
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64) ASSET_ARCH="x64" ;;
    aarch64|arm64) ASSET_ARCH="arm64" ;;
    *)
        echo "Arquitectura no soportada por castLabs: $ARCH" >&2
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Resolver versión (default: última estable de castlabs/electron-releases)
# ---------------------------------------------------------------------------
if [ -z "$VERSION" ] || [ "$VERSION" = "--version" ]; then
    echo "==> Buscando última versión estable de castLabs..."
    if ! command -v curl >/dev/null 2>&1; then
        echo "curl no está instalado. Especificá la versión: --version v42.8.0+wvcus" >&2
        exit 1
    fi
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases" 2>/dev/null \
        | python3 -c "
import sys, json
rels = json.load(sys.stdin)
for r in rels:
    tag = r.get('tag_name', '')
    if '+wvcus' in tag and '-alpha' not in tag and '-beta' not in tag and '-rc' not in tag:
        print(tag)
        break
" || true)"
    if [ -z "$VERSION" ]; then
        echo "No se pudo resolver la versión estable desde GitHub." >&2
        echo "Usá: bash scripts/install_castlab.sh --version v43.2.0+wvcus" >&2
        exit 1
    fi
    echo "    Última estable: $VERSION"
fi

ASSET="electron-${VERSION}-linux-${ASSET_ARCH}.zip"
URL="$BASE_URL/$VERSION/$ASSET"

# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------
if [ -x "$LIB_DIR/electron" ] && [ "$FORCE" -ne 1 ]; then
    CUR="$(cat "$LIB_DIR/version" 2>/dev/null || echo '?')"
    echo "==> castLabs ya instalado en $LIB_DIR (versión $CUR)."
    echo "    Para reinstalar: bash scripts/install_castlab.sh --force"
    exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Descargando $ASSET"
echo "    $URL"
curl -fL --retry 3 --progress-bar "$URL" -o "$TMP/$ASSET"

echo "==> Extrayendo a $LIB_DIR"
mkdir -p "$LIB_DIR" "$BIN_DIR"
unzip -o -q "$TMP/$ASSET" -d "$LIB_DIR"
chmod +x "$LIB_DIR/electron" "$LIB_DIR/chrome-sandbox" "$LIB_DIR/chrome_crashpad_handler" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Wrapper `electroncastlab` (bandera de class/name + hook de app-id)
# ---------------------------------------------------------------------------
cat > "$BIN_DIR/electroncastlab" <<'EOF'
#!/usr/bin/bash
set -euo pipefail
name=electron-castlab
flags_file="${XDG_CONFIG_HOME:-$HOME/.config}/${name}-flags.conf"
fallback_file="${XDG_CONFIG_HOME:-$HOME/.config}/electron-flags.conf"
lines=()
if [[ -f "${flags_file}" ]]; then
    mapfile -t lines < "${flags_file}"
elif [[ -f "${fallback_file}" ]]; then
    mapfile -t lines < "${fallback_file}"
fi
flags=()
for line in "${lines[@]}"; do
    if [[ ! "${line}" =~ ^[[:space:]]*#.* ]] && [[ -n "${line}" ]]; then
        flags+=("${line}")
    fi
done
: ${ELECTRON_IS_DEV:=0}
export ELECTRON_IS_DEV
: ${ELECTRON_FORCE_IS_PACKAGED:=true}
export ELECTRON_FORCE_IS_PACKAGED
unset CHROME_DESKTOP
exec "$(dirname "$0")/../lib/electron-castlab/electron" "${flags[@]}" -r "$(dirname "$0")/../lib/electron-castlab/linux-app-id.js" "$@"
EOF
chmod +x "$BIN_DIR/electroncastlab"

cat > "$LIB_DIR/linux-app-id.js" <<'EOF'
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const hasSwitch = (name) =>
  process.argv.some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const sanitize = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
const findPackagePath = () => {
  const candidates = [path.join(process.cwd(), 'package.json')];
  for (const arg of process.argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    const resolved = path.resolve(arg);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      candidates.push(path.join(resolved, 'package.json'));
      break;
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
};
if (process.platform === 'linux') {
  try {
    const pkgPath = findPackagePath();
    if (pkgPath) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const displayName = String(pkg.productName || pkg.name || '').trim();
      const appId = sanitize(pkg.name || pkg.productName || path.basename(path.dirname(pkgPath)));
      const applyIdentity = () => {
        if (displayName) app.setName(displayName);
        if (appId) app.setDesktopName(`${appId}.desktop`);
      };
      if (appId && !hasSwitch('class')) app.commandLine.appendSwitch('class', appId);
      if (appId && !hasSwitch('name')) app.commandLine.appendSwitch('name', appId);
      applyIdentity();
      app.once('ready', applyIdentity);
    }
  } catch {
    // Keep startup resilient for all apps.
  }
}
EOF

echo "==> castLabs instalado: $LIB_DIR/electron ($VERSION)"
echo "    run-dev.sh lo detecta automáticamente."
