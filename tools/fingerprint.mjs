#!/usr/bin/env node
// Fingerprint everything the vehicle simulators produce, to prove a refactor moved nothing.
//
//   node tools/fingerprint.mjs out.json            record this checkout's numbers
//   node tools/fingerprint.mjs --compare a.json b.json   list every number that differs, exit 1 if any
//   node tools/fingerprint.mjs --only=electric out.json  record only the electric and hybrid cars (about 30 s)
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
//   - every electric and hybrid car (build 231): the drive's score, the pack (and its power warm and cold), the
//     WLTP cycle, the 0-100 and top speed, and a lap of 'tech'
// Numbers are compared exactly: JSON keeps every double's full precision. The one exception is the electric drive's
// score, hashed at 6 significant digits: its best-efficiency point varies from the 9th digit between runs of the same page.
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

const only = (args.find(a => a.startsWith('--only=')) || '').slice(7) || null;
const out = args.find(a => !a.startsWith('--'));
if (!out) { console.error('usage: node tools/fingerprint.mjs [--only=electric] out.json | --compare a.json b.json'); process.exit(2); }
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const t0 = Date.now();
const data = await page.evaluate(async (only) => {
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  // typed arrays serialise element by element, so a hash of the JSON covers every value in them
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  const car = () => ({ mass: vehicle.mass, engineMass: vehicle.engineMass, ptw: vehicle.powerToWeight,
    hp: engine.score && engine.score.peakHP });
  const lap = async (key, o) => { const L = simulateLap(key, o); return L ? { lap: L.lap, sha: await sha(json(L)) } : null; };
  const d = { cars: {}, archetypes: {}, spa: {}, race: {} };
  if (only !== 'electric') {
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
  }
  // the electric and hybrid cars (since build 231): the drive's score, the pack, the cycle, the road and a lap. The
  // combustion walk above never reaches electric.js, so until then a change there came back "identical" whatever it moved.
  d.electric = {};
  // a lap's result points at the track, and the track caches the racing line of every car solved before: hashed with
  // it, a lap would depend on what ran first. The electric section hashes the lap without it (the sections above keep
  // their hash, so older recordings still compare).
  // The electric score's best-efficiency point varies from the 9th digit between runs of the same page (on the Model 3: the torque
  // there 163.1725194 or 163.1725196 Nm), so it is hashed at 6 significant digits. Named in build 231's CHANGELOG.
  const round6 = x => JSON.parse(JSON.stringify(x, (k, v) => typeof v === 'number' && isFinite(v) && v !== 0 ? +v.toPrecision(6) : v));
  const lapNoTrack = async key => { const L = simulateLap(key); return L ? { lap: L.lap, sha: await sha(json(Object.assign({}, L, { track: undefined }))) } : null; };
  for (const p of EV_VEHICLE_PRESETS.concat(HYB_VEHICLE_PRESETS)) {
    loadVehiclePreset(p); engine._cycle = null; engine._hcyc = null;
    const ev = engine.type === 'electric', pk = engine.pack || (engine.hy && engine.hy.pack) || null;
    const pack = pk ? { R: pk.R, kWh: pk.kWh, Vnom: pk.Vnom, mass: pk.mass,
      // the pack at half charge, warm and cold: what a temperature model (packR) moves
      pMax: [25, 0, -10].map(t => packMaxPower(pk, 0.5, t)),
      pCharge: typeof packChargePower === 'function' ? [25, 0, -10].map(t => packChargePower(pk, 0.5, t)) : null } : null;
    const cyc = ev ? evCycle(engine, vehicle) : (typeof hybridCycle === 'function' ? hybridCycle(vehicle) : null);
    d.electric[p.name] = Object.assign(car(), { score: await sha(json(round6(engine.score))), pack,
      cycle: cyc ? { whkm: cyc.whkm, lPer100: cyc.l100 != null ? cyc.l100 : cyc.lPer100, sha: await sha(json(cyc)) } : null,
      accel: simulateAccel(), tech: await lapNoTrack('tech') });
  }
  return d;
}, only);
await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
let count = 0; const tally = x => { if (x && typeof x === 'object') Object.values(x).forEach(tally); else count++; };
tally(data);
writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), count, data }, null, 1));
console.log(`  ${out}: ${count} values, ${Object.keys(data.cars).length} cars, ${Object.keys(data.archetypes).length} archetypes, ${Object.keys(data.electric || {}).length} electric and hybrid, ` +
  `${((Date.now() - t0) / 1000).toFixed(0)} s`);
