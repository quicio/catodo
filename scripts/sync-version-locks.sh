#!/usr/bin/env bash
# Sincroniza los lockfiles después de que release-please bumpea la versión.
# Lo corre el workflow release-pr-sync sobre el PR de release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(cat VERSION)"

if [ -f frontend/package-lock.json ]; then
    echo "==> npm package.json + package-lock version $VERSION"
    # `npm version` actualiza solo los campos de versión; no re-resuelve el
    # árbol de dependencias (evita churn de metadata opcional del lockfile).
    (cd frontend && npm version "$VERSION" --no-git-tag-version --allow-same-version --ignore-scripts >/dev/null)
fi

if [ -f backend/pyproject.toml ]; then
    echo "==> uv lock (backend)"
    (cd backend && uv lock)
fi

if [ -f rust/Cargo.toml ]; then
    echo "==> cargo update rust workspace"
    (cd rust && cargo update --workspace)
fi

if [ -f clients/tray/Cargo.toml ]; then
    echo "==> cargo update tray"
    (cd clients/tray && cargo update -p catodo-tray)
fi
