#!/usr/bin/env node
// Check one factory car's showroom art is wired and sized correctly.
// Usage: node validate-art.mjs "Exact Preset Name"
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const name = process.argv[2];
if (!name) {
  console.error('Usage: node validate-art.mjs "Exact Preset Name"');
  process.exit(2);
}

const fails = [];
function probe(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file,
    ], { encoding: 'utf8' }).trim();
    const [w, h] = out.split(',').map(Number);
    return { w, h };
  } catch (e) {
    return { w: 0, h: 0, err: String(e.message || e) };
  }
}

// Load CAR_ART from built index via a tiny vm-less eval of the source map is awkward
// (classic script). Read car-art.js with a regex instead — enough for the skill check.
const artSrc = fs.readFileSync(path.join(repo, 'src/js/car-art.js'), 'utf8');
const artBlock = artSrc.match(/const CAR_ART=\{([\s\S]*?)\n\};/);
if (!artBlock) fails.push('could not parse CAR_ART from src/js/car-art.js');
const slugMatch = artBlock && artBlock[1].match(new RegExp(
  "'" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':'([^']+)'"
));
const slug = slugMatch ? slugMatch[1] : null;
if (!slug) fails.push(`CAR_ART has no entry for ${JSON.stringify(name)}`);

const webp = slug && path.join(repo, 'assets/cars', slug + '.webp');
const png = slug && path.join(repo, 'assets/car-profiles', slug + '.png');
if (slug && !fs.existsSync(webp)) fails.push('missing WebP: ' + webp);
if (slug && !fs.existsSync(png)) fails.push('missing PNG: ' + png);

if (slug && fs.existsSync(webp)) {
  const s = probe(webp);
  if (s.w !== 960 || s.h !== 640) fails.push(`WebP is ${s.w}x${s.h}, want 960x640`);
}
if (slug && fs.existsSync(png)) {
  const s = probe(png);
  if (s.w !== 960 || s.h !== 640) fails.push(`PNG is ${s.w}x${s.h}, want 960x640`);
}

for (const man of ['assets/cars/manifest.json', 'assets/car-profiles/manifest.json']) {
  const p = path.join(repo, man);
  if (!fs.existsSync(p)) { fails.push('missing ' + man); continue; }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const row = data.cars && data.cars[name];
  if (!row) fails.push(`${man} has no cars[${JSON.stringify(name)}]`);
  else if (slug && row.slug && row.slug !== slug) fails.push(`${man} slug ${row.slug} ≠ CAR_ART ${slug}`);
}

if (fails.length) {
  console.log('FAIL ' + name);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`OK ${name} → ${slug} (960x640 webp+png, manifests + CAR_ART)`);
process.exit(0);
