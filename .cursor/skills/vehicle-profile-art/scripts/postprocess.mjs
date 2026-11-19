#!/usr/bin/env node
// Crop/resize a raw showroom frame to 960x640 PNG + WebP.
// Usage:
//   node postprocess.mjs /path/to/raw.png --slug ferrari-f40-1987
//   node postprocess.mjs raw.png --slug … --dry-run
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT_W = 960;
const OUT_H = 640;
const CLASSIC = { w: 1152, h: 864, cw: 1080, ch: 720, x: 36, y: 90 };

const args = process.argv.slice(2);
if (args.length < 1 || args[0].startsWith('--')) {
  console.error('Usage: node postprocess.mjs <input> --slug <slug> [--staging <dir>] [--webp-quality 82] [--in-place] [--dry-run]');
  process.exit(2);
}

const input = path.resolve(args[0]);
const slugIdx = args.indexOf('--slug');
const slug = slugIdx >= 0 ? args[slugIdx + 1] : '';
const stagingIdx = args.indexOf('--staging');
const staging = stagingIdx >= 0 ? path.resolve(args[stagingIdx + 1]) : null;
const qIdx = args.indexOf('--webp-quality');
const quality = qIdx >= 0 ? Number(args[qIdx + 1]) : 82;
const dry = args.includes('--dry-run');
const inPlace = args.includes('--in-place');

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Need --slug as lowercase kebab (e.g. ferrari-f40-1987).');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error('Input not found: ' + input);
  process.exit(1);
}

function probe(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file,
  ], { encoding: 'utf8' }).trim();
  const [w, h] = out.split(',').map(Number);
  if (!w || !h) throw new Error('ffprobe failed on ' + file);
  return { w, h };
}

function near(a, b, tol = 32) { return Math.abs(a - b) <= tol; }

const { w, h } = probe(input);
let vf;
let postProcess;
if (near(w, CLASSIC.w) && near(h, CLASSIC.h)) {
  const x = Math.max(0, Math.round(CLASSIC.x + (w - CLASSIC.w) / 2));
  const y = Math.max(0, Math.round(CLASSIC.y + (h - CLASSIC.h) / 2));
  vf = `crop=${CLASSIC.cw}:${CLASSIC.ch}:${x}:${y},scale=${OUT_W}:${OUT_H}:flags=neighbor`;
  postProcess = `crop ${CLASSIC.cw}x${CLASSIC.ch} at (${x},${y}), nearest-neighbour resize to ${OUT_W}x${OUT_H}`;
} else {
  // Largest centred 3:2 rectangle, then neighbour scale.
  vf = `crop='min(iw\\,ih*3/2)':'min(ih\\,iw*2/3)',scale=${OUT_W}:${OUT_H}:flags=neighbor`;
  postProcess = `centre-crop to 3:2 from ${w}x${h}, nearest-neighbour resize to ${OUT_W}x${OUT_H}`;
}

const root = staging || repo;
const pngOut = path.join(root, staging ? 'car-profiles' : 'assets/car-profiles', slug + '.png');
const webpOut = path.join(root, staging ? 'cars' : 'assets/cars', slug + '.webp');

if (!inPlace && !dry) {
  if (fs.existsSync(pngOut) || fs.existsSync(webpOut)) {
    console.error('Output exists — pass --in-place to overwrite:\n  ' + pngOut + '\n  ' + webpOut);
    process.exit(1);
  }
}

console.log(`input: ${input} (${w}x${h})`);
console.log(`vf: ${vf}`);
console.log(`png: ${pngOut}`);
console.log(`webp: ${webpOut} (q=${quality})`);
console.log(`post_process: ${postProcess}`);

if (dry) process.exit(0);

fs.mkdirSync(path.dirname(pngOut), { recursive: true });
fs.mkdirSync(path.dirname(webpOut), { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-i', input, '-vf', vf, '-frames:v', '1', pngOut,
], { stdio: ['ignore', 'pipe', 'pipe'] });

execFileSync('ffmpeg', [
  '-y', '-i', pngOut, '-c:v', 'libwebp', '-quality', String(quality),
  '-frames:v', '1', webpOut,
], { stdio: ['ignore', 'pipe', 'pipe'] });

const pngSize = probe(pngOut);
const webpSize = probe(webpOut);
if (pngSize.w !== OUT_W || pngSize.h !== OUT_H || webpSize.w !== OUT_W || webpSize.h !== OUT_H) {
  console.error(`Output not ${OUT_W}x${OUT_H}: png ${pngSize.w}x${pngSize.h}, webp ${webpSize.w}x${webpSize.h}`);
  process.exit(1);
}

console.log(`OK ${slug}: ${OUT_W}x${OUT_H} png+webp`);
console.log(JSON.stringify({
  slug,
  generated_size: `${w}x${h}`,
  post_process: postProcess,
  source_png: slug + '.png',
  file: slug + '.webp',
}, null, 2));
