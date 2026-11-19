// The 100-0 stop per axle, and the proportioning valve (build 391).
//
// WHY THIS EXISTS. Until build 391 the 100-0 stop pooled the four tyres' grip at a quarter of the load each, whatever the
// brakes' split, so an axle whose brakes could not reach its grip cost nothing. What must hold:
//   · with ABS the stop's deceleration is each axle's lesser of its grip (at its load, braking moving load forward)
//     and its brakes: a car whose rear brakes are cut to a sliver stops longer;
//   · without ABS it stops where the first axle reaches its grip, through the knee-point valve, so it is never shorter
//     than with ABS;
//   · the valve's two lines are chords of the ideal distribution, meeting it at the knee (0.4 g) and at R13-H's 0.8 g,
//     and below it in between (the front locks first up to 0.8 g); it never falls;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const R = await page.evaluate(() => {
  loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name.startsWith('Mazda MX-5')));
  const V = vehicle, o = { abs: simulateBraking(100 / 3.6).dist };
  const fH = V.brakeFrontShare, cap = V.brakeDecelCap;
  V.brakeFrontShare = 0.97; V.brakeDecelCap = cap * fH / 0.97;          // the same fronts, rears cut to a sliver
  o.weakRear = simulateBraking(100 / 3.6).dist; V.brakeFrontShare = fH; V.brakeDecelCap = cap;
  const keep = V.aids; V.aids = Object.assign({}, keep || {}, { abs: false });
  o.noAbs = simulateBraking(100 / 3.6).dist; V.aids = keep;
  const hL = V.cg / V.wb, f0 = V.fWt, rv = brakeValveRear(f0, hL), X = z => z * (f0 + z * hL) * G, Y = z => z * (1 - f0 - z * hL) * G;
  o.valve = [0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map(z => ({ z, ideal: Y(z), valve: rv(X(z)) }));
  o.valveMono = [0, 2, 4, 6, 8, 10, 12, 14].every((x, i, a) => i === 0 || rv(x) >= rv(a[i - 1]) - 1e-9);
  return o;
});
console.log(`== MX-5 100-0: ABS ${R.abs.toFixed(1)} m, rears cut ${R.weakRear.toFixed(1)} m, no ABS ${R.noAbs.toFixed(1)} m ==`);
if (!(R.weakRear > R.abs + 1)) fails.push('cutting the rear brakes did not lengthen the ABS stop');
if (!(R.noAbs >= R.abs - 0.05)) fails.push('the stop without ABS is shorter than with it');
for (const p of R.valve) {
  console.log(`  z ${p.z.toFixed(1)} g: rear ideal ${p.ideal.toFixed(2)}, valve ${p.valve.toFixed(2)} m/s2`);
  if ((p.z === 0.4 || p.z === 0.8) && Math.abs(p.ideal - p.valve) > 1e-6) fails.push(`the valve misses the ideal at ${p.z} g`);
  if (p.z < 0.8 && p.valve > p.ideal + 1e-6) fails.push(`the rear locks first at ${p.z} g`);
}
if (!R.valveMono) fails.push('the valve\'s rear brake falls as the pedal rises');
await browser.close();
for (const e of errors) fails.push(e);
if (fails.length) { console.log('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
