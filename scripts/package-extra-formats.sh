#!/usr/bin/env bash
# Construye .rpm y .pkg.tar.zst a partir del .deb que ya generó electron-builder.
#
#   ./scripts/package-extra-formats.sh            # lee release/Catodo-<ver>-linux-amd64.deb
#   ./scripts/package-extra-formats.sh ruta.deb   # desde un .deb puntual
#
# No vuelve a empaquetar la app: reusa el árbol que Electron ya armó y válido, así
# que los dos formatos nuevos no pueden diferir del .deb en contenido.
#
# Dependencias: nfpm (https://nfpm.goreleaser.com) y bsdtar o dpkg-deb.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
STAGE="$ROOT/.packaging-root"
CONFIG="$ROOT/packaging/nfpm-catodo.yaml"

die() { echo "error: $*" >&2; exit 1; }
say() { echo "==> $*"; }

DEB="${1:-$ROOT/release/Catodo-${VERSION}-linux-amd64.deb}"
[ -f "$DEB" ] || die "no existe $DEB (corré antes scripts/package-linux-app.sh)"
command -v nfpm >/dev/null || die "falta nfpm en el PATH (https://nfpm.goreleaser.com)"

ARCH_LABEL="$(uname -m)"
[ "$ARCH_LABEL" = "x86_64" ] || die "por ahora solo x86_64 (esta máquina: $ARCH_LABEL)"

say "extrayendo $DEB"
rm -rf "$STAGE"
mkdir -p "$STAGE"
if command -v dpkg-deb >/dev/null; then
  dpkg-deb -x "$DEB" "$STAGE"
else
  # bsdtar no sirve acá: el .deb es un archivo `ar` que contiene data.tar.*,
  # así que se desempaqueta en dos pasos.
  command -v ar >/dev/null || die "hace falta dpkg-deb o binutils (ar)"
  tmpd="$(mktemp -d)"
  ( cd "$tmpd" && ar x "$DEB" ) || die "no pude abrir el .deb con ar"
  for f in "$tmpd"/data.tar.*; do
    [ -f "$f" ] && tar -xpf "$f" -C "$STAGE"
  done
  rm -rf "$tmpd"
fi
[ -d "$STAGE/opt/Catodo" ] || die "el .deb no tiene /opt/Catodo"
[ -f "$STAGE/usr/share/applications/catodo-frontend.desktop" ] || die "el .deb no trae el .desktop"

# chrome-sandbox: el .deb lo deja 4755 cuando el kernel no permite user
# namespaces. En un paquete no se instalan binarios setuid; se deja 0755 y se
# documenta que hace falta unprivileged userns (default en Fedora y Arch).
if [ -e "$STAGE/opt/Catodo/chrome-sandbox" ]; then
  chmod 0755 "$STAGE/opt/Catodo/chrome-sandbox"
fi

mkdir -p "$ROOT/release"
say "nfpm: rpm"
VERSION="$VERSION" nfpm package -f "$CONFIG" -p rpm -t "$ROOT/release/" >/dev/null
say "nfpm: pkg.tar.zst"
VERSION="$VERSION" nfpm package -f "$CONFIG" -p archlinux -t "$ROOT/release/" >/dev/null

rm -rf "$STAGE"

RPM="$ROOT/release/catodo-${VERSION}-1.x86_64.rpm"
PKG="$ROOT/release/catodo-${VERSION}-1-x86_64.pkg.tar.zst"
for f in "$RPM" "$PKG"; do
  [ -f "$f" ] || die "no se generó $f"
done

say "verificación"
if command -v rpm >/dev/null; then
  rpm -qpl "$RPM" >/dev/null && echo "  rpm OK"
else
  bsdtar -tf "$RPM" >/dev/null && echo "  rpm OK (payload listado con bsdtar)"
fi
if command -v pacman >/dev/null; then
  pacman -Qip "$PKG" >/dev/null && pacman -Qlp "$PKG" >/dev/null && echo "  pkg.tar.zst OK"
fi

say "listo"
ls -lh "$RPM" "$PKG"
