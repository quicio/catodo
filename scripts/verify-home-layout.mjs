#!/usr/bin/env node
// Verifica que el layout default del Home contiene los slots esperados
// en el orden esperado. Lee el archivo directamente, sin Vite ni React.
// Uso: node scripts/verify-home-layout.mjs
import { strict as assert } from "node:assert";

const { DEFAULT_LAYOUT } = await import("../frontend/src/components/home/layouts.ts").catch(() => ({}));

// Si el import directo falla (porque layouts.ts importa types de TS), fallback:
// parseamos el archivo y comparamos contra la spec.
let layout = DEFAULT_LAYOUT;
if (!layout) {
  console.log("(import directo no disponible — parseando layouts.ts)");
  const fs = await import("node:fs");
  const src = fs.readFileSync("../frontend/src/components/home/layouts.ts", "utf8");
  const idsMatch = src.match(/components:\s*\[([^\]]+)\]/s);
  assert(idsMatch, "no se encontró la lista components");
  const ids = [...idsMatch[1].matchAll(/{ id: "([^"]+)"(?:, position: "([^"]+)")?/g)].map((m) => ({
    id: m[1],
    position: m[2],
  }));
  layout = { layoutId: "default", components: ids };
}

const EXPECTED = [
  "wallpaper-background",
  "clock",
  "mini-now-playing",
  "brand",
  "channel-grid",
  "settings-button",
];

console.log("DEFAULT_LAYOUT.layoutId:", layout.layoutId);
console.log("components:", layout.components.length, "esperados:", EXPECTED.length);

assert.equal(layout.layoutId, "default", "layoutId debe ser 'default'");
assert.equal(layout.components.length, EXPECTED.length, "debe tener 6 componentes root");

let ok = true;
for (let i = 0; i < EXPECTED.length; i++) {
  const got = layout.components[i]?.id;
  const want = EXPECTED[i];
  if (got !== want) {
    console.error(`  ✗ posición ${i}: esperado '${want}', obtuvo '${got}'`);
    ok = false;
  } else {
    console.log(`  ✓ ${i + 1}. ${want}`);
  }
}

// appearance-settings-popover y pair-modal se renderizan siempre desde Home,
// fuera del layout (ver comentario en layouts.ts / Home.tsx).
assert(ok, "layout default no coincide con la spec");
console.log("\n✓ DEFAULT_LAYOUT válido y equivalente al Home actual");
