// An engine's fuel over the WLTP cycle (build 187, step 3.2a of plans/hybrid-electric/).
//
// WHY THIS EXISTS. Every combustion car now has a WLTP consumption, derived as the electric cars' is (build 184): the
// WLTC class 3b trace driven second by second, each second in the gear that burns least, the fuel read off the engine's
// own steady-state map (src/js/fuel-cycle.js), with the cold start derived from the engine's warm-up (the model's
// friction knows the oil's temperature). Nothing in it was set from a consumption figure. What must hold:
//   · four cars of the game against their WLTP combined figures (the regulation's cycle, so like for like): the Toyota
//     GR Yaris 8.2 L/100 km (manual, 261 PS), the Honda Civic Type R FK8 8.2-8.8 (by market and year), the Audi RS3
//     Sportback 8V 8.3-8.5, the McLaren 720S 23.2 mpg (UK) = 12.2; each within 15% and the set within 12% RMS;
//   · what moves it moves it the right way: a hot start burns less than the cold one the test runs, a heavier car more;
//   · the VEHICLE tab gives an engine its L/100 km and CO2, an electric car its Wh/km, and neither the other's.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const REF = [['Toyota GR Yaris (2020)', 8.2, '8.2'], ['Honda Civic Type R (FK8, 2017)', 8.5, '8.2-8.8'], ['Audi RS3 Sportback (8V, 2017)', 8.4, '8.3-8.5'],
  ['McLaren 720S (2017)', 12.2, '12.2 (23.2 mpg UK)']];
const r = await page.evaluate(REF => {
  const o = { cars: [] };
  for (const [n] of REF) {
    loadVehiclePreset(FACTORY_CARS.find(p => p.name === n));
    const t0 = performance.now(), c = engineCycle(vehicle), ms = performance.now() - t0;
    o.cars.push({ n, l100: c.l100, co2: c.co2, gear: c.meanGear, warm: c.warmS, ms,
      line: (document.getElementById('vehicleSummary').textContent.match(/WLTP cycle[^•]*•[^•A-Z]*/) || [''])[0] });
    if (/GR Yaris/.test(n)) {
      const C = FUEL_CYCLE, s0 = C.soak; C.soak = 95; const hot = engineCycle(vehicle).l100; C.soak = s0;
      const kg = vehicle.mass; vehicle.mass = kg + 300; const heavy = engineCycle(vehicle).l100; vehicle.mass = kg;
      // the map's best: the least fuel per kWh anywhere on the warm map
      const M = engineFuelMap(95); let best = 1e9;
      M.rpms.forEach((rpm, i) => M.tq[i].forEach((t, j) => { const P = t * rpm * Math.PI / 30; if (P > 5000 && isFinite(M.fg[i][j])) best = Math.min(best, M.fg[i][j] / P * 3.6e6); }));
      o.yaris = { hot, heavy, best };
    }
  }
  loadVehiclePreset(EV_VEHICLE_PRESETS[0]);
  const ev = document.getElementById('vehicleSummary').textContent;
  o.ev = { wh: /Wh\/km/.test(ev), l: /L\/100 km/.test(ev) };
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
}, REF);
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

const errs = [];
r.cars.forEach((c, k) => {
  const [n, ref, txt] = REF[k], e = pct(c.l100, ref); errs.push(e);
  console.log(`== ${n}: ${f(c.l100, 2)} L/100 km (WLTP ${txt}, ${e > 0 ? '+' : ''}${f(e)}%), ${Math.round(c.co2)} g/km, mean gear ${f(c.gear, 1)}, warm at ${c.warm} s, ${Math.round(c.ms)} ms ==`);
  if (Math.abs(e) > 15) fails.push(`${n}: ${f(c.l100, 2)} L/100 km against ${txt}`);
  if (!/L\/100 km/.test(c.line)) fails.push(`${n}: the VEHICLE tab does not give its L/100 km`);
  if (c.ms > 3000) fails.push(`${n}: the cycle took ${Math.round(c.ms)} ms`);
});
const rms = Math.sqrt(errs.reduce((a, x) => a + x * x, 0) / errs.length);
console.log(`== RMS ${f(rms)}% over ${errs.length} cars ==`);
if (rms > 12) fails.push(`RMS ${f(rms)}% over the WLTP references`);
const Y = r.yaris, cold = r.cars[0].l100;
console.log(`== GR Yaris: cold start ${f(cold, 2)}, hot start ${f(Y.hot, 2)} (+${f(pct(cold, Y.hot))}% for the cold); +300 kg ${f(Y.heavy, 2)}; best BSFC on its map ${Math.round(Y.best)} g/kWh ==`);
if (!(pct(cold, Y.hot) > 3 && pct(cold, Y.hot) < 20)) fails.push('the cold start does not cost what a WLTP cold start costs (3-20%)');
if (!(Y.heavy > cold * 1.04)) fails.push('a heavier car does not burn more');
if (!(Y.best > 200 && Y.best < 300)) fails.push(`a best BSFC of ${Math.round(Y.best)} g/kWh is not a petrol engine's`);
console.log(`== an electric car's summary: Wh/km ${r.ev.wh}, L/100 km ${r.ev.l} ==`);
if (!r.ev.wh || r.ev.l) fails.push('an electric car shows a fuel figure');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: an engine\'s WLTP fuel, cold start and all, from its own map, against four cars\' homologated figures.');
process.exit(fails.length || errors.length ? 1 : 0);
