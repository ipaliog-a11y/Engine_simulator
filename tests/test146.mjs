// Hairpin or round wire, copper or aluminium (plans/hybrid-electric/drivetrain.md, stage 6; build 236).
//
// WHY THIS EXISTS. The slot copper was one kind: stranded round wire at a 40% fill. A hairpin winding (about 70%, four
// bars a slot, the Model 3's layout) and an aluminium conductor (1.64 times copper's resistivity, a third of its mass,
// about 30% of its price a kilogram) are now on the form. Each acts through the slot's copper area, the conductor's
// resistivity, mass, heat capacity and price; nothing multiplies a torque or an efficiency. What must hold:
//   · the default, ROUND and COPPER, is today's motor: the Model 3 geometry's DC resistance near the measured 4.75 mOhm
//     (test96's band) and exactly what it was before, and every factory motor builds on it;
//   · HAIRPIN: more copper, lower DC resistance, less copper loss at high torque and low speed, but a higher AC factor and
//     more copper loss at high speed (a tall bar in the slot's field), and a dearer motor;
//   · ALUMINIUM: higher resistance and more copper loss for the same current, a lighter and cheaper motor;
//   · both reach a hybrid's motor too, and both read in Greek on the form.
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
  const V = 350, pt = { w: 90, r: 70 };
  const one = (wire, conductor) => {
    const m = motorBuild(Object.assign({}, M3, wire ? { wire, conductor } : {}));
    return { R: m.R20 * 1000, mCu: m.mCu, mass: m.mass, cost: m.cost, ac: copperAC(m, 15000, 90), wire: m.wire.label, cond: m.cond.label,
      cuLow: motorLosses(m, 400, 1000, V, pt).cu, cuHigh: motorLosses(m, 60, 15000, V, pt).cu };
  };
  const o = { none: one(), rc: one('round', 'copper'), hc: one('hairpin', 'copper'), ra: one('round', 'aluminium'), ha: one('hairpin', 'aluminium') };
  o.factory = FACTORY_CARS.filter(p => p.cat === 'Electric' || p.cat === 'Hybrid').map(p => {
    loadVehiclePreset(p); const m = engine.motor || (engine.hy && engine.hy.motor);
    const parts = m.parts ? m.parts.map(q => q.m) : [m];
    return { n: p.name, ok: parts.every(q => q.wire && q.wire.label === 'ROUND (STRANDED)' && q.cond.label === 'COPPER') };
  });
  // a hybrid's motor takes the fields too
  loadVehiclePreset(HYB_VEHICLE_PRESETS[0]);
  const e = Object.assign({}, engine, { evWire: 'hairpin', evConductor: 'aluminium' }); buildHybrid(e);
  o.hybrid = { wire: e.hy.motor.wire.label, cond: e.hy.motor.cond.label };
  setTab('design'); applyLang('el');
  o.el = [...document.querySelectorAll('label[for="evWire"], label[for="evConductor"], #evWire option, #evConductor option')].map(x => x.textContent.trim());
  applyLang('en');
  return o;
});
const f = (x, d = 2) => (+x).toFixed(d);
for (const k of ['rc', 'hc', 'ra', 'ha']) { const m = r[k];
  console.log(`== ${m.wire} ${m.cond}: ${f(m.R, 3)} mOhm, ${f(m.mCu)} kg conductor, motor ${f(m.mass, 1)} kg, $${m.cost}; AC ×${f(m.ac)} at 15000 rpm; copper loss ${Math.round(m.cuLow)} W at 400 Nm 1000 rpm, ${Math.round(m.cuHigh)} W at 60 Nm 15000 rpm ==`); }
console.log(`== hybrid motor: ${r.hybrid.wire}, ${r.hybrid.cond}; Greek: ${r.el.join(' · ')} ==`);
// the default is today's motor
if (r.none.R !== r.rc.R || r.none.cost !== r.rc.cost || r.none.mass !== r.rc.mass) fails.push('ROUND COPPER is not the motor with no winding chosen');
if (!(r.rc.R > 0.5 * 4.75 && r.rc.R < 1.5 * 4.75)) fails.push(`the default's DC resistance ${f(r.rc.R, 3)} mOhm left test96's band around 4.75`);
// 3.083 until build 289, when the slots became what the teeth and yoke, sized from the flux, leave (measured: 4.75).
if (Math.abs(r.rc.R - 3.860) > 0.001) fails.push(`the default's DC resistance ${f(r.rc.R, 4)} mOhm is not the 3.860 it was`);
const bad = r.factory.filter(x => !x.ok); if (bad.length) fails.push('factory motors not on round copper: ' + bad.map(x => x.n).join(', '));
// hairpin
if (!(r.hc.mCu > r.rc.mCu && r.hc.R < r.rc.R && r.hc.cuLow < r.rc.cuLow)) fails.push('a hairpin does not bring more copper, less resistance and less loss at low speed');
if (!(r.hc.ac > r.rc.ac && r.hc.cuHigh > r.rc.cuHigh)) fails.push('a hairpin does not lose more at high speed');
if (!(r.hc.cost > r.rc.cost)) fails.push('a hairpin does not cost more');
// aluminium
if (!(r.ra.R > 1.5 * r.rc.R && r.ra.R < 1.8 * r.rc.R && r.ra.cuLow > r.rc.cuLow)) fails.push('aluminium is not ~1.64× the resistance, with more loss');
if (!(r.ra.mass < r.rc.mass && r.ra.cost < r.rc.cost)) fails.push('aluminium is not lighter and cheaper');
if (r.hybrid.wire !== 'HAIRPIN' || r.hybrid.cond !== 'ALUMINIUM') fails.push('a hybrid motor does not take the winding');
if (r.el.length !== 6 || r.el.some(t => /WINDING|CONDUCTOR|STRANDED|COPPER|ALUMINIUM/.test(t))) fails.push('the winding fields are not in Greek: ' + r.el.join(' · '));
if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
