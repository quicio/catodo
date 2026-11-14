#!/usr/bin/env bash
# Regenera el pin de cores libretro para una plataforma.
# Uso: ./scripts/update-cores.sh [apple/osx/arm64|linux/x86_64|...]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/rust/crates/catodo-server/src/arcade/cores.lock.json"
CORES=(fceumm snes9x gambatte mgba mupen64plus_next pcsx_rearmed genesis_plus_gx)

platform="${1:-}"
if [ -z "$platform" ]; then
    case "$(uname -s)/$(uname -m)" in
        Darwin/arm64) platform="apple/osx/arm64" ;;
        Darwin/x86_64) platform="apple/osx/x86_64" ;;
        Linux/x86_64) platform="linux/x86_64" ;;
        Linux/aarch64|Linux/arm64) platform="linux/arm64" ;;
        *) echo "plataforma no soportada: $(uname -s)/$(uname -m)" >&2; exit 1 ;;
    esac
fi

case "$platform" in
    apple/*) ext="dylib" ;;
    linux/*) ext="so" ;;
    *) echo "plataforma desconocida: $platform" >&2; exit 1 ;;
esac

sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
entries="$WORK/entries.json"
echo '{}' > "$entries"

for core in "${CORES[@]}"; do
    url="https://buildbot.libretro.com/nightly/$platform/latest/${core}_libretro.${ext}.zip"
    zip="$WORK/${core}.zip"
    echo "==> $core ($platform)"
    curl -fsSL --retry 2 --max-time 180 "$url" -o "$zip"
    zip_sha="$(sha256 "$zip")"
    mkdir -p "$WORK/$core"
    unzip -o -q "$zip" -d "$WORK/$core"
    lib="$WORK/$core/${core}_libretro.${ext}"
    if [ ! -f "$lib" ]; then
        echo "no se encontró $lib en el zip de $core" >&2
        exit 1
    fi
    lib_sha="$(sha256 "$lib")"
    python3 - "$entries" "$core" "$url" "$zip_sha" "$lib_sha" <<'PY'
import json, sys
path, core, url, zip_sha, lib_sha = sys.argv[1:]
with open(path) as f:
    data = json.load(f)
data[core] = {"url": url, "zip_sha256": zip_sha, "lib_sha256": lib_sha}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
done

python3 - "$LOCK" "$platform" "$entries" <<'PY'
import datetime, json, os, sys
lock_path, platform, entries_path = sys.argv[1:]
with open(entries_path) as f:
    entries = json.load(f)
if os.path.exists(lock_path):
    with open(lock_path) as f:
        lock = json.load(f)
else:
    lock = {}
lock["generated"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
lock.setdefault("pins", {})[platform] = entries
with open(lock_path, "w") as f:
    json.dump(lock, f, indent=2, sort_keys=True)
    f.write("\n")
print(f"==> pin actualizado: {lock_path} ({platform})")
PY
