#!/usr/bin/env bash
# Verifica los límites de capas del workspace Rust con cargo metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f rust/Cargo.toml ]; then
    echo "Rust workspace not found at rust/Cargo.toml; skipping"
    exit 0
fi

python3 - <<'PY'
import json
import subprocess
import sys

meta = json.loads(subprocess.check_output(
    ["cargo", "metadata", "--no-deps", "--format-version", "1"],
    cwd="rust",
    text=True,
))

packages = {p["name"]: p for p in meta["packages"]}
errors: list[str] = []

def deps(name: str) -> set[str]:
    return {d["name"] for d in packages[name]["dependencies"]}

domain = deps("catodo-domain")
platform = deps("catodo-platform")
server = deps("catodo-server")

for forbidden in ("axum", "tokio", "hyper", "catodo-platform", "catodo-server"):
    if forbidden in domain:
        errors.append(f"catodo-domain no puede depender de {forbidden}")

for forbidden in ("axum", "hyper", "catodo-server"):
    if forbidden in platform:
        errors.append(f"catodo-platform no puede depender de {forbidden}")

for required in ("catodo-domain", "catodo-platform"):
    if required not in server:
        errors.append(f"catodo-server debe depender de {required}")

if errors:
    print("Límites de capas violados:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    sys.exit(1)

print("Rust layer checks OK")
PY
