// Batch 1: 50 combustion cars from research/vehicles-batch-1 (build 199).
//
// WHY THIS EXISTS. The research pack (its README: why these 50, the sources, the confidence of each) was turned into
// presets: 49 new engines, the Ram on the existing Cummins (on the 2019 press kit's compression and boost), 29 published
// gearboxes, three new categories (Performance SUV, Track, Pickup) and an OPEN-WHEELER chassis for the BAC Mono. Each
// boosted engine past its rating carries a factory ECU taper solved as the older presets' are (from its maker's
// torque-peak rpm, the gentlest that meets the rating). What must hold:
//   · the pack itself is sound (its validator, research/vehicles-batch-1/validate.mjs);
//   · every car is a preset with the pack's body, performance and engine geometry, loads as its factory fit with its
//     published gearbox where there is one, on its engine with no error; the new categories are in the car picker;
//   · the engine model on the maker's ratings: RMS and worst, printed, none past 25% but the two 1960s SAE gross
//     ratings (no net model meets a gross figure) and the low-confidence cars, which are reported only;
//   · the car: 0-100 with the engine matched to its rating, and the top speed, printed with their RMS; past 35% fails
//     (high and medium confidence);
//   · the fingerprint's picks by name still find the cars they always did (the batch is appended).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
// the pack's own check
try { const out = execFileSync('node', [path.join(repo, 'research/vehicles-batch-1/validate.mjs')], { encoding: 'utf8' }); console.log('== pack: ' + out.trim().split('\n').join(' | ') + ' =='); }
catch (e) { fails.push('the research pack does not validate: ' + (e.stderr || e.stdout || e.message).toString().slice(0, 300)); }
const pack = JSON.parse(fs.readFileSync(path.join(repo, 'research/vehicles-batch-1/vehicles.json'), 'utf8')).vehicles;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const r = await page.evaluate(pack => {
  const o = { cars: [], cats: { presets: PRESET_CATS.slice(), picker: FACTORY_CAR_CATS.slice() } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const v of pack) {
    const p = VEHICLE_PRESETS.find(x => x.name === v.name), c = { name: v.name, conf: v.confidence };
    if (!p) { c.missing = true; o.cars.push(c); continue; }
    const ep = PRESETS.find(e => e.name === p.engine);
    c.bodyOk = same(p.body, v.body); c.realOk = p.real.t100 === v.real.t100 && p.real.top === v.real.top && !!p.real.limited === !!v.real.limited;
    c.engineOk = !!ep && p.engine === v.engine && (v.engineStatus !== 'new' || ['cylinders', 'bore_mm', 'stroke_mm', 'compression', 'redline'].every(k => ep.engine[k] === v.enginePreset.engine[k]));
    c.chassis = p.chassis;
    try {
      loadVehiclePreset(p); setTab('vehicle');
      c.factory = isFactoryFit(readVehicleFromForm());
      const gs = GEARSETS[p.name]; c.gearsOk = !gs || same(vehicle.ratios, gs.r); c.published = !!gs;
      c.hp = engine.score.peakHP; c.rhp = ep.real.hp; c.gross = !!ep.real.gross; c.taper = ep.engine.taperRpm ? ep.engine.taperRpm + '/' + ep.engine.taperPct : '';
      c.t100 = perf.t100; c.top = perf.topSpeed; c.real = p.real;
      const k = ep.real.hp / Math.max(1, engine.score.peakHP), c0 = buildTorqueCurve, g0 = buildTorqueGrid;
      window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
      window.buildTorqueGrid = () => { const G = g0(); return Object.assign({}, G, { tq: G.tq.map(row => row.map(t => t * k)) }); };
      try { buildVehicle(); c.mT100 = perf.t100; } finally { window.buildTorqueCurve = c0; window.buildTorqueGrid = g0; buildVehicle(); }
      c.layout = engineLayoutOf(vehicle.chassis, vehicle.body);
    } catch (e) { c.err = String(e).slice(0, 160); }
    o.cars.push(c);
  }
  const pick = n => (VEHICLE_PRESETS.find(v => v.name.includes(n) || v.engine.includes(n)) || {}).name;
  o.picks = ['BMW M3 (E46', 'Golf GTI', 'TDI', 'RX-7', 'Alto', 'Z06'].map(pick);
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
}, pack);
await browser.close();

