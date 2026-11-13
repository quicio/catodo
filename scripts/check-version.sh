#!/usr/bin/env bash
# Verifica que todos los manifests declaren la misma versión que VERSION.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if python3 -c 'import tomllib' >/dev/null 2>&1; then
    PYTHON=(python3)
elif command -v uv >/dev/null 2>&1; then
    # --project (no --directory): el snippet asume que el cwd es la raíz del repo.
    PYTHON=(uv run --project "$ROOT/backend" python)
else
    echo "Se necesita Python 3.11+ (tomllib) o uv para verificar versiones" >&2
    exit 1
fi

"${PYTHON[@]}" - "$ROOT" <<'PY'
import json
import sys
import tomllib
from pathlib import Path

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
version = (root / "VERSION").read_text(encoding="utf-8").strip()
errors: list[str] = []

def check(label: str, value: object) -> None:
    if str(value).strip() != version:
        errors.append(f"{label}: {value!r} != VERSION {version!r}")

pyproject = tomllib.loads((root / "backend/pyproject.toml").read_text(encoding="utf-8"))
check("backend/pyproject.toml project.version", pyproject["project"]["version"])

uv_lock = root / "backend/uv.lock"
if uv_lock.is_file():
    lock_data = tomllib.loads(uv_lock.read_text(encoding="utf-8"))
    project = next(
        (pkg for pkg in lock_data.get("package", []) if pkg.get("name") == "catodo"),
        None,
    )
    if project is not None:
        check("backend/uv.lock catodo version", project.get("version"))

package = json.loads((root / "frontend/package.json").read_text(encoding="utf-8"))
check("frontend/package.json version", package["version"])

lock = json.loads((root / "frontend/package-lock.json").read_text(encoding="utf-8"))
check("frontend/package-lock.json version", lock.get("version"))
check("frontend/package-lock.json packages[''].version", lock.get("packages", {}).get("", {}).get("version"))

tray = tomllib.loads((root / "clients/tray/Cargo.toml").read_text(encoding="utf-8"))
check("clients/tray/Cargo.toml package.version", tray["package"]["version"])

rust = root / "rust/Cargo.toml"
if rust.is_file():
    cargo = tomllib.loads(rust.read_text(encoding="utf-8"))
    check("rust/Cargo.toml workspace.package.version", cargo["workspace"]["package"]["version"])
else:
    print("warning: rust/Cargo.toml no existe todavía; se omite del chequeo")

if errors:
    print("Versiones inconsistentes:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    sys.exit(1)

print(f"Versiones OK: {version}")
PY
