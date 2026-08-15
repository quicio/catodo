#!/usr/bin/env node
// Verifica los 6 layouts preset del Home. Lee layouts.ts directamente.
// Uso: node scripts/verify-home-layouts.mjs
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const src = readFileSync("../frontend/src/components/home/layouts.ts", "utf8");

// Extrae todas las constantes HomeLayout (id + components[]).
const layoutBlocks = [...src.matchAll(/export const (\w+_LAYOUT): HomeLayout = \{[\s\S]*?layoutId: "([^"]+)",[\s\S]*?components: \[([\s\S]*?)\],?\s*\};/g)];

const layouts = [];
for (const m of layoutBlocks) {
  const id = m[2];
  const comps = [...m[3].matchAll(/{ id: "([^"]+)"(?:, position: "([^"]+)")?/g)].map((c) => ({
    id: c[1],
    position: c[2],
  }));
  layouts.push({ id, components: comps });
}

console.log(`Encontrados ${layouts.length} layouts: ${layouts.map((l) => l.id).join(", ")}`);
assert.equal(layouts.length, 6, "debe haber 6 layouts");

const REQUIRED = ["wallpaper-background", "clock"]; // todo layout arranca con estos
for (const l of layouts) {
  const ids = l.components.map((c) => c.id);
  for (const req of REQUIRED) {
    assert(ids.includes(req), `${l.id} debe incluir ${req}`);
  }
  console.log(`  ✓ ${l.id} (${l.components.length} componentes)`);
}

// Verifica que al menos 2 layouts son distintos entre sí
const sigs = new Set(layouts.map((l) => JSON.stringify(l.components)));
assert(sigs.size >= 2, "debe haber al menos 2 composiciones distintas");
console.log(`✓ ${sigs.size} composiciones distintas (≥2 esperado)`);

// Verifica que default es el original (8 componentes)
const def = layouts.find((l) => l.id === "default");
assert(def && def.components.length === 8, `default debe tener 8 componentes (tiene ${def?.components.length})`);
console.log(`✓ default tiene 8 componentes (igual al Home anterior)`);

// Verifica overlays correctos (solo appearance-settings-popover y pair-modal)
for (const l of layouts) {
  for (const c of l.components) {
    if (c.position === "overlay") {
      assert(
        c.id === "appearance-settings-popover" || c.id === "pair-modal",
        `${l.id}: ${c.id} no debería ser overlay`,
      );
    }
  }
}
console.log("✓ Solo appearance-settings-popover y pair-modal pueden ser overlays");

console.log("\n✓ Los 6 layouts son válidos y cumplen la spec");
