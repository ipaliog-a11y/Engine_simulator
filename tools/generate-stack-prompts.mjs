#!/usr/bin/env node
// Generate 1x4 orthographic sprite-stacking prompts for all 100 factory cars in
// assets/cars/manifest.json + src/js/car-dimensions.js.
//
// Usage:
//   node tools/generate-stack-prompts.mjs
//   node tools/generate-stack-prompts.mjs --batch 1
//   node tools/generate-stack-prompts.mjs --slug honda-s2000-ap1-2000

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST_IN = path.join(ROOT, 'assets', 'cars', 'manifest.json');
const DIMS_IN = path.join(ROOT, 'src', 'js', 'car-dimensions.js');
const STACKS_DIR = path.join(ROOT, 'assets', 'cars', 'stacks');
const OUT_FILE = path.join(STACKS_DIR, 'prompts.json');

const args = process.argv.slice(2);
const batchArg = args.includes('--batch') ? Number(args[args.indexOf('--batch') + 1]) : null;
const slugArg = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;

const showroom = JSON.parse(readFileSync(MANIFEST_IN, 'utf8'));
const dimsSrc = readFileSync(DIMS_IN, 'utf8');
const dimsMatch = dimsSrc.match(/const\s+CAR_DIMS\s*=\s*(\{[\s\S]*?\n\});/);
const CAR_DIMS = dimsMatch ? Function('return ' + dimsMatch[1])() : {};

function extractSubject(prompt, fallback) {
  let s = String(prompt || '').trim();
  s = s.replace(/^8-bit pixel-art side profile of (?:an?|the)\s+/i, '');
  const cut = s.search(/\.\s*Accurate body shape/i);
  if (cut !== -1) s = s.slice(0, cut);
  return s.replace(/\.$/, '').trim() || fallback;
}

function buildPrompt(subject, dims) {
  return (
    `Chunky pixel art orthographic model sheet of a ${subject}, accurate body shape and proportions for this exact model and generation (length ${dims.len.toFixed(2)}m, width ${dims.w.toFixed(2)}m, height ${dims.h.toFixed(2)}m), with rich 3-tone hue-shifted pixel shading (deep cool-shifted shadows, saturated midtones, bright warm top highlights along ridges and edges), bold 3-4px stripes/accents, and crisp specular pixels on glass. Four views in a clean 1x4 horizontal row on a completely flat solid white background:\n` +
    `1. TOP view looking straight down, front pointing DOWN.\n` +
    `2. SIDE view, front pointing LEFT.\n` +
    `3. FRONT view.\n` +
    `4. BACK view.\n` +
    `Strictly orthographic: zero perspective, zero tilt, zero 3/4 angle. Identical scale across all four views so length, width, and height match pixel for pixel. Bold 1px dark outline around each view, solid flat color clusters, crisp internal panel shading, zero anti-aliasing, zero soft edges, zero cast ground shadows, zero grid lines, zero text, generous empty space between views.`
  );
}

const entries = Object.entries(showroom.cars || {}).map(([name, info], idx) => {
  const d = CAR_DIMS[name] || {};
  const dims = { len: Number((d.len || 4.35).toFixed(3)), w: Number((d.w || 1.8).toFixed(3)), h: Number((d.h || 1.35).toFixed(3)) };
  const subject = extractSubject(info.prompt, name);
  const viewsFile = path.join(STACKS_DIR, `${info.slug}.views.png`);
  const stripFile = path.join(STACKS_DIR, `${info.slug}.png`);
  const status = existsSync(stripFile) ? 'sliced' : existsSync(viewsFile) ? 'sheeted' : 'pending';
  return {
    index: idx + 1,
    batch: Math.floor(idx / 10) + 1,
    name,
    slug: info.slug,
    dims,
    recommendedSlices: dims.h >= 1.65 ? 26 : dims.h >= 1.42 ? 24 : dims.h <= 1.18 ? 20 : 22,
    status,
    prompt: buildPrompt(subject, dims),
  };
});

mkdirSync(STACKS_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), total: entries.length, cars: entries }, null, 2) + '\n');

if (slugArg) {
  const hit = entries.find((e) => e.slug === slugArg);
  if (!hit) { console.error('Unknown slug:', slugArg); process.exit(1); }
  console.log(`# [${hit.index}] ${hit.name} (${hit.slug}) — ${hit.status}\n\n${hit.prompt}\n`);
} else if (batchArg) {
  const list = entries.filter((e) => e.batch === batchArg);
  for (const e of list) {
    console.log(`=== [${e.index}] ${e.name} (${e.slug}) [${e.status}] ===\n${e.prompt}\n`);
  }
} else {
  const counts = { sliced: 0, sheeted: 0, pending: 0 };
  for (const e of entries) counts[e.status]++;
  console.log(`Wrote ${OUT_FILE} (${entries.length} cars: ${counts.sliced} sliced, ${counts.sheeted} sheeted, ${counts.pending} pending)`);
}
