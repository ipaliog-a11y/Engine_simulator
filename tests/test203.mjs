// Roll steer and compliance steer in the stepped car (build 328, phase G5).
//
// WHY THIS EXISTS. Each wheel now steers a little by the body's roll and by its own side force (s.toe, THE TOE in
// drive-model.js), from the middle of the measured ranges in "Summary of typical vehicle parameter measurements".
// What must hold:
//   · in a left turn the front wheels toe to the right (out of the turn), and the rears, by the fleet's oversteer
//     compliance, to the right too; at rest no axle steers (a trace of bump steer, equal and opposite, as the body settles);
//   · ISO 4138, constant radius (40 m, driven by driveDriver at 0.1-0.4 g): the understeer gradient rises with the
//     front compliance (none, the default, twice it), and car.Kus, the single-track model ESP reads, rises with it;
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
  const D = 180 / Math.PI, Rc = 40, line = [];
  for (let i = 0; i < 720; i++) { const a = i * Math.PI / 360; line.push({ x: Rc * Math.sin(a), y: Rc * (1 - Math.cos(a)), v: 0, grade: 0, kv: 0 }); }
  const mk = (n, o) => { loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n))); Object.assign(vehicle, o); const c = driveCar(); for (const k in o) delete vehicle[k]; return c; };
  const iso = car => { const pts = [];
    for (const g of [0.1, 0.2, 0.3, 0.4]) { const v = Math.sqrt(g * 9.81 * Rc), s = driveState(car), d = { i: 0 };
      line.forEach(q => q.v = v); s.vx = v; s.w = s.w.map(() => v / car.r); s.gear = 2; s.we = v / car.r * car.ratios[1] * car.fd;
      let acc = 0, n = 0;
      for (let i = 0; i < 2000; i++) { stepCar(car, s, driveDriver(car, s, line, d), 0.01); if (i >= 1500) { acc += s.delta; n++; } }
      pts.push({ ay: s.ay / 9.81, d: acc / n * D, toe: s.toe.map(t => t * D) }); }
    const n = pts.length, mx = pts.reduce((a, p) => a + p.ay, 0) / n, my = pts.reduce((a, p) => a + p.d, 0) / n;
    return { U: pts.reduce((a, p) => a + (p.ay - mx) * (p.d - my), 0) / pts.reduce((a, p) => a + (p.ay - mx) ** 2, 0), pts,
      K: car.Kus * (car.a + car.b) * 9.81 * D }; };
  const out = { iso: [0, 0.19, 0.38].map(c => iso(mk('Honda Civic Type R (FK8', { compSteerF: c }))) };
  const car = mk('Mazda MX-5', {}), s = driveState(car); stepCar(car, s, { steer: 0, throttle: 0, brake: 1 }, 0.1);
  // small-physics step 3: a wheel toes by its own travel (bump steer), and the body settles a few microns in this one
  // coarse step, so each axle's pair toes equal and opposite by a trace: no net steer, and under 0.001 deg
  out.rest = s.toe.every(t => Math.abs(t) * D < 1e-3) && Math.abs(s.toe[0] + s.toe[1]) < 1e-12 && Math.abs(s.toe[2] + s.toe[3]) < 1e-12;
  return out;
});
await browser.close();
const f2 = x => x.toFixed(2);
for (const [i, r] of R.iso.entries()) console.log(`ISO 4138, Civic Type R, front compliance ${[0, 0.19, 0.38][i]} deg/kN: ${f2(r.U)} deg/g measured, ${f2(r.K)} deg/g from car.Kus; toe at ${f2(r.pts[3].ay)} g: ${r.pts[3].toe.map(f2).join(' ')} deg`);
const [a, b, c] = R.iso;
if (!(a.U < b.U && b.U < c.U)) fails.push('the understeer gradient does not rise with the compliance');
if (!(a.K < b.K && b.K < c.K)) fails.push('car.Kus does not rise with the compliance');
if (!b.pts[3].toe.every(t => t < 0)) fails.push('in a left turn a wheel does not toe to the right');
if (!R.rest) fails.push('a wheel is toed at rest beyond its bump steer, or an axle steers');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nPASS');
