// Each body class is the median real car of its class (build 223).
//
// WHY THIS EXISTS. The 14 chassis classes in CHASSIS were hand-set guesses. Since build 223 the eleven classes with 3
// or more real cars are derived from them by tools/class-medians.mjs: the median platform mass, Cd, frontal area,
// wheelbase and front weight share, and the most common drive, tyres, brakes, suspension, gearbox, diff and aero.
// What must hold:
//   · CHASSIS is exactly what its real cars give (so a car added to a class, or a car corrected, shows up here until
//     the class is derived again with the tool);
//   · no derived class carries an aero kit or weight reduction, as no real car does (a real car's Cd includes its
//     factory spoilers);
//   · the classes with fewer than 3 real cars (GT, prototype, open-wheeler) keep their hand-set values, named as a gap;
//   · picking a class gives its values: a generic coupe weighs the class platform plus its engine.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { deriveFromPage, KEPT_CLASSES, MIN_CARS } from '../tools/class-medians.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.evaluate(() => setTab('garage'));
const fails = [];

// 1. the table against its cars
const { derived, diffs, chassis } = await deriveFromPage(page);
console.log(`== derived ${Object.keys(derived).length} classes (${Object.entries(derived).map(([k, d]) => k + ' ' + d.n).join(', ')}) ==`);
for (const [k, d] of Object.entries(derived)) console.log(`   ${k}: ${d.values.mass} kg platform, Cd ${d.values.cd}, ${d.values.area} m², wb ${d.values.wb} m, ${Math.round(d.values.fWt * 100)}% front, ${d.values.drive}, ${d.values.fit.tire} ${d.values.fit.tw}/${d.values.fit.ta}R${d.values.fit.wheel}, ${d.values.fit.gears}-speed ${d.values.fit.gearbox}`);
if (diffs.length) fails.push('CHASSIS is not what its real cars give (run node tools/class-medians.mjs): ' + diffs.map(x => `${x.key}.${x.field} ${x.code} vs ${x.derived}`).join('; '));
if (Object.keys(derived).length !== 11) fails.push('expected 11 derived classes, got ' + Object.keys(derived).length);

// 2. no kit on a derived class
const kits = Object.keys(derived).filter(k => { const f = chassis[k].fit; return f.aF !== 'none' || f.aR !== 'none' || f.aFl !== 'none' || f.weight !== 'none'; });
if (kits.length) fails.push('derived classes with an aero kit or weight reduction: ' + kits.join(', '));

// 3. the classes kept by hand: their values as build 222 had them
const kept = { gt: { mass: 1580, cd: 0.30, area: 2.15, wb: 2.90 }, proto: { mass: 620, cd: 0.60, area: 1.55, wb: 2.80 }, openwheel: { mass: 430, cd: 0.55, area: 1.15, wb: 2.60 } };
for (const k of KEPT_CLASSES) {
  const c = chassis[k], w = kept[k];
  if (!w || c.mass !== w.mass || c.cd !== w.cd || c.area !== w.area || c.wb !== w.wb) fails.push(`the hand-set class ${k} changed: ${JSON.stringify({ mass: c.mass, cd: c.cd, area: c.area, wb: c.wb })}`);
}
console.log(`== kept by hand (fewer than ${MIN_CARS} real cars): ${KEPT_CLASSES.join(', ')} ==`);

// 4. a generic coupe takes its class's values
const g = await page.evaluate(() => {
  setTab('vehicle');
  const c = document.getElementById('vhChassis'); c.value = 'coupe'; c.dispatchEvent(new Event('input'));
  return { mass: vehicle.mass, eng: vehicle.engineMass, wr: (WEIGHT_RED[vehicle.weightRed] || WEIGHT_RED.none).kg, wb: vehicle.wb, area: vehicle.area, fWt: vehicle.fWt,
    tyre: vehicle.tireWidth + '/' + vehicle.tireAspect + 'R' + vehicle.wheelDia, aero: vehicle.aeroFront + '/' + vehicle.aeroRear + '/' + vehicle.aeroFloor, ch: CHASSIS.coupe };
});
console.log(`== generic coupe: ${g.mass.toFixed(0)} kg (platform ${g.ch.mass} + engine ${g.eng}), wb ${g.wb}, ${g.area} m², ${g.tyre}, aero ${g.aero} ==`);
if (Math.abs(g.mass - Math.max(380, g.ch.mass + g.eng - g.wr)) > 0.5 || g.wb !== g.ch.wb || g.area !== g.ch.area || g.fWt !== g.ch.fWt) fails.push('a generic coupe does not take its class values');
if (g.tyre !== `${g.ch.fit.tw}/${g.ch.fit.ta}R${g.ch.fit.wheel}` || g.aero !== 'none/none/none') fails.push('a generic coupe does not arrive on its class fitment');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
