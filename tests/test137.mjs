// Lamination thickness (plans/hybrid-electric/drivetrain.md, stage 1).
//
// WHY THIS EXISTS. The iron-loss model already scaled eddy currents with the square of the sheet thickness, and
// every motor was 0.35 mm because the form never sent one. The form now does. What must hold:
//   · 0.20 mm loses less iron than 0.35 mm at the same torque and a high speed, and the iron costs more;
//   · at low speed the two stay close, because hysteresis does not follow the thickness;
//   · a motor built with no thickness, and the three Teslas on the default, match an explicit 0.35 mm;
//   · choosing 0.20 mm on the Model 3 and building again does those two things, and 0.35 mm puts the loss back;
//   · an old build with no evLamination key still reads as 0.35 mm.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const M3 = { rotorD: 149.9, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb', retention: 'bridges', cooling: 'jacket', inverter: 'igbt', invAmps: 953, maxRpm: 18000 };
  const bare = motorBuild(M3), thick = motorBuild(Object.assign({}, M3, { lamination: 0.35 })), thin = motorBuild(Object.assign({}, M3, { lamination: 0.2 }));
  const pt = { w: 90, r: 70 };
  const fe = (m, rpm) => motorLosses(m, 60, rpm, 350, pt).fe;
  const o = {
    hi: { bare: fe(bare, 15000), thick: fe(thick, 15000), thin: fe(thin, 15000) },
    lo: { thick: fe(thick, 500), thin: fe(thin, 500) },
    cost: { bare: bare.cost, thick: thick.cost, thin: thin.cost }
  };
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model 3/.test(p.name)));
  const base = motorLosses(engine.motor, 60, 15000, motorRatedV(engine), pt).fe;
  const baseCost = engine.motor.cost;
  document.getElementById('evLamination').value = '0.2';
  buildEngine();
  o.ui = {
    summary: /0\.20 mm|0,20 mm/.test(document.getElementById('designSummary').textContent),
    thin: motorLosses(engine.motor, 60, 15000, motorRatedV(engine), pt).fe,
    thinCost: engine.motor.cost,
    saved: engine.evLamination
  };
  document.getElementById('evLamination').value = '0.35';
  buildEngine();
  o.ui.back = motorLosses(engine.motor, 60, 15000, motorRatedV(engine), pt).fe;
  o.ui.base = base;
  o.ui.baseCost = baseCost;
  const old = Object.assign({}, engine);
  delete old.evLamination;
  applyElectricToForm(old);
  o.ui.oldSave = document.getElementById('evLamination').value;
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
console.log(`== Model 3 iron at 15000 rpm, 60 Nm: none ${f(r.hi.bare, 0)} W, 0.35 mm ${f(r.hi.thick, 0)} W, 0.20 mm ${f(r.hi.thin, 0)} W; ` +
  `at 500 rpm ${f(r.lo.thick, 0)} W vs ${f(r.lo.thin, 0)} W; cost $${r.cost.thick} vs $${r.cost.thin} ==`);
if (Math.abs(r.hi.bare - r.hi.thick) > 0.01) fails.push('a motor with no thickness does not match 0.35 mm');
if (!(r.hi.thin < r.hi.thick * 0.75)) fails.push(`0.20 mm iron loss ${f(r.hi.thin, 0)} W is not clearly under 0.35 mm ${f(r.hi.thick, 0)} W at high speed`);
if (!(r.lo.thin / r.lo.thick > 0.9)) fails.push(`at low speed 0.20 mm is ${f(100 * r.lo.thin / r.lo.thick, 0)}% of 0.35 mm: hysteresis should keep them close`);
if (!(r.cost.thin > r.cost.thick && r.cost.bare === r.cost.thick)) fails.push(`cost $${r.cost.bare} / $${r.cost.thick} / $${r.cost.thin}: the thin sheet is not dearer, or the default moved`);
console.log(`== form: 0.20 mm summary ${r.ui.summary}, loss ${f(r.ui.thin, 0)} W (was ${f(r.ui.base, 0)}), cost $${r.ui.thinCost} (was $${r.ui.baseCost}), back ${f(r.ui.back, 0)} W, old save reads ${r.ui.oldSave} ==`);
if (!r.ui.summary) fails.push('the summary does not show 0.20 mm');
if (!(r.ui.thin < r.ui.base * 0.75 && r.ui.thinCost > r.ui.baseCost)) fails.push('building the Model 3 at 0.20 mm does not cut iron loss and raise the cost');
if (Math.abs(r.ui.back - r.ui.base) > 0.01) fails.push('putting 0.35 mm back does not restore the iron loss');
if (r.ui.saved !== 0.2) fails.push('the build does not keep 0.20 mm');
if (r.ui.oldSave !== '0.35') fails.push('a build with no lamination key does not come back as 0.35 mm');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) {
  console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  '));
  process.exit(1);
}
console.log('\nOK: 0.20 mm cuts high-speed iron loss and costs more; 0.35 mm is still the default, and the old loss.');
await browser.close();
