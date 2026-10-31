// A road ECU's fuel map (build 202).
//
// WHY THIS EXISTS. The AUTO fuel map began enriching at 35% manifold pressure and reached lambda 0.93 by 70%. A road
// ECU runs closed loop at stoichiometric over almost all of its map, because the three-way catalyst only cleans up all
// three pollutants there, and leaves it only near full load to cool the exhaust. The cost fell on the hybrids: their
// controllers hold the engine at high load, exactly where the map enriched, and the Prius, the Ioniq and the Qashqai
// e-POWER burned 5-10% more on the WLTP cycle than their engines' ECUs would let them. Toyota runs the 2ZR-FXE at
// stoichiometric up to its maximum output (cooled EGR, Atkinson cycle). What must hold:
//   · a petrol ECU map is at lambda 1 from light load to 85% of full load (its own: a turbo's under part boost too);
//   · full-load enrichment only where the exhaust at lambda 1 would pass the catalyst's ~950 C (wotNeedsEnrichment),
//     and on a ported engine, whose enrichment is detonation control; never on the two Atkinson hybrid engines;
//   · the hybrids' WLTP falls from build 201's figures, toward the makers';
//   · the hybrid cycle still sustains its charge, on a target the secant alone could not reach (bisection after it).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];
// build 201's WLTP for the hybrids, and the makers' figures (L/100 km)
const BEFORE = { 'Toyota Prius (2016)': 5.12, 'Hyundai Ioniq Hybrid (2016)': 5.05, 'Nissan Qashqai e-POWER (2022)': 6.16 };
const REAL = { 'Toyota Prius (2016)': 4.14, 'Hyundai Ioniq Hybrid (2016)': 4.4, 'Nissan Qashqai e-POWER (2022)': 5.3 };

const r = await page.evaluate(() => {
  const eng = n => { const p = FACTORY_ENGINES.find(e => e.name.includes(n)); applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE, p.engine), tune: Object.assign({}, STD_TUNE), name: p.name }); return p.name; };
  const o = { engines: [] };
  for (const n of ['2ZR-FXE', 'Kappa', 'EA888 2.0 TSI (Golf GTI Mk7', 'K20C1', 'M840T twin-turbo V8 (720S', '13B-REW', 'S54']) {
    const name = eng(n), st = engine.stoichAFR, lam = (rpm, map) => mappedAFR(rpm, map) / st;
    let mid = 0;   // the furthest from lambda 1 between 60% and 80% of full load, across the range
    for (let rpm = 1500; rpm <= engine.redline * 0.9; rpm += 500) { const w = wotMapAt(rpm); for (const f of [0.6, 0.7, 0.8]) mid = Math.max(mid, Math.abs(lam(rpm, f * w) - 1)); }
    let egt = 0; for (let rpm = 1000; rpm <= engine.redline; rpm += 250) egt = Math.max(egt, egtAt(rpm, wotMapAt(rpm), 1) - 273.15);
    let rw = 1500; for (let rpm = 1500; rpm <= engine.redline; rpm += 250) if (wotMapAt(rpm) > wotMapAt(rw) + 1e-6) rw = rpm;   // where the load is highest
    o.engines.push({ name, rich: engine.wotRich, ports: !!engine.ports, mid, wot: lam(rw, wotMapAt(rw)), egt });
  }
  o.cycles = {};
  for (const n of ['Prius', 'Ioniq Hybrid', 'Qashqai e-POWER']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.includes(n))); engine._hcyc = null;
    const h = hybridCycle(vehicle); o.cycles[vehicle.body.name] = { l100: h.l100, dE: h.dSocKJ, corrected: h.corrected };
  }
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
console.log('== the AUTO map: furthest from lambda 1 at 60-80% of full load; lambda at full load where the manifold pressure peaks; full-load exhaust at lambda 1 ==');
for (const e of r.engines) {
  console.log(`  ${e.name.slice(0, 40).padEnd(40)} mid ±${f(e.mid, 3)}  WOT ${f(e.wot, 3)}  ${f(e.egt, 0)} C  -> ${e.rich ? 'enriches' : 'stays at lambda 1'}${e.ports ? ' (ported)' : ''}`);
  if (e.mid > 0.005) fails.push(`${e.name}: the map leaves lambda 1 at part load (by ${f(e.mid, 3)})`);
  if (!e.ports && e.rich !== e.egt > 950) fails.push(`${e.name}: enriches ${e.rich} with its exhaust at ${f(e.egt, 0)} C at lambda 1`);
  if (e.ports && !e.rich) fails.push(`${e.name}: a ported engine has lost its full-load enrichment`);
  if (e.rich ? !(e.wot < 0.92) : Math.abs(e.wot - 1) > 0.005) fails.push(`${e.name}: lambda ${f(e.wot, 3)} at full load`);
}
for (const n of ['2ZR-FXE', 'Kappa']) { const e = r.engines.find(x => x.name.includes(n)); if (e.rich) fails.push(`${e.name}: an Atkinson hybrid engine enriches`); }
console.log('\n== the hybrids on the WLTP cycle (L/100 km): build 201 -> now, the maker ==');
for (const [n, c] of Object.entries(r.cycles)) {
  console.log(`  ${n.padEnd(32)} ${f(BEFORE[n])} -> ${f(c.l100)}  (${REAL[n]}, ${(c.l100 / REAL[n] * 100 - 100).toFixed(1)}%)  pack ${f(c.dE, 0)} kJ${c.corrected ? ', charge-corrected' : ''}`);
  if (!(c.l100 < BEFORE[n] - 0.1)) fails.push(`${n}: the cycle did not fall from build 201's ${BEFORE[n]}`);
  if (c.corrected) fails.push(`${n}: the untuned cycle does not sustain its charge`);
}

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the AUTO map is closed loop to near full load, enriches only where the exhaust or the knock needs it, and the hybrids burn what their ECUs let them.');
process.exit(fails.length || errors.length ? 1 : 0);
