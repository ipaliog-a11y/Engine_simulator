// The axle differentials in the stepped car, by type (build 318).
//
// WHY THIS EXISTS. stepCar coupled an axle's two wheels by a fitted lock x 300 x dw. Each type now has its own law
// (diffCoupling): open, a friction pack (preload + lock x input torque), a viscous coupling (c x dw, c from the
// shear of silicone) and a spool. What must hold, on the Civic Type R (FK8) at full throttle in third on a 40 m circle,
// traction and stability control off, when the car passes 70 km/h:
//   · open: the inside front wheel spins up, above 100 km/h (the work-in-progress measurement: 131 km/h);
//   · viscous, clutch-plate and spool: the inside wheel stays below 90 km/h (WIP: 78, 76 and 76), the viscous one
//     faster than the clutch-plate one (it needs a speed difference to carry torque);
//   · a spool keeps the two wheels at one speed (within 0.1 km/h);
//   · the viscous rate is 100-120 N m s (the WIP's 110 from US 5,597,369); no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const R = await page.evaluate(() => {
  const out = {}, G = 3, Rc = 40, v0 = 50 / 3.6;
  for (const k of ['open', 'visc', 'clsd', 'spool']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith('Honda Civic Type R (FK8')));
    vehicle.df = DIFF[k];
    const car = driveCar(); car.esp = false; car.tc = false;
    const line = [];
    for (let i = 0; i < 720; i++) { const a = i * Math.PI / 360; line.push({ x: Rc * Math.sin(a), y: Rc * (1 - Math.cos(a)), v: v0, grade: 0, kv: 0 }); }
    const s = driveState(car); s.x = 0; s.y = 0; s.psi = 0; s.vx = v0; s.w = s.w.map(() => v0 / car.r);
    s.gear = G; s.we = v0 / car.r * car.ratios[G - 1] * car.fd; const d = { i: 0 };
    for (let i = 0; i < 300; i++) stepCar(car, s, { ...driveDriver(car, s, line, d), gear: G }, 0.01);
    let r = null;
    for (let i = 0; i < 1000 && !r; i++) { const u = driveDriver(car, s, line, d);
      stepCar(car, s, { steer: u.steer, throttle: 1, brake: 0, gear: G }, 0.01);
      if (s.vx * 3.6 >= 70) r = { inside: s.w[0] * car.r * 3.6, outside: s.w[1] * car.r * 3.6 }; }
    out[k] = Object.assign(r || { never: s.vx * 3.6 }, { type: car.diff.type, c: car.diff.c });
  }
  return out;
});
await browser.close();

const WIP = { open: 131, visc: 78, clsd: 76, spool: 76 };
console.log('diff     type    inside / outside wheel at 70 km/h (WIP inside)');
for (const k in R) {
  const r = R[k];
  if (r.never != null) { fails.push(`${k}: never reached 70 km/h (${r.never.toFixed(0)})`); continue; }
  console.log(`${k.padEnd(8)} ${r.type.padEnd(7)} ${r.inside.toFixed(1)} / ${r.outside.toFixed(1)} km/h   (${WIP[k]})`);
}
const { open, visc, clsd, spool } = R;
if (!(open.inside > 100)) fails.push(`open: the inside wheel should spin up, ${open.inside?.toFixed(1)} km/h`);
for (const [k, r] of [['visc', visc], ['clsd', clsd], ['spool', spool]]) if (!(r.inside < 90)) fails.push(`${k}: the inside wheel at ${r.inside?.toFixed(1)} km/h`);
if (!(visc.inside > clsd.inside)) fails.push('the viscous coupling should let the inside wheel run faster than the clutch-plate LSD');
if (!(Math.abs(spool.inside - spool.outside) < 0.1)) fails.push(`spool: the wheels differ by ${Math.abs(spool.inside - spool.outside).toFixed(2)} km/h`);
if (!(visc.c >= 100 && visc.c <= 120)) fails.push(`viscous rate ${visc.c} N m s`);
const types = [open.type, visc.type, clsd.type, spool.type].join(',');
if (types !== 'open,visc,fric,spool') fails.push(`diffCoupling types: ${types}`);
console.log(`viscous rate: ${visc.c.toFixed(0)} N m s`);
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
