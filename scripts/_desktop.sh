#!/usr/bin/env bash
# Cátodo — helpers para registrar la app en el menú del usuario.
#
# Lo sourcean `install-local.sh` (build desde el repo) e `install.sh`
# (paquete de release; la copia publicada lo lleva inlineado). No ejecutar
# directo.
#
# El layout es fijo e idéntico en los dos caminos, así una reinstalación
# actualiza la misma entrada en lugar de dejar duplicados en el launcher:
#   <prefix>/opt/catodo/Catodo.AppImage
#   <prefix>/bin/catodo                     (symlink)
#   <prefix>/share/applications/catodo.desktop
#   <prefix>/share/icons/hicolor/1024x1024/apps/catodo.png
#
# `Catodo` (mayúscula) es el nombre de las extracciones viejas hechas a mano;
# se retiran a un .bak para que el menú no siga abriendo una versión anterior.

catodo_fuse_ok() {
    [ -e /dev/fuse ] || return 1
    if command -v ldconfig >/dev/null 2>&1; then
        # Sin pipe a `grep -q`: con `pipefail`, el SIGPIPE de grep aborta a
        # ldconfig y el pipeline "falla" aunque libfuse esté instalada.
        local libs
        libs="$(ldconfig -p 2>/dev/null || true)"
        case "$libs" in
            *libfuse.so.2*) ;;
            *) return 1 ;;
        esac
    fi
    return 0
}

catodo_fuse_hint() {
    local pm="${1:-}"
    case "$pm" in
        pacman) printf 'fuse2' ;;
        apt)    printf 'libfuse2 (Ubuntu 24.04+: libfuse2t64)' ;;
        dnf)    printf 'fuse-libs' ;;
        zypper) printf 'libfuse2' ;;
        *)      printf 'libfuse2' ;;
    esac
}

catodo_desktop_exec() {
    local app="$1"
    if catodo_fuse_ok; then
        printf '"%s" %%U' "$app"
    else
        # Sin FUSE la AppImage puede correr igual extrayéndose; más lenta,
        # pero evita el fallo silencioso típico en Ubuntu 24.04.
        printf 'env APPIMAGE_EXTRACT_AND_RUN=1 "%s" %%U' "$app"
    fi
}

# Extrae un icono de la propia AppImage (fallback cuando no hay PNG suelto).
catodo_icon_from_appimage() {
    local app="$1" dest="$2" tmpd png
    tmpd="$(mktemp -d "${TMPDIR:-/tmp}/catodo-icon.XXXXXX")"
    ( cd "$tmpd" && "$app" --appimage-extract '*.png' >/dev/null 2>&1 ) || true
    png="$(find "$tmpd/squashfs-root" -name '*.png' -size +2k 2>/dev/null | head -n 1 || true)"
    if [ -n "$png" ]; then
        cp -f "$png" "$dest"
        rm -rf "$tmpd"
        return 0
    fi
    rm -rf "$tmpd"
    return 1
}

# Mueve la extracción vieja (Catodo en mayúscula) fuera del camino y repunta
# los autostart que la mencionaban.
catodo_retire_legacy() {
    local prefix="$1" legacy="$prefix/opt/Catodo" bak
    [ -d "$legacy" ] || return 0
    bak="$legacy-legacy.bak"
    [ -e "$bak" ] && bak="$legacy-legacy-$(date +%Y%m%d%H%M%S).bak"
    mv "$legacy" "$bak"
    printf '  ! extracción vieja retirada: %s → %s\n' "$legacy" "$bak" >&2

    local f
    for f in "$prefix"/share/applications/*.desktop "$HOME"/.config/autostart/*.desktop; do
        [ -f "$f" ] || continue
        if grep -q "$legacy" "$f" 2>/dev/null; then
            sed -i "s|$legacy/catodo-frontend|$prefix/bin/catodo|g; s|$legacy|$prefix/bin/catodo|g" "$f"
            printf '  ! %s repuntado a %s/bin/catodo\n' "$f" "$prefix" >&2
        fi
    done
}

# catodo_install_appimage <appimage> [prefix] [icono]
catodo_install_appimage() {
    local src="$1"
    local prefix="${2:-$HOME/.local}"
    local icon="${3:-}"
    local appdir="$prefix/opt/catodo"
    local bindir="$prefix/bin"
    local app="$appdir/Catodo.AppImage"
    local icondir="$prefix/share/icons/hicolor/1024x1024/apps"

    catodo_retire_legacy "$prefix"

    mkdir -p "$appdir" "$bindir" "$prefix/share/applications" "$icondir"
    cp -f "$src" "$app"
    chmod +x "$app"
    ln -sfn "$app" "$bindir/catodo"

    cat > "$prefix/share/applications/catodo.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Cátodo
Comment=Shell multimedia con estética CRT
Exec=$(catodo_desktop_exec "$app")
Icon=catodo
Terminal=false
Categories=AudioVideo;Player;
StartupWMClass=Catodo
EOF
    chmod 644 "$prefix/share/applications/catodo.desktop"

    if [ -n "$icon" ] && [ -f "$icon" ]; then
        cp -f "$icon" "$icondir/catodo.png"
    else
        catodo_icon_from_appimage "$app" "$icondir/catodo.png" || true
    fi

    command -v update-desktop-database >/dev/null 2>&1 \
        && update-desktop-database "$prefix/share/applications" >/dev/null 2>&1 || true
    command -v gtk-update-icon-cache >/dev/null 2>&1 \
        && gtk-update-icon-cache -f -t "$prefix/share/icons/hicolor" >/dev/null 2>&1 || true

    printf '  app:     %s\n' "$app"
    printf '  comando: %s\n' "$bindir/catodo"
    case ":$PATH:" in
        *":$bindir:"*) ;;
        *) printf '  ! %s no está en PATH\n' "$bindir" >&2 ;;
    esac
}

# Devuelve 0 si retiró algo.
catodo_uninstall_user() {
    local prefix="${1:-$HOME/.local}" removed=1
    if [ -e "$prefix/opt/catodo/Catodo.AppImage" ]; then
        rm -rf "$prefix/opt/catodo"
        removed=0
    fi
    rm -f "$prefix/bin/catodo" \
          "$prefix/share/applications/catodo.desktop" \
          "$prefix/share/icons/hicolor/1024x1024/apps/catodo.png"
    command -v update-desktop-database >/dev/null 2>&1 \
        && update-desktop-database "$prefix/share/applications" >/dev/null 2>&1 || true
    return "$removed"
}
