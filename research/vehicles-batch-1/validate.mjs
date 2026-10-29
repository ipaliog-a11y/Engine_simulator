#!/usr/bin/env node
// Checks research/vehicles-batch-1/vehicles.json against the preset field names and
// against the cars and engines already in src/js. No dependencies. Exits 0 when clean.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(readFileSync(path.join(root, 'research/vehicles-batch-1/vehicles.json'), 'utf8'));
const vehicleSrc = readFileSync(path.join(root, 'src/js/vehicle-presets.js'), 'utf8');
const engineSrc = readFileSync(path.join(root, 'src/js/engine-options-presets.js'), 'utf8');

const existingCars = [...vehicleSrc.matchAll(/name:'([^']+)'/g)].map(m => m[1]);
const existingEngines = [...engineSrc.matchAll(/name:'([^']+)'/g)].map(m => m[1]);
const chassisKeys = [...vehicleSrc.matchAll(/^\s{2}(\w+):\s+\{label:/gm)].map(m => m[1]);

const CHASSIS = new Set(chassisKeys);
const CARS = new Set(existingCars);
const ENGINES = new Set(existingEngines);
const DRIVE = new Set(['fwd', 'rwd', 'awd']);
const TIRE = new Set(['eco', 'street', 'sport', 'semi', 'slick', 'drag']);
const BRAKE = new Set(['steel', 'slotted', 'big', 'carbon', 'hd']);
const SUSP = new Set(['comfort', 'sport', 'coilover', 'race']);
const BOX = new Set(['manual', 'sequential', 'dct', 'auto']);
const DIFF = new Set(['open', 'visc', 'clsd', 'spool']);
const LAYOUT = new Set(['inline', 'v', 'boxer']);
const INTAKE = new Set(['na', 'turbo', 'supercharger']);
const INTAKE_SYS = new Set(['carb1', 'carb2', 'carb4', 'sidedraft', 'mech', 'efi', 'itb']);
const TYPE = new Set(['petrol4', 'diesel', 'rotary', 'twostroke']);
const CONF = new Set(['high', 'medium', 'low']);

const errors = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => num(v) && v >= lo && v <= hi;

if (!data || !Array.isArray(data.vehicles)) err('file', 'vehicles must be an array');
const list = data.vehicles || [];
if (list.length !== 50) err('file', `expected 50 vehicles, found ${list.length}`);

const names = new Set();
const engineNames = new Set();
let newEngines = 0;
let existingEnginesUsed = 0;

for (const v of list) {
  const id = v.id || v.name || '(unnamed)';
  if (!v.name || typeof v.name !== 'string') err(id, 'missing name');
  if (names.has(v.name)) err(id, 'duplicate name in this batch');
  names.add(v.name);
  if (CARS.has(v.name)) err(id, 'duplicates an existing VEHICLE_PRESETS name');
  if (!v.cat) err(id, 'missing cat');
  if (!v.role) err(id, 'missing role');
  if (!CONF.has(v.confidence)) err(id, 'confidence must be high, medium or low');
  if (v.chassis != null && !CHASSIS.has(v.chassis)) err(id, `unknown chassis ${v.chassis}`);
  if (v.chassis == null && !v.chassisSuggestion) err(id, 'chassis is null but no chassisSuggestion');
  if (!['existing', 'new'].includes(v.engineStatus)) err(id, 'engineStatus must be existing or new');
  if (!v.engine) err(id, 'missing engine name');

  const b = v.body || {};
  for (const k of ['kg', 'cd', 'area', 'wb', 'fWt']) {
    if (!num(b[k])) err(id, `body.${k} missing`);
  }
  if (num(b.kg) && !inRange(b.kg, 400, 4500)) err(id, `body.kg ${b.kg} out of range`);
  if (num(b.cd) && !inRange(b.cd, 0.2, 0.9)) err(id, `body.cd ${b.cd} out of range`);
  if (num(b.area) && !inRange(b.area, 0.8, 4.5)) err(id, `body.area ${b.area} out of range`);
  if (num(b.wb) && !inRange(b.wb, 1.8, 5.0)) err(id, `body.wb ${b.wb} out of range`);
  if (num(b.fWt) && !inRange(b.fWt, 0.3, 0.72)) err(id, `body.fWt ${b.fWt} out of range`);

  const f = v.fit || {};
  if (!DRIVE.has(f.drive)) err(id, 'fit.drive');
  if (!TIRE.has(f.tire)) err(id, 'fit.tire');
  if (!inRange(f.tw, 100, 360)) err(id, 'fit.tw');
  if (f.twF != null && !inRange(f.twF, 100, 360)) err(id, 'fit.twF');
  if (!inRange(f.ta, 20, 85)) err(id, 'fit.ta');
  if (!inRange(f.wheel, 12, 24)) err(id, 'fit.wheel');
  if (!BRAKE.has(f.brake)) err(id, 'fit.brake');
  if (!inRange(f.rotor, 180, 450)) err(id, 'fit.rotor');
  if (!SUSP.has(f.susp)) err(id, 'fit.susp');
  if (!inRange(f.gears, 3, 10)) err(id, 'fit.gears');
  if (!BOX.has(f.gearbox)) err(id, 'fit.gearbox');
  if (!DIFF.has(f.diff)) err(id, 'fit.diff');
  if (f.tc != null && typeof f.tc !== 'boolean') err(id, 'fit.tc');

  const r = v.real || {};
  if (!inRange(r.t100, 2, 40)) err(id, 'real.t100');
  if (!inRange(r.top, 80, 400)) err(id, 'real.top');
  if (r.limited != null && typeof r.limited !== 'boolean') err(id, 'real.limited');

  if (!v.sources || typeof v.sources !== 'object') err(id, 'missing sources');
  else {
    for (const k of ['engine', 'body', 'performance']) {
      if (!v.sources[k] || typeof v.sources[k] !== 'string') err(id, `sources.${k} missing`);
    }
  }
  if (!Array.isArray(v.unsure)) err(id, 'unsure must be an array');
  if (!v.gearset || typeof v.gearset.src !== 'string') err(id, 'gearset.src missing');
  if (v.gearset && v.gearset.r != null) {
    if (!Array.isArray(v.gearset.r) || v.gearset.r.length !== f.gears) err(id, 'gearset.r length must equal fit.gears');
    else if (v.gearset.r.some(x => !inRange(x, 0.3, 6.5))) err(id, 'gear ratio out of range');
  }
  if (v.gearset && v.gearset.fd != null && !inRange(v.gearset.fd, 1.5, 7)) err(id, 'gearset.fd out of range');

  if (/\bhybrid\b/i.test(v.name) || /\bhybrid\b/i.test(v.engine || '')) err(id, 'hybrid in the car or engine name');

  if (v.engineStatus === 'existing') {
    existingEnginesUsed++;
    if (!ENGINES.has(v.engine)) err(id, `existing engine not in PRESETS: ${v.engine}`);
    if (v.enginePreset) err(id, 'existing engine must not also carry a new enginePreset');
  } else {
    newEngines++;
    const p = v.enginePreset;
    if (!p) err(id, 'new engine missing enginePreset');
    else {
      if (p.name !== v.engine) err(id, 'enginePreset.name must match engine');
      if (ENGINES.has(p.name)) err(id, 'new engine name collides with PRESETS');
      if (engineNames.has(p.name)) err(id, 'duplicate new engine name');
      engineNames.add(p.name);
      if (!p.cat) err(id, 'enginePreset.cat');
      const er = p.real || {};
      if (!inRange(er.hp, 15, 900)) err(id, 'engine real.hp');
      if (!inRange(er.hpRpm, 2000, 10000)) err(id, 'engine real.hpRpm');
      if (!inRange(er.tq, 30, 2000)) err(id, 'engine real.tq');
      if (!inRange(er.tqRpm, 800, 9500)) err(id, 'engine real.tqRpm');
      if (!Array.isArray(p.unsure)) err(id, 'enginePreset.unsure');
      const e = p.engine || {};
      if (!inRange(e.cylinders, 2, 12)) err(id, 'cylinders');
      if (!inRange(e.bore_mm, 50, 120)) err(id, 'bore_mm');
      if (!inRange(e.stroke_mm, 40, 140)) err(id, 'stroke_mm');
      if (!inRange(e.compression, 6, 25)) err(id, 'compression');
      if (!inRange(e.redline, 3000, 12000)) err(id, 'redline');
      if (e.layout && !LAYOUT.has(e.layout)) err(id, 'layout');
      if (e.intake && !INTAKE.has(e.intake)) err(id, 'intake');
      if (e.intakeSys && !INTAKE_SYS.has(e.intakeSys)) err(id, 'intakeSys');
      if (e.type && !TYPE.has(e.type)) err(id, 'type');
      if (e.intake === 'turbo' || e.intake === 'supercharger') {
        if (!inRange(e.boost_bar, 0.2, 3.5)) err(id, 'boost_bar');
      }
      const cc = Math.PI * (e.bore_mm / 2) ** 2 * e.stroke_mm * e.cylinders / 1000;
      if (num(e.bore_mm) && Math.abs(cc - (p.displacement_cc || cc)) / cc > 0.04 && p.displacement_cc) {
        err(id, `displacement ${p.displacement_cc} cc disagrees with bore/stroke (${cc.toFixed(0)})`);
      }
    }
  }
}

if (data.meta && data.meta.newEngineCount != null && data.meta.newEngineCount !== newEngines) {
  err('meta', `newEngineCount ${data.meta.newEngineCount} != counted ${newEngines}`);
}

const low = list.filter(v => v.confidence === 'low').map(v => v.name);
console.log(`vehicles ${list.length}  new engines ${newEngines}  existing engines ${existingEnginesUsed}`);
console.log(`low confidence ${low.length}: ${low.join('; ') || '(none)'}`);
if (errors.length) {
  console.error(`FAIL: ${errors.length}`);
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
}
console.log('OK');
