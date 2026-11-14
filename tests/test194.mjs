// The stator's outside diameter as a part (build 314).
//
// WHY THIS EXISTS. Every motor's stator was the bore over 0.67 (MOTOR.statorShape). It is now a design input. What must hold:
//   · a wider stator gives deeper slots: more copper, less resistance, a lower current density, more mass;
//   · a design that names no diameter (saved before build 314) gets the old bore over 0.67, in the build and in the form;
//   · every factory motor names its own (rear and front), and the Model 3's is its teardown's 225 mm.
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

const r = await page.evaluate(() => {
  const M3 = { rotorD: 150, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb', retention: 'bridges', cooling: 'jacket', inverter: 'igbt', invAmps: 850, maxRpm: 18000 };
  const at = od => { const m = motorBuild(Object.assign({}, M3, od ? { statorOD: od } : {})); return { OD: m.OD * 1000, slot: m.hSlot * 1000, R: m.R20 * 1000, J: m.Jpk / 1e6, mass: m.mass }; };
  const all = [...EV_ENGINE_PRESETS, ...HYB_ENGINE_PRESETS].map(p => p.engine);
  applyElectricToForm({ evRotorD: 200 });
  return { small: at(210), m3: at(225), big: at(260), none: at(0), formFill: +document.getElementById('evStatorOD').value,
    missing: all.filter(e => !(e.evStatorOD > 0) || ((e.evFront === 'pm' || e.evFront === 'im') && !(e.evFrontOD > 0))).length,
    m3preset: EV_ENGINE_PRESETS[0].engine.evStatorOD };
});
const f = x => `OD ${x.OD.toFixed(0)} slot ${x.slot.toFixed(1)} mm R ${x.R.toFixed(2)} mOhm J ${x.J.toFixed(1)} A/mm² ${x.mass.toFixed(1)} kg`;
for (const k of ['small', 'm3', 'big', 'none']) console.log(`== ${k}: ${f(r[k])} ==`);
if (!(r.small.slot < r.m3.slot && r.m3.slot < r.big.slot)) fails.push('a wider stator does not deepen the slot');
if (!(r.small.R > r.m3.R && r.m3.R > r.big.R && r.small.J > r.big.J)) fails.push('a wider stator does not lower the resistance and current density');
if (!(r.big.mass > r.small.mass)) fails.push('a wider stator is not heavier');
if (Math.abs(r.none.OD - 151.4 / 0.67) > 0.01) fails.push('a design with no diameter is not the bore over 0.67');
console.log(`== form fill for a 200 mm rotor with no stator: ${r.formFill} mm; presets without one: ${r.missing}; Model 3 ${r.m3preset} mm ==`);
if (r.formFill !== Math.round(201.4 / 0.67)) fails.push('the form does not fill a missing stator from the rotor');
if (r.missing) fails.push(r.missing + ' factory drives name no stator diameter');
if (r.m3preset !== 225) fails.push("the Model 3's stator is not its teardown's 225 mm");

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the stator diameter sets the slot, the copper and the mass; old designs keep the old rule.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