const f = (x, d = 0) => (+x).toFixed(d), pc = (a, b) => (a / b - 1) * 100;
const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));
console.log(`${'car'.padEnd(44)} conf   hp / rating        0-100 (matched) / real    top / real   taper`);
const P = [], T = [], V = [];
for (const c of r.cars) {
  if (c.missing) { fails.push(`${c.name}: not a preset`); continue; }
  if (c.err) { fails.push(`${c.name}: ${c.err}`); continue; }
  const ep = pc(c.hp, c.rhp), et = pc(c.mT100, c.real.t100), ev = pc(c.top, c.real.top), scored = c.conf !== 'low';
  console.log(`${c.name.slice(0, 44).padEnd(44)} ${c.conf.padEnd(6)} ${f(c.hp).padStart(4)} / ${f(c.rhp).padStart(4)}${c.gross ? 'g' : ' '} ${(ep >= 0 ? '+' : '') + f(ep)}%`.padEnd(78) +
    `${f(c.mT100, 2).padStart(6)} / ${f(c.real.t100, 1).padStart(4)} ${(et >= 0 ? '+' : '') + f(et)}%`.padEnd(24) + `${f(c.top).padStart(4)} / ${f(c.real.top)}${c.real.limited ? 'L' : ' '} ${(ev >= 0 ? '+' : '') + f(ev)}%`.padEnd(20) + c.taper);
  if (!c.bodyOk || !c.realOk || !c.engineOk) fails.push(`${c.name}: the preset is not the pack's (body ${c.bodyOk}, performance ${c.realOk}, engine ${c.engineOk})`);
  if (!c.factory) fails.push(`${c.name}: does not load as its factory fit`);
  if (!c.gearsOk) fails.push(`${c.name}: its published gearbox is not the one it drives`);
  if (scored && !c.gross) { P.push(ep); if (Math.abs(ep) > 25) fails.push(`${c.name}: the engine is ${f(ep)}% off its rating`); }
  if (scored) { T.push(et); V.push(ev); if (Math.abs(et) > 35) fails.push(`${c.name}: 0-100 matched ${f(et)}% off`); if (Math.abs(ev) > 35) fails.push(`${c.name}: top speed ${f(ev)}% off`); }
}
console.log(`\n== engines on their ratings: RMS ${f(rms(P), 1)}% over ${P.length} (gross and low confidence left out); 0-100 matched RMS ${f(rms(T), 1)}%, top speed RMS ${f(rms(V), 1)}% over ${T.length} ==`);
const mono = r.cars.find(c => /BAC Mono/.test(c.name));
console.log(`== categories: ${['Performance SUV', 'Track', 'Pickup'].map(k => `${k} ${r.cats.presets.includes(k) && r.cats.picker.includes(k)}`).join(', ')}; BAC Mono on ${mono.chassis}, engine ${mono.layout}; published gearboxes ${r.cars.filter(c => c.published).length} ==`);
if (!['Performance SUV', 'Track', 'Pickup'].every(k => r.cats.presets.includes(k) && r.cats.picker.includes(k))) fails.push('a new category is not in the car picker');
if (mono.chassis !== 'openwheel' || mono.layout !== 'mid') fails.push('the BAC Mono is not a mid-engined open-wheeler');
console.log(`== fingerprint picks: ${r.picks.join(' | ')} ==`);
if (r.picks.some(n => pack.some(v => v.name === n))) fails.push('a fingerprint pick by name now finds a batch car');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the 50 cars of batch 1 are in the game, each its research entry, on its factory fit and its engine.');
process.exit(fails.length || errors.length ? 1 : 0);
