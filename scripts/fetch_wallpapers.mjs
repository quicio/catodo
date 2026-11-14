#!/usr/bin/env node
// Descarga wallpapers de Wallhaven a frontend/src/wallpapers/ (evita duplicados).
// Uso: node scripts/fetch_wallpapers.mjs [n]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(HERE, "..", "frontend", "src", "wallpapers");
const COUNT = Number.parseInt(process.argv[2] ?? "4", 10) || 4;

fs.mkdirSync(DEST, { recursive: true });
const existing = new Set(
  fs
    .readdirSync(DEST)
    .filter((name) => fs.statSync(path.join(DEST, name)).isFile())
    .map((name) => name.split(".")[0]),
);

const HEADERS = { "User-Agent": "Mozilla/5.0" };
const QUERIES = [
  "dark+neon",
  "minimalist+dark",
  "cyberpunk",
  "dark+technology",
  "space+dark",
];

async function search(query) {
  const url =
    `https://wallhaven.cc/api/v1/search?q=${query}` +
    "&categories=010&purity=100&atleast=1920x1080&sorting=random";
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  return body.data ?? [];
}

let downloaded = 0;
for (const query of QUERIES) {
  if (downloaded >= COUNT) break;
  let items;
  try {
    items = await search(query);
  } catch (error) {
    console.log(`query ${query}: error ${error.message}`);
    continue;
  }
  for (const wallpaper of items) {
    if (downloaded >= COUNT) break;
    const id = wallpaper.id;
    if (existing.has(id)) continue;
    try {
      const response = await fetch(wallpaper.path, {
        headers: HEADERS,
        signal: AbortSignal.timeout(40000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const ext = wallpaper.path.split(".").pop();
      fs.writeFileSync(path.join(DEST, `${id}.${ext}`), data);
      existing.add(id);
      downloaded += 1;
      console.log(`descargado ${id}.${ext} (${data.length} bytes)`);
    } catch (error) {
      console.log(`${id}: error ${error.message}`);
    }
  }
}

console.log(`listo: ${downloaded} nuevos`);
