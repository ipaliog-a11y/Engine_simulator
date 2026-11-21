#!/usr/bin/env node
// Sync assets/cars/stacks/manifest.json into src/js/car-stacks.js and verify every
// sliced strip matches width % slices === 0 before running `node tools/build.mjs`.
//
// Usage:
//   node tools/slice-cars.mjs --sync        Update CAR_STACKS in src/js/car-stacks.js from manifest.json
//   node tools/slice-cars.mjs --verify      Verify all strip PNG dimensions & manifest integrity

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STACKS_DIR = path.join(ROOT, 'assets', 'cars', 'stacks');
const MANIFEST_PATH = path.join(STACKS_DIR, 'manifest.json');
const CAR_STACKS_JS = path.join(ROOT, 'src', 'js', 'car-stacks.js');

/** Read PNG width & height directly from the 24-byte IHDR header (zero dependencies). */
function readPngSize(filePath) {
  const buf = readFileSync(filePath);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('Not a valid PNG: ' + filePath);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

if (!existsSync(MANIFEST_PATH)) {
  console.error('Missing manifest:', MANIFEST_PATH);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const cars = manifest.cars || {};
let errors = 0;

for (const [name, entry] of Object.entries(cars)) {
  const stripPath = path.join(STACKS_DIR, entry.file || `${entry.slug}.png`);
  if (!existsSync(stripPath)) {
    console.error(`  MISSING strip for ${name}: ${stripPath}`);
    errors++;
    continue;
  }
  const { width, height } = readPngSize(stripPath);
  if (width % entry.slices !== 0) {
    console.error(`  INVALID width for ${name}: ${width} % ${entry.slices} !== 0`);
    errors++;
    continue;
  }
  const sliceW = width / entry.slices;
  if (sliceW !== entry.sliceW || height !== entry.sliceL) {
    console.warn(`  Updating dimensions for ${name}: ${sliceW}x${height}`);
    entry.sliceW = sliceW;
    entry.sliceL = height;
    entry.stripW = width;
    entry.stripH = height;
  }
}

if (errors > 0) {
  console.error(`Failed with ${errors} manifest/strip error(s).`);
  process.exit(1);
}

if (process.argv.includes('--sync') || !process.argv.includes('--verify')) {
  const js = readFileSync(CAR_STACKS_JS, 'utf8');
  const lines = Object.entries(cars).map(([name, r]) => {
    const rec = {
      slug: r.slug,
      slices: r.slices,
      sliceW: r.sliceW,
      sliceL: r.sliceL,
      spacing: Number(r.sceneSpacing.toFixed(4)),
      frontAxle: Number((r.frontAxleFrac || 0.78).toFixed(4)),
      len: r.dims.len,
      w: r.dims.w,
      h: r.dims.h,
    };
    return `  ${JSON.stringify(name)}: ${JSON.stringify(rec)}`;
  });
  const block = `const CAR_STACKS = {\n${lines.join(',\n')}\n};`;
  const updated = js.replace(/const CAR_STACKS = \{[\s\S]*?\n\};/, block);
  writeFileSync(CAR_STACKS_JS, updated, 'utf8');
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Synced ${Object.keys(cars).length} verified car stack(s) into src/js/car-stacks.js`);
} else {
  console.log(`Verified ${Object.keys(cars).length} car stack strip(s) cleanly.`);
}
