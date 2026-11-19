// The lap's torque and the race's energy price at the pack's own temperature (plans/small-physics.md step 10).
//
// WHY THIS EXISTS. Build 346 made the cells' heat follow their temperature, but the lap's torque curve (rated at 25 °C)
// and the race's pace-grid price still read 25 °C. What must hold:
//   · driveTorqueRated with no temperature is the 25 °C (rated) curve, so the dyno and the designer do not move;
//   · evPackGain is 1 at 25 °C, never below 1 when warmer (lower resistance), and above 1 somewhere on a preset EV's
//     curve once warm (where the pack's power is the limit);
//   · the lap's walk scales the drive by it: on a Model Y lap the drive's share rises past 1 where the pack is warm;
//   · the race's grid keeps its cells' heat apart (fh, at 25 °C and half charge), inside its price;
//   · a race step at 25 °C and half charge spends exactly the grid's price; a warmer pack spends less.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model Y/.test(p.name)));
  const e = engine, V = motorRatedV(e), tc = e.motor.cool.tCool, cool = { w: tc, c: tc, r: 60 };
  const rpms = evCurve(e).map(q => q.rpm);
  const same = rpms.every(n => driveTorqueRated(e, Math.max(n, 1), V, cool) === driveTorqueRated(e, Math.max(n, 1), V, cool, null, 25));
  const g = t => rpms.map(n => evPackGain(e, n, t));
  const g25 = g(25), g45 = g(45);
  // the lap's walk: 60 s flat out at the knee's speed and above, where the pack's power is the limit
  const n = 600, prof = { dt: new Float64Array(n).fill(0.1), rpm: new Float64Array(n), tq: new Float64Array(n) };
  for (let i = 0; i < n; i++) { prof.rpm[i] = e.redline * (0.4 + 0.5 * i / n); prof.tq[i] = evCurve(e).find(q => q.rpm >= prof.rpm[i]).tq; }
  const H = evLapHeat(e, prof);
  // the race: a stub car one step along at the grid's own price, at 25 °C and at 45 °C, half charge
  const M = { ev: { pack: e.pack, motor: e.motor, V, k: 1, rl: e.redline, kWh: e.pack.kWh }, tankKg: 1e9 };
  const P = 150e3, d = packDraw(e.pack, 0.5, P), fh = d.heat / 3600, fr = P / 3600 + fh;
  const step = tB => {
    const c = { evT: { w: tc, c: tc, r: tc, b: tB }, evPeak: { w: 0, b: 0 }, fuelKg: (0.5 - EV_RACE.socFloor) * e.pack.kWh, fuelUsed: 0, _fr: fr, _fh: fh, _tq: 0, v: 30 };
    const E0 = c.fuelKg; c.fuelKg -= fr / 1000; evRaceHeatStep(M, c, 1, 1, 1); return (E0 - c.fuelKg) * 3.6e6;   // J in 1 s
  };
  return { same, g25, g45, shareMax: Math.max(...H.share), bMax: Math.max(...H.tB),
    price: fr * 3600, s25: step(25), s45: step(45), heat25: d.heat };
});
await browser.close();
const fails = [...errors], f = (x, d = 4) => (+x).toFixed(d);
console.log(`== Model Y gain at 45 °C: ${f(Math.min(...r.g45))}..${f(Math.max(...r.g45))} (25 °C: ${f(Math.min(...r.g25))}..${f(Math.max(...r.g25))}) ==`);
console.log(`== race step: grid price ${f(r.price, 0)} W, spent ${f(r.s25, 0)} W at 25 °C, ${f(r.s45, 0)} W at 45 °C (cells ${f(r.heat25, 0)} W at 25 °C) ==`);
if (!r.same) fails.push('driveTorqueRated without a temperature is not the 25 °C curve');
if (r.g25.some(x => Math.abs(x - 1) > 1e-9)) fails.push('evPackGain is not 1 at 25 °C');
if (r.g45.some(x => x < 1 - 1e-9)) fails.push('a warmer pack gives less torque');
if (!(Math.max(...r.g45) > 1.001)) fails.push('a warm pack gives no more torque anywhere on the Model Y curve');
console.log(`== lap walk: pack to ${f(r.bMax, 1)} °C, drive share up to ${f(r.shareMax)} ==`);
if (!(r.shareMax > 1)) fails.push('the lap walk does not scale the drive by the warm pack');
if (Math.abs(r.s25 - r.price) > 1e-3 * r.price) fails.push(`a step at 25 °C spends ${f(r.s25, 0)} W, not the grid's ${f(r.price, 0)} W`);
if (!(r.s45 < r.s25)) fails.push('a warmer pack does not spend less');
if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
