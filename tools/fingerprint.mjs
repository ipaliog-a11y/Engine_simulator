#!/usr/bin/env node
// Fingerprint everything the vehicle simulators produce, to prove a refactor moved nothing.
//
//   node tools/fingerprint.mjs out.json            record this checkout's numbers
//   node tools/fingerprint.mjs --compare a.json b.json   list every number that differs, exit 1 if any
//
// WHY. The test suite checks behaviour against bands and real cars, which is right for physics but
// blind to a refactor that shifts a lap by a millisecond: every band still passes. A refactor's claim
// is stronger — not one bit moved — and only an exact comparison can check it. Built for step 1 of
// plans/hybrid-electric/ (the powertrain interface), kept for any later change that claims the same.
//
// What it records, all from the shipped index.html on the real presets:
//   - every real car: the full 0-100 / top-speed result, the mass, the engine mass, power to weight
//   - every archetype engine in the default car: the same
//   - every real car's lap of 'tech', and of 'tech' from a standing start: a SHA-256 of the whole
//     solved lap (speeds, gears, throttle, boost, rpm, brake temperatures, the replay), plus the time
//   - six cars of different kinds round Spa, likewise
//   - the race models of four cars and a three-lap race between them (seeded)
// Numbers are compared exactly: JSON keeps every double's full precision.
import { chromium } from '../tests/pw.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const args = process.argv.slice(2);

if (args[0] === '--compare') {
  const [a, b] = args.slice(1).map(f => JSON.parse(readFileSync(f, 'utf8')));
  const diffs = [];
  const walk = (x, y, at) => {
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], at ? at + '.' + k : k);
    } else if (!Object.is(x, y)) diffs.push(`${at}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
  };
  walk(a.data, b.data, '');
  if (diffs.length) {
    console.log(diffs.slice(0, 60).join('\n') + (diffs.length > 60 ? `\n… and ${diffs.length - 60} more` : ''));
    console.log(`\nFAIL: ${diffs.length} value(s) differ.`);
    process.exit(1);
  }
  console.log(`OK: identical (${a.count} values compared).`);
  process.exit(0);
}

const out = args[0];
if (!out) { console.error('usage: node tools/fingerprint.mjs out.json | --compare a.json b.json'); process.exit(2); }
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const t0 = Date.now();
const data = await page.evaluate(async () => {
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  // typed arrays serialise element by element, so a hash of the JSON covers every value in them
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  const car = () => ({ mass: vehicle.mass, engineMass: vehicle.engineMass, ptw: vehicle.powerToWeight,
    hp: engine.score && engine.score.peakHP });
  const lap = async (key, o) => { const L = simulateLap(key, o); return L ? { lap: L.lap, sha: await sha(json(L)) } : null; };
  const d = { cars: {}, archetypes: {}, spa: {}, race: {} };
  for (const p of VEHICLE_PRESETS) {
    loadVehiclePreset(p);
    d.cars[p.name] = Object.assign(car(), { accel: simulateAccel(), tech: await lap('tech'),
      techRest: await lap('tech', { fromRest: true }) });
  }
  for (const e of PRESETS.filter(x => x.cat === 'Archetypes')) {
    applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE, e.engine), tune: Object.assign({}, STD_TUNE),
      vehicle: Object.assign({}, DEFAULT_VEHICLE), name: e.name });
    d.archetypes[e.name] = Object.assign(car(), { accel: simulateAccel(), tech: await lap('tech') });
  }
  // one of each kind round a long, fast circuit: NA, turbo, VGT diesel, rotary, kei, supercharged
  const kinds = ['BMW M3 (E46', 'Golf GTI', 'TDI', 'RX-7', 'Alto', 'Z06'];
  const pick = n => VEHICLE_PRESETS.find(v => v.name.includes(n) || v.engine.includes(n));
  for (const n of kinds) { const p = pick(n); if (!p) continue; loadVehiclePreset(p); d.spa[p.name] = await lap('spa'); }
  // the race: models (fuel from BSFC, from-rest lap, the grip and fuel profiles) and three laps
  const rec = p => { const ep = PRESETS.find(e => e.name === p.engine);
    return { name: p.name, build: { engine: Object.assign({}, ep.engine), tune: Object.assign({}, STD_TUNE),
      vehicle: vehicleFromPreset(p), name: p.name } }; };
  const field = ['BMW M3 (E46', 'Golf GTI', 'TDI', 'RX-7'].map(pick).filter(Boolean);
  const ms = field.map(p => raceCarModel(rec(p), 'spa'));
  for (const M of ms) d.race[M.name] = { fuelPerLapKg: M.fuelPerLapKg, qual: M.qual, lapNom: M.lapNom, sha: await sha(json(M)) };
  const R = raceInit(ms, { track: 'spa', laps: 3, seed: 4 }); raceRun(R);
  d.race.result = { done: R.done, laps: R.cars.map(c => c.laps.map(l => l.t)), sha: await sha(json(R.cars.map(c => c.laps))) };
  return d;
});
await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
let count = 0; const tally = x => { if (x && typeof x === 'object') Object.values(x).forEach(tally); else count++; };
tally(data);
writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), count, data }, null, 1));
console.log(`  ${out}: ${count} values, ${Object.keys(data.cars).length} cars, ${Object.keys(data.archetypes).length} archetypes, ` +
  `${((Date.now() - t0) / 1000).toFixed(0)} s`);
