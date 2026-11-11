#!/usr/bin/env bash
# Genera SHA256SUMS portable (Linux/macOS).
set -euo pipefail

DIR="${1:-release}"
shift || true

if [ ! -d "$DIR" ]; then
    echo "No existe el directorio $DIR" >&2
    exit 1
fi

cd "$DIR"
if [ "$#" -gt 0 ]; then
    FILES=("$@")
else
    FILES=()
    while IFS= read -r f; do
        FILES+=("$f")
    done < <(find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name '*.blockmap' -print | sed 's#^\./##' | sort)
fi

if [ "${#FILES[@]}" -eq 0 ]; then
    echo "No hay archivos para hashear en $DIR" >&2
    exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${FILES[@]}" > SHA256SUMS
else
    shasum -a 256 "${FILES[@]}" > SHA256SUMS
fi

echo "==> $DIR/SHA256SUMS"
cat SHA256SUMS
