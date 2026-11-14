#!/usr/bin/env bash
# Verifica los límites de capas del workspace Rust con cargo metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f rust/Cargo.toml ]; then
    echo "Rust workspace not found at rust/Cargo.toml; skipping"
    exit 0
fi

ROOT="$ROOT" node <<'JS'
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = process.env.ROOT;
const meta = JSON.parse(
  execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1"], {
    cwd: path.join(root, "rust"),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const packages = new Map(meta.packages.map((pkg) => [pkg.name, pkg]));
const errors = [];

const deps = (name) =>
  new Set((packages.get(name)?.dependencies ?? []).map((dep) => dep.name));

const domain = deps("catodo-domain");
const platform = deps("catodo-platform");
const server = deps("catodo-server");

for (const forbidden of ["axum", "tokio", "hyper", "catodo-platform", "catodo-server"]) {
  if (domain.has(forbidden)) {
    errors.push(`catodo-domain no puede depender de ${forbidden}`);
  }
}

for (const forbidden of ["axum", "hyper", "catodo-server"]) {
  if (platform.has(forbidden)) {
    errors.push(`catodo-platform no puede depender de ${forbidden}`);
  }
}

for (const required of ["catodo-domain", "catodo-platform"]) {
  if (!server.has(required)) {
    errors.push(`catodo-server debe depender de ${required}`);
  }
}

if (errors.length > 0) {
  console.error("Rust layer violations:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Rust layer checks OK (${packages.size} crates)`);
JS
