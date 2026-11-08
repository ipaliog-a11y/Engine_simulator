// A real car's CG height from its overall height (build 251).
//
// WHY THIS EXISTS. Makers almost never publish a car's CG height, so every real car took its class's hand-set figure.
// NHTSA measured CG height and roof height on 330 unladen light vehicles (SAE 1999-01-1336): their ratio has a median
// of 0.388 and, as the paper says, does not depend on the class. A real car with a published overall height (body.h)
// now has CG = 0.388 h. What must hold:
//   · CG_ROOF_RATIO is the measured median, and every car with h has exactly that CG, loaded and in factoryDims;
//   · each h is a car's (1.0 to 2.1 m), so each CG lands between a supercar's and a pickup's (0.40 to 0.75 m);
//   · a roofless car (Atom, Mono, SR3) has no h: its published height is a roll hoop's;
//   · NO_H_BUDGET: the real cars still on their class's CG, which may only shrink as later batches source heights.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const NO_H_BUDGET = 34;   // build 252: 58 of 92 cars have h; the rest are batch 3 (and 5 with no verified figure)
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];
const r = await page.evaluate(() => {
  const cars = VEHICLE_PRESETS.map(p => ({ name: p.name, h: p.body.h, cg: factoryDims(vehicleFromPreset(p)).cg }));
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46')));
  return { ratio: CG_ROOF_RATIO, cars, m3: { cg: vehicle.cg, h: vehicle.body.h } };
});
await browser.close();
const withH = r.cars.filter(c => c.h > 0), noH = r.cars.filter(c => !(c.h > 0));
console.log(`== CG_ROOF_RATIO ${r.ratio}; ${withH.length} cars with h, ${noH.length} on their class's CG (budget ${NO_H_BUDGET}) ==`);
if (r.ratio !== 0.388) fails.push('CG_ROOF_RATIO is not the measured median 0.388');
for (const c of withH) {
  if (Math.abs(c.cg - 0.388 * c.h) > 1e-12) fails.push(`${c.name}: CG ${c.cg} is not 0.388 × ${c.h}`);
  if (c.h < 1.0 || c.h > 2.1 || c.cg < 0.40 || c.cg > 0.75) fails.push(`${c.name}: h ${c.h} m or CG ${c.cg.toFixed(3)} m is not a car's`);
}
const lo = withH.reduce((a, b) => a.cg < b.cg ? a : b), hi = withH.reduce((a, b) => a.cg > b.cg ? a : b);
console.log(`  lowest ${lo.name} ${lo.cg.toFixed(3)} m, highest ${hi.name} ${hi.cg.toFixed(3)} m; M3 E46 loaded: ${r.m3.cg.toFixed(4)} m (h ${r.m3.h})`);
if (Math.abs(r.m3.cg - 0.388 * r.m3.h) > 1e-12) fails.push('the loaded M3 does not carry its CG from its height');
for (const n of ['Ariel Atom', 'BAC Mono', 'Radical SR3']) if (withH.some(c => c.name.includes(n))) fails.push(`${n} has no roof but carries h`);
if (noH.length > NO_H_BUDGET) fails.push(`${noH.length} cars on their class's CG, over the budget of ${NO_H_BUDGET}`);
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: every real car with a published height carries 0.388 of it as its CG.');
process.exit(fails.length || errors.length ? 1 : 0);
