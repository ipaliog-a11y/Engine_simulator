// Consumption over the WLTP cycle (build 184, step 2.5c of plans/hybrid-electric/).
//
// WHY THIS EXISTS. An electric car's energy per km is derived from the same drive the 0-100 and the lap run, driven
// round the WLTC class 3b cycle second by second (src/js/electric-cycle.js). Nothing in it was set from a consumption
// figure. What must hold:
//   · the cycle is the regulation's: 1800 s, 23.27 km, 131.3 km/h at the most, the table's checksum;
//   · the three Teslas against their WLTP figures (EV Database): the vehicle-side figure (the pack's energy, which the
//     model computes) for the Model 3 SR+ LFP 117 Wh/km, the Model Y Long Range AWD 138, the Model S Plaid 158; and
//     at the socket, the rated 142, 169 and 187;
//   · what moves it moves it the right way: without regeneration more, with more drag more, heavier more; the Model Y's
//     induction front motor costs almost nothing on the cycle (it is left unpowered);
//   · the VEHICLE tab shows it for an electric car, and an engine's summary does not change.
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

const r = await page.evaluate(() => {
  const o = { cycle: { n: WLTC_3B.length, sum: WLTC_3B.reduce((a, x) => a + x, 0) / 10, max: Math.max(...WLTC_3B) / 10 }, cars: [] };
  for (const p of EV_VEHICLE_PRESETS) {
    loadVehiclePreset(p);
    const c = evCycle(engine, vehicle);
    o.cars.push({ name: p.name, whkm: c.whkm, wall: c.wall, regen: c.regen, range: c.range, km: c.km,
      line: (document.getElementById('vehicleSummary').textContent.match(/WLTP cycle[^•]*/) || [''])[0] });
    if (/Model Y/.test(p.name)) {
      // what moves it: no regeneration, more drag, more mass, and no front motor
      const fresh = () => { engine._cycle = null; return evCycle(engine, vehicle).whkm; };
      const base = fresh();
      const real = window.evRegenTable; window.evRegenTable = (e, rl) => real(e, rl).map(() => 0);
      const noRegen = fresh(); window.evRegenTable = real;
      const cd = vehicle.cdA; vehicle.cdA = cd * 1.2; const drag = fresh(); vehicle.cdA = cd;
      const kg = vehicle.mass; vehicle.mass = kg + 300; const heavy = fresh(); vehicle.mass = kg;
      const mot = engine.motor; engine.motor = mot.parts[0].m; const rearOnly = fresh(); engine.motor = mot; fresh();
      o.moves = { base, noRegen, drag, heavy, rearOnly };
    }
  }
  // an engine: no cycle line
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  o.ice = /WLTP cycle/.test(document.getElementById('vehicleSummary').textContent);
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

const Cy = r.cycle;
console.log(`== WLTC class 3b: ${Cy.n} points, ${f(Cy.sum)} (checksum 83758.6), ${f(Cy.max)} km/h at the most, ${f(r.cars[0].km, 3)} km ==`);
if (Cy.n !== 1801 || Math.abs(Cy.sum - 83758.6) > 0.05 || Cy.max !== 131.3 || Math.abs(r.cars[0].km - 23.266) > 0.01) fails.push('the cycle is not the WLTC class 3b');

const ref = [['Model 3', 117, 142, 448], ['Model Y', 138, 169, 533], ['Plaid', 158, 187, 600]];
for (const [k, veh, rated, wltpRange] of ref) {
  const c = r.cars.find(x => x.name.includes(k));
  console.log(`== ${c.name}: ${f(c.whkm)} Wh/km from the pack (WLTP vehicle-side ${veh}, ${f(pct(c.whkm, veh))}%), ${f(c.wall)} at the socket ` +
    `(rated ${rated}, ${f(pct(c.wall, rated))}%); regeneration takes back ${f(c.regen)}; range ${f(c.range, 0)} km (WLTP ${wltpRange}) ==`);
  if (Math.abs(pct(c.whkm, veh)) > 8) fails.push(`${c.name}: ${f(c.whkm)} Wh/km against the vehicle-side ${veh}`);
  if (Math.abs(pct(c.wall, rated)) > 8) fails.push(`${c.name}: ${f(c.wall)} Wh/km at the socket against the rated ${rated}`);
  if (!/Wh\/km/.test(c.line)) fails.push(`${c.name}: the VEHICLE tab does not show the cycle`);
}
const M = r.moves;
console.log(`== Model Y: ${f(M.base)} Wh/km; without regeneration ${f(M.noRegen)}; drag +20% ${f(M.drag)}; +300 kg ${f(M.heavy)}; rear motor alone ${f(M.rearOnly)} ==`);
if (!(M.noRegen > M.base * 1.15)) fails.push('regeneration does not save energy on the cycle');
if (!(M.drag > M.base * 1.04 && M.heavy > M.base * 1.04)) fails.push('drag or mass do not cost energy');
if (!(Math.abs(M.base - M.rearOnly) < M.base * 0.03)) fails.push('the idle induction front motor costs more than a few percent on the cycle');
if (r.ice) fails.push('an engine\'s VEHICLE summary shows an electric cycle');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the WLTP cycle, driven through the electric drive, gives the three Teslas\' homologated consumption.');
process.exit(fails.length || errors.length ? 1 : 0);
