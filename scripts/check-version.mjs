#!/usr/bin/env node
// Verifica que todos los manifests declaren la misma versión que VERSION.
// Sin Python: usa Node (ya requerido por el frontend).
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || process.cwd();
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label, value) {
  if (String(value).trim() !== version) {
    errors.push(`${label}: ${JSON.stringify(value)} != VERSION ${JSON.stringify(version)}`);
  }
}

// Lee `key = "value"` dentro de una sección TOML concreta ([section]).
function tomlValue(rel, section, key) {
  let current = "";
  for (const line of read(rel).split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      current = header[1].trim();
      continue;
    }
    if (current !== section) continue;
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`));
    if (match) return match[1];
  }
  return undefined;
}

const pkg = JSON.parse(read("frontend/package.json"));
check("frontend/package.json version", pkg.version);

const lock = JSON.parse(read("frontend/package-lock.json"));
check("frontend/package-lock.json version", lock.version);
check(
  "frontend/package-lock.json packages[''].version",
  lock.packages?.[""]?.version,
);

check(
  "clients/tray/Cargo.toml package.version",
  tomlValue("clients/tray/Cargo.toml", "package", "version"),
);

const rust = path.join(root, "rust/Cargo.toml");
if (fs.existsSync(rust)) {
  check(
    "rust/Cargo.toml workspace.package.version",
    tomlValue("rust/Cargo.toml", "workspace.package", "version"),
  );
} else {
  console.log("warning: rust/Cargo.toml no existe todavía; se omite del chequeo");
}

if (errors.length > 0) {
  console.error("Versiones inconsistentes:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Versiones OK: ${version}`);
