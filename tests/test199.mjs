// The steering torque at the hand wheel in the stepped car (phase G2, build 323).
//
// WHY THIS EXISTS. stepCar now gives s.steerTorque: the front tyres' side force acting behind the steering axis, by
// the brush model's pneumatic trail and the caster trail, through the steering ratio (see DRIVE_CASTER). What must hold:
//   · straight ahead it is nothing, and in a turn it turns the wheel back (against the steer);
//   · on a slow ramp of steer at 80 km/h, its peak comes before the front side force's (the steering goes light);
//   · no page errors.
// Torque steer from unequal driveshafts is not tested: no preset gives shaft angles (open, named in drive-model.js).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const CARS = ['Toyota GR Yaris', 'Honda Civic Type R (FK8', 'Mazda MX-5'];
const R = await page.evaluate(CARS => CARS.map(n => {
  const P = FACTORY_CARS.find(x => x.name.startsWith(n)); if (!P) return { n, missing: true };
  loadVehiclePreset(P); const car = driveCar(); car.esp = false; car.tc = false;
  const s = driveRolling(car, 80);
  for (let i = 0; i < 100; i++) stepCar(car, s, { steer: 0, throttle: 0, brake: 0, gear: s.gear }, 0.005);
  const straight = s.steerTorque;
  let pT = 0, sT = 0, pF = 0, sF = 0, against = true;
  for (let k = 1; k <= 1200; k++) {                        // 6 s to full lock
    const st = k / 1200;
    stepCar(car, s, { steer: st, throttle: 0.3, brake: 0, gear: s.gear }, 0.005);
    const T = -s.steerTorque, F = s.Fy[0] + s.Fy[1];
    if (st < 0.5 && T < 0) against = false;
    if (T > pT) { pT = T; sT = st; } if (F > pF) { pF = F; sF = st; }
  }
  return { n: P.name, straight, pT, sT, pF, sF, against };
}), CARS);
await browser.close();

for (const r of R) {
  if (r.missing) { fails.push(r.n + ': no such preset'); continue; }
  console.log(`${r.n}: straight ${r.straight.toFixed(3)} Nm; torque peak ${r.pT.toFixed(1)} Nm at steer ${r.sT.toFixed(3)}, front side force peak ${(r.pF / 1000).toFixed(1)} kN at ${r.sF.toFixed(3)}`);
  if (Math.abs(r.straight) > 0.05) fails.push(`${r.n}: ${r.straight.toFixed(3)} Nm straight ahead`);
  if (!r.against) fails.push(`${r.n}: the torque does not turn the wheel back`);
  if (!(r.sT < r.sF)) fails.push(`${r.n}: the torque peaks at ${r.sT.toFixed(3)}, not before the side force (${r.sF.toFixed(3)})`);
}
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
