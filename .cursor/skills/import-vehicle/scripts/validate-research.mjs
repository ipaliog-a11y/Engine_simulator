#!/usr/bin/env node
// Validates one research vehicle.json (import-vehicle skill).
// Usage: node .cursor/skills/import-vehicle/scripts/validate-research.mjs path/to/vehicle.json
// Exit 0 when clean. No dependencies.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: validate-research.mjs <vehicle.json>');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const data = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const vehicleSrc = readFileSync(path.join(root, 'src/js/vehicle-presets.js'), 'utf8');
const engineSrc = readFileSync(path.join(root, 'src/js/engine-options-presets.js'), 'utf8');
const electricSrc = readFileSync(path.join(root, 'src/js/electric-presets.js'), 'utf8');

const existingCars = [
  ...vehicleSrc.matchAll(/name:'([^']+)'/g),
  ...electricSrc.matchAll(/name:'([^']+)'/g),
].map(m => m[1]);
const existingEngines = [
  ...engineSrc.matchAll(/name:'([^']+)'/g),
  ...electricSrc.matchAll(/name:'([^']+)'/g),
].map(m => m[1]);
const chassisKeys = [...vehicleSrc.matchAll(/^\s{2}(\w+):\s+\{label:/gm)].map(m => m[1]);

const CHASSIS = new Set(chassisKeys);
const CARS = new Set(existingCars);
const ENGINES = new Set(existingEngines);
const DRIVE = new Set(['fwd', 'rwd', 'awd']);
const TIRE = new Set(['eco', 'street', 'sport', 'semi', 'slick', 'drag', 'premium']);
const BRAKE = new Set(['steel', 'slotted', 'big', 'carbon', 'hd']);
const SUSP = new Set(['comfort', 'sport', 'coilover', 'race']);
const BOX = new Set(['manual', 'sequential', 'dct', 'auto']);
const DIFF = new Set(['open', 'visc', 'clsd', 'spool']);
const CONF = new Set(['high', 'medium', 'low']);

const errors = [];
const err = (msg) => errors.push(msg);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => num(v) && v >= lo && v <= hi;

const v = data;
const id = v.id || v.name || '(unnamed)';
if (!v.name || typeof v.name !== 'string') err('missing name');
if (v.name && CARS.has(v.name)) err(`duplicates existing FACTORY_CARS name: ${v.name}`);
if (!v.id) err('missing id');
if (!v.cat) err('missing cat');
if (!v.role) err('missing role');
if (!v.era) err('missing era');
if (!CONF.has(v.confidence)) err('confidence must be high, medium or low');
if (v.chassis != null && !CHASSIS.has(v.chassis)) err(`unknown chassis ${v.chassis}`);
if (v.chassis == null && !v.chassisSuggestion) err('chassis is null but no chassisSuggestion');
if (!['existing', 'new'].includes(v.engineStatus)) err('engineStatus must be existing or new');
if (!v.engine) err('missing engine name');
if (v.engineStatus === 'existing' && v.engine && !ENGINES.has(v.engine)) {
  err(`engineStatus existing but engine not in PRESETS: ${v.engine}`);
}
if (v.engineStatus === 'new' && v.engine && ENGINES.has(v.engine)) {
  err(`engineStatus new but name already exists: ${v.engine} (reuse with existing, or rename)`);
}

const b = v.body || {};
for (const k of ['kg', 'cd', 'area', 'wb', 'fWt']) {
  if (!num(b[k])) err(`body.${k} missing`);
}
if (num(b.kg) && !inRange(b.kg, 400, 4500)) err(`body.kg ${b.kg} out of range`);
if (num(b.cd) && !inRange(b.cd, 0.15, 0.9)) err(`body.cd ${b.cd} out of range`);
if (num(b.area) && !inRange(b.area, 0.8, 4.5)) err(`body.area ${b.area} out of range`);
if (num(b.wb) && !inRange(b.wb, 1.8, 5.0)) err(`body.wb ${b.wb} out of range`);
if (num(b.fWt) && !inRange(b.fWt, 0.3, 0.72)) err(`body.fWt ${b.fWt} out of range`);

const f = v.fit || {};
if (!DRIVE.has(f.drive)) err('fit.drive');
if (!TIRE.has(f.tire)) err('fit.tire');
if (!inRange(f.tw, 100, 360)) err('fit.tw');
if (f.twF != null && !inRange(f.twF, 100, 360)) err('fit.twF');
if (!inRange(f.ta, 20, 85)) err('fit.ta');
if (!inRange(f.wheel, 12, 24)) err('fit.wheel');
if (!BRAKE.has(f.brake)) err('fit.brake');
if (!inRange(f.rotor, 180, 450)) err('fit.rotor');
if (!SUSP.has(f.susp)) err('fit.susp');
if (!inRange(f.gears, 3, 10)) err('fit.gears');
if (!BOX.has(f.gearbox)) err('fit.gearbox');
if (!DIFF.has(f.diff)) err('fit.diff');
if (f.tc != null && typeof f.tc !== 'boolean') err('fit.tc');

const r = v.real || {};
if (!inRange(r.t100, 2, 40)) err('real.t100');
if (!inRange(r.top, 80, 450)) err('real.top');
if (r.limited != null && typeof r.limited !== 'boolean') err('real.limited');

if (!v.sources || typeof v.sources !== 'object') err('missing sources');
else {
  for (const k of ['engine', 'body', 'performance']) {
    if (!v.sources[k] || typeof v.sources[k] !== 'string') err(`sources.${k} missing`);
  }
}
if (!Array.isArray(v.unsure)) err('unsure must be an array');
if (!v.gearset || typeof v.gearset !== 'object') err('missing gearset');
else {
  if (v.gearset.r != null && !Array.isArray(v.gearset.r)) err('gearset.r must be array or null');
  if (v.gearset.r && f.gears && v.gearset.r.length !== f.gears) {
    err(`gearset.r length ${v.gearset.r.length} != fit.gears ${f.gears}`);
  }
  if (!v.gearset.src) err('gearset.src missing');
}

if (v.engineStatus === 'new') {
  const ep = v.enginePreset;
  if (!ep) err('engineStatus new requires enginePreset');
  else {
    if (ep.name !== v.engine) err('enginePreset.name must equal engine');
    const er = ep.real || {};
    for (const k of ['hp', 'hpRpm', 'tq', 'tqRpm']) if (!num(er[k])) err(`enginePreset.real.${k}`);
    const e = ep.engine || {};
    for (const k of ['cylinders', 'bore_mm', 'stroke_mm', 'compression', 'redline']) {
      if (!num(e[k])) err(`enginePreset.engine.${k}`);
    }
  }
}

if (errors.length) {
  console.error(`FAIL ${id} (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`OK ${id}: ${v.name} (${v.confidence}, chassis ${v.chassis || v.chassisSuggestion})`);
