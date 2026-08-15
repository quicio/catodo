#!/usr/bin/env node
/**
 * Extrae icon data (IconNode) de react-icons para los packs "morph"
 * (feather, tabler) y genera frontend/src/icons.vendor.ts.
 *
 * Uso: node scripts/extract-icon-data.mjs   (desde repo root)
 * Re-ejecutar si se agregan nombres semánticos o se actualiza react-icons.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "frontend", "node_modules", "react-icons");

// semantic name → export de react-icons por pack morph
const NEEDED = {
  fi: {
    music: "FiMusic",
    "monitor-play": "FiMonitor",
    clapperboard: "FiFilm",
    tv: "FiTv",
    play: "FiPlay",
    gamepad: "FiCpu",
    "thumbs-up": "FiThumbsUp",
    "thumbs-down": "FiThumbsDown",
    check: "FiCheck",
    x: "FiX",
    settings: "FiSettings",
    smartphone: "FiSmartphone",
  },
  tb: {
    music: "TbMusic",
    "monitor-play": "TbDeviceDesktop",
    clapperboard: "TbMovie",
    tv: "TbDeviceTv",
    play: "TbPlayerPlay",
    gamepad: "TbDeviceGamepad2",
    "thumbs-up": "TbThumbUp",
    "thumbs-down": "TbThumbDown",
    check: "TbCheck",
    x: "TbX",
    settings: "TbSettings",
    smartphone: "TbDeviceMobile",
  },
};

const GEOM_TAGS = new Set(["path", "line", "circle", "ellipse", "rect", "polyline", "polygon"]);

function extract(packDir, exportName) {
  const src = readFileSync(join(nm, packDir, "index.mjs"), "utf8");
  const re = new RegExp(`export function ${exportName} \\(props\\) \\{\\s*return GenIcon\\((\\{.*?\\})\\)\\(props\\)`, "s");
  const m = src.match(re);
  if (!m) throw new Error(`no se encontró ${exportName} en ${packDir}`);
  const data = JSON.parse(m[1]);
  const nodes = [];
  for (const c of data.child || []) {
    if (!GEOM_TAGS.has(c.tag)) throw new Error(`${exportName}: tag no soportado <${c.tag}>`);
    if (c.attr?.transform) throw new Error(`${exportName}: transform no soportado`);
    nodes.push([c.tag, c.attr || {}]);
  }
  return nodes;
}

const out = [
  "/* GENERADO por scripts/extract-icon-data.mjs — no editar a mano. */",
  "import type { IconNode } from \"./icons\";",
  "",
];
for (const [packDir, mapping] of Object.entries(NEEDED)) {
  const constName = packDir.toUpperCase() + "_NODES";
  out.push(`export const ${constName}: Record<string, IconNode> = {`);
  for (const [semantic, exportName] of Object.entries(mapping)) {
    const nodes = extract(packDir, exportName);
    out.push(`  ${JSON.stringify(semantic)}: ${JSON.stringify(nodes)},`);
  }
  out.push("};", "");
}

const target = join(root, "frontend", "src", "icons.vendor.ts");
writeFileSync(target, out.join("\n"));
console.log("generado", target);
