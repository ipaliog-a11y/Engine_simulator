// Regen power against measured EVs (build 366, plans/small-physics.md step 12; the maker's rule since step 12b).
//
// WHY THIS EXISTS. Real EVs cap regen below what the motor and the pack allow, by the maker's calibration
// (EV_REGEN_RULES; plans/vehicle-challenges.md, "Regen power against measured EVs"). What must hold:
//   · every preset EV's regen at 20 km/h and its most regen power are printed beside the measured figures;
//   · each lands within 10% of every sourced figure it has (deceleration, and kW where published);
//   · every preset EV matches a maker's rule, not the default.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
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
  const kW = Math.max(...t.map((q, i) => q * Math.min(500 + 250 * i, e.redline) * Math.PI / 30)) / 1000;
  return { name: pr.name, a: T * fd / (r * v.driveEff) / meff, kW, maker: evRegenRule(e).maker };
}));
await browser.close();
const fails = [...errors];
for (const x of rows) {
  const key = Object.keys(MEASURED).find(k => x.name.includes(k)), m = key && MEASURED[key];
  const off = (got, want) => Math.abs(got / want - 1) > 0.1, miss = m && (off(x.a, m.a) || (m.kW && off(x.kW, m.kW)));
  console.log(`${x.name}: ${x.a.toFixed(1)} m/s2 at 20 km/h, most ${x.kW.toFixed(0)} kW, rule ${x.maker || 'default'}` + (m ? ` | measured ${m.a} m/s2${m.kW ? ', ' + m.kW + ' kW' : ''}` : '') + (miss ? '  [gap]' : ''));
  if (miss) fails.push(`${x.name} misses a sourced regen figure by more than 10%`);
  if (!x.maker) fails.push(`${x.name} matches no maker's regen rule`);
}
if (!rows.length) fails.push('no preset EVs');
for (const f of fails) console.log('FAIL: ' + f);
process.exit(fails.length ? 1 : 0);
