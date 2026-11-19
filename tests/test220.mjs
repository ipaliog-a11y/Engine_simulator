// Regen power against measured EVs (build 364, plans/small-physics.md step 12).
//
// WHY THIS EXISTS. evRegenTable is the motor's torque capped by the pack's charge power; real EVs cap regen lower, by
// the maker's calibration (plans/vehicle-challenges.md, "Regen power against measured EVs"). What must hold:
//   · every preset EV's regen at 20 km/h and its power cap are printed beside the measured figures;
//   · while any preset misses a sourced figure by more than 10%, the plan names the gap (an open owner's decision:
//     the fix is a rule per maker that moves every EV), so it is not lost.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
const repo = fileURLToPath(new URL('..', import.meta.url));
// Sourced: decel at low speed, regen alone (m/s2; SAE 2020-01-0883: -0.21 g Standard on a Model 3; field study
// par.nsf.gov/servlets/purl/10511946 ~2.5) and peak regen kW where published (probable: InsideEVs, evkx.net).
const MEASURED = { 'Model 3': { a: 2.1, kW: 77 }, 'Model Y': { a: 2.1 }, 'Plaid': { a: 2.1, kW: 90 } };
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const rows = await page.evaluate(() => EV_VEHICLE_PRESETS.map(pr => {
  loadVehiclePreset(pr);
  const e = engine, v = vehicle, t = evRegenTable(e, e.redline), r = v.rTire, fd = v.finalDrive;
  const meff = v.mass + (v.wheelI || 0) / (r * r) + e.motor.J * (fd / r) ** 2;
  const rpm = 20 / 3.6 / r * fd * 30 / Math.PI, T = t[Math.min(t.length - 1, Math.floor((rpm - 500) / 250))];
  return { name: pr.name, a: T * fd / (r * v.driveEff) / meff, kW: e.pack.pChargeMax / 1000 };
}));
await browser.close();
const fails = [...errors];
const plan = fs.readFileSync(path.join(repo, 'plans/vehicle-challenges.md'), 'utf8');
for (const x of rows) {
  const key = Object.keys(MEASURED).find(k => x.name.includes(k)), m = key && MEASURED[key];
  const miss = m && (x.a > m.a * 1.1 || (m.kW && x.kW > m.kW * 1.1));
  console.log(`${x.name}: ${x.a.toFixed(1)} m/s2 at 20 km/h, cap ${x.kW.toFixed(0)} kW` + (m ? ` | measured ${m.a} m/s2${m.kW ? ', ' + m.kW + ' kW' : ''}` : '') + (miss ? '  [gap]' : ''));
  if (miss && !/\*\*Gap \(open, owner's decision\):\*\*/.test(plan)) fails.push(`${x.name} misses the measured regen and the plan does not name the gap`);
}
if (!rows.length) fails.push('no preset EVs');
for (const f of fails) console.log('FAIL: ' + f);
process.exit(fails.length ? 1 : 0);
