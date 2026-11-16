// The body rolls and pitches on its springs and dampers in the stepped car (build 317).
//
// WHY THIS EXISTS. stepCar moved the weight with a first-order lag at the ride frequency, so the car didn't lean or
// dive and a step of the wheel couldn't overshoot. Roll and pitch are now states (driveBody). What must hold:
//   · steady in a corner, the body rolls on its springs by the lap's own roll gradient (vehicle.rollGrad), within 2%,
//     on three cars, and by more than that to the road, the tyres giving too (build 331);
//   · steady, the front axle carries the lap's lltdF share of the lateral transfer, within 2%;
//   · steady under the brakes, it pitches by m ax h / Kp, within 2%, and dives past it on the way (it is damped, not lagged);
//   · a step of the wheel (ISO 7401) rolls the body past its steady angle, and further with the roll damping halved.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const R = await page.evaluate(() => {
  const out = [];
  for (const n of ['BMW M3 (E46', 'Honda Civic Type R (FK8', 'Mazda MX-5']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n)));
    const car = driveCar(), o = { name: n, rollGrad: vehicle.rollGrad, lltdF: vehicle.lltdF };
    // steady corner
    let s = driveRolling(car, 80);
    for (let t = 0; t < 5; t += 0.01) stepCar(car, s, { steer: 0.08, throttle: 0.35, brake: 0 }, 0.01);
    // the roll on the springs (build 331: the body's own roll now includes the tyres' give, s.rr is each axle's on its springs)
    o.grad = (car.KaF * s.rr[0] + car.KaR * s.rr[1]) / car.rollK * 180 / Math.PI / (s.ay / 9.81); o.body = s.roll * 180 / Math.PI / (s.ay / 9.81);
    o.front = (s.Fz[1] - s.Fz[0]) * car.tF / 2 / ((s.Fz[1] - s.Fz[0]) * car.tF / 2 + (s.Fz[3] - s.Fz[2]) * car.tR / 2);
    // steady braking
    s = driveRolling(car, 160); let pk = 0;
    let sp = 0, sw = 0, k = 0;   // averaged over the last second
    for (let t = 0; t < 3; t += 0.001) { stepCar(car, s, { steer: 0, throttle: 0, brake: 0.3 }, 0.001); const w = car.m * s.ax * car.h / car.pitchK;
      pk = Math.min(pk, s.pitch - w); if (t > 2) { sp += s.pitch; sw += w; k++; } }
    o.pitch = sp / k; o.pitchWant = sw / k; o.pitchPk = o.pitchWant + pk; o.gear = s.gear;
    // step steer at 80 km/h, as built and with the roll damping halved
    // the roll past where the moment at that instant would hold it (m ay arm / K), as a share of the final roll
    const step = c => { const q = driveRolling(c, 80); let m = 0;
      for (let t = 0; t < 4; t += 0.001) { stepCar(c, q, { steer: 0.06, throttle: 0.2, brake: 0 }, 0.001); m = Math.max(m, q.roll - c.m * q.ay * c.rollArm / c.rollK); }
      return 1 + m / q.roll; };
    o.over = step(car); o.overSoft = step(Object.assign({}, car, { cdF: car.cdF / 2, cdR: car.cdR / 2 }));
    out.push(o);
  }
  return out;
});

const near = (a, b, t) => Math.abs(a / b - 1) <= t;
for (const o of R) {
  console.log(`${o.name.padEnd(24)} roll ${o.grad.toFixed(2)} deg/g (lap ${o.rollGrad.toFixed(2)}), front share ${o.front.toFixed(3)} (lltdF ${o.lltdF.toFixed(3)}), ` +
    `pitch ${(o.pitch * 57.3).toFixed(2)} deg (want ${(o.pitchWant * 57.3).toFixed(2)}, peak ${(o.pitchPk * 57.3).toFixed(2)}), step-steer roll overshoot ${o.over.toFixed(3)}, damping halved ${o.overSoft.toFixed(3)}`);
  if (!near(o.grad, o.rollGrad, 0.02)) fails.push(`${o.name}: roll gradient off the lap's`);
  if (!(o.body > o.grad * 1.03 && o.body < o.grad * 1.4)) fails.push(`${o.name}: the body's roll to the road (${o.body.toFixed(2)}) is not the springs' plus the tyres'`);
  if (!near(o.front, o.lltdF, 0.02)) fails.push(`${o.name}: front share of the transfer off lltdF`);
  if (!near(o.pitch, o.pitchWant, 0.02) || !(o.pitchPk < o.pitch)) fails.push(`${o.name}: pitch in braking not as its springs give, or no dive past it`);
  if (!(o.over > 1.01 && o.overSoft > o.over)) fails.push(`${o.name}: a step steer does not overshoot, or not more with less damping`);
}
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the body rolls and pitches as the lap says when steady, and overshoots on a step, more with less damping.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
