#!/usr/bin/env node
// Genera noise.png (128x128 RGBA) determinístico para el efecto de ruido del
// canal Anime. Reemplaza el generador Python de build-static.sh.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("uso: node scripts/gen-noise.mjs <salida.png>");
  process.exit(1);
}

const W = 128;
const H = 128;

// PRNG lineal simple, semilla fija: mismo resultado en cada build.
let seed = 42;
function randomByte() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed & 0xff;
}

const raw = Buffer.alloc(H * (1 + W * 4));
let offset = 0;
for (let y = 0; y < H; y += 1) {
  raw[offset++] = 0; // filtro "none"
  for (let x = 0; x < W; x += 1) {
    const value = randomByte();
    raw[offset++] = value;
    raw[offset++] = value;
    raw[offset++] = value;
    raw[offset++] = 255;
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0; // deflate
ihdr[11] = 0; // filtro adaptativo
ihdr[12] = 0; // sin interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(target, png);
