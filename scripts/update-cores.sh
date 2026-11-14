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
    ENTRIES="$entries" CORE="$core" CORE_URL="$url" ZIP_SHA="$zip_sha" LIB_SHA="$lib_sha" node <<'JS'
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync(process.env.ENTRIES, "utf8"));
data[process.env.CORE] = {
  url: process.env.CORE_URL,
  zip_sha256: process.env.ZIP_SHA,
  lib_sha256: process.env.LIB_SHA,
};
fs.writeFileSync(process.env.ENTRIES, `${JSON.stringify(data, null, 2)}\n`);
JS
done

LOCK="$LOCK" PLATFORM="$platform" ENTRIES="$entries" node <<'JS'
const fs = require("node:fs");
const lockPath = process.env.LOCK;
const entries = JSON.parse(fs.readFileSync(process.env.ENTRIES, "utf8"));
const lock = fs.existsSync(lockPath)
  ? JSON.parse(fs.readFileSync(lockPath, "utf8"))
  : {};
lock.generated = new Date().toISOString().slice(0, 10);
lock.pins = lock.pins || {};
lock.pins[process.env.PLATFORM] = entries;

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

fs.writeFileSync(lockPath, `${JSON.stringify(sortKeys(lock), null, 2)}\n`);
console.log(`==> pin actualizado: ${lockPath} (${process.env.PLATFORM})`);
JS
