// The hand-wheel torque after power assistance and steering friction (plan small-physics step 4).
//
// WHY THIS EXISTS. stepCar now gives s.handTorque: the column load -s.steerTorque through the boost curve and the
// steering's Coulomb friction (DRIVE_ASSIST). What must hold:
//   · on a wheel being turned, the hand torque is the load less the curve's share of assist, plus the friction;
//   · the assist's share grows at parking speed (the gain falls with speed);
//   · on a wheel held near the centre, the hand torque is nothing (friction's dead band), and further out it is the
//     assisted load less the friction;
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

const R = await page.evaluate(() => {
  const A = DRIVE_ASSIST, curve = (L, v) => {   // the boost curve, written out again from its constants
    const K = A.Kv + (A.K0 - A.Kv) * Math.exp(-v / A.vK); return L <= A.T0 ? L : (L + K * A.T0) / (1 + K);
  };
  const P = FACTORY_CARS.find(x => x.name.startsWith('Honda Civic Type R (FK8'));
  loadVehiclePreset(P); const car = driveCar(); car.esp = false; car.tc = false;
  const s = driveRolling(car, 80), u = st => ({ steer: st, throttle: 0.2, brake: 0, gear: s.gear });
  for (let i = 0; i < 100; i++) stepCar(car, s, u(0), 0.005);
  const turning = [];
  for (let k = 1; k <= 200; k++) {                // 1 s ramp to steer 0.1
    stepCar(car, s, u(k / 2000), 0.005);
    if (k % 50 === 0) { const L = -s.steerTorque, v = Math.hypot(s.vx, s.vy); turning.push({ L, h: s.handTorque, want: curve(L, v) + A.Tf, share: 1 - curve(L, v) / L }); }
  }
  const hold = st => { for (let i = 0; i < 400; i++) stepCar(car, s, u(st), 0.005); const L = -s.steerTorque, v = Math.hypot(s.vx, s.vy); return { st, L, h: s.handTorque, want: Math.max(0, curve(L, v) - A.Tf) }; };
  const held = [hold(0.1), hold(0.003)];
  return { turning, held, park: 1 - curve(20, 0) / 20, fast: 1 - curve(20, 25) / 20 };
});
await browser.close();

for (const t of R.turning) {
  console.log(`turning: load ${t.L.toFixed(2)} Nm, hand ${t.h.toFixed(2)} Nm (curve + friction ${t.want.toFixed(2)}), assist share ${(100 * t.share).toFixed(0)}%`);
  if (Math.abs(t.h - t.want) > 1e-3) fails.push(`turning: hand ${t.h} Nm, not ${t.want}`);
  if (t.L > 2 && !(t.share > 0 && t.h - 1.5 < t.L)) fails.push(`turning: the assist does not lower the hand torque`);
}
for (const t of R.held) {
  console.log(`held at steer ${t.st}: load ${t.L.toFixed(2)} Nm, hand ${t.h.toFixed(2)} Nm (want ${t.want.toFixed(2)})`);
  if (Math.abs(t.h - t.want) > 1e-3) fails.push(`held ${t.st}: hand ${t.h} Nm, not ${t.want}`);
}
if (!(R.held[1].L > 0.05 && R.held[1].h === 0)) fails.push('no dead band at the centre: a small held load still needs the driver');
if (!(R.held[0].h > 0)) fails.push('held at 0.1: no hand torque at all');
console.log(`assist share at a 20 Nm load: ${(100 * R.park).toFixed(0)}% parking, ${(100 * R.fast).toFixed(0)}% at 90 km/h`);
if (!(R.park > R.fast)) fails.push('the assist does not grow at parking speed');
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
