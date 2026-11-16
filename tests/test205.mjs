// Each wheel moves up and down on its own in the stepped car (build 331, phase G6).
//
// WHY THIS EXISTS. stepCar gave each tyre its share of the weight and the transfer; a wheel had no motion of its own,
// so a bump could not unload one. Each wheel is now a quarter car and the tyre's load is its own deflection. What must hold:
//   · on a flat road at a steady speed the four loads add up to the weight and the downforce, within 0.5%;
//   · the road falling away 60 mm under the left front leaves that tyre off the road for the time a quarter car of
//     that corner (worked out here, apart from stepCar, the body held) takes to fall that far, within 10%;
//   · meanwhile the right front's load rises (the anti-roll bar) and the rears' hardly move;
//   · after a 10 mm step up, the wheel's load rings at the quarter car's wheel-hop frequency, within 8%;
//   · at half the step (0.5 ms) the time off the road is the same within 2%: no smaller step is needed.
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
    const car = driveCar(), o = { name: n }, L = car.a + car.b, W0 = car.m * 9.81 * car.b / L / 2;
    const settle = () => { const s = driveRolling(car, 80); for (let t = 0; t < 4; t += 0.001) stepCar(car, s, { steer: 0, throttle: 0.12, brake: 0 }, 0.001); return s; };
    let s = settle();
    o.sum = s.Fz[0] + s.Fz[1] + s.Fz[2] + s.Fz[3]; o.want = car.m * 9.81 + 0.5 * 1.2 * car.clA * s.vx * s.vx;
    // the road falls away under the left front
    const drop = (dt, d) => { const q = settle(), f0 = q.Fz.slice(); let off = 0, pkR = 0, pkRear = 0;
      for (let t = 0; t < 0.4; t += dt) { stepCar(car, q, { steer: 0, throttle: 0.12, brake: 0, road: { z: [-d, 0, 0, 0] } }, dt);
        if (q.Fz[0] <= 0) off += dt; else if (off > 0 && !pkR) pkR = q.Fz[1] - f0[1];
        pkRear = Math.max(pkRear, Math.abs(q.Fz[2] - f0[2]), Math.abs(q.Fz[3] - f0[3])); }
      return { off, pkR, pkRear, f0 }; };
    const d = 0.06, A = drop(0.001, d), B = drop(0.0005, d);
    o.off = A.off; o.offHalf = B.off; o.right = A.pkR; o.rear = A.pkRear; o.f0 = A.f0[0];
    // the quarter car on its own, the body and the other wheel held: the wheel falls under its spring's load, less as
    // the spring and the bar let go, against the damper, until the tyre meets the road again
    { const k = car.ksF / 2 + car.KaF / (car.tF * car.tF), far = d - A.f0[0] / car.ktF; let z = 0, v = 0, t = 0;
      while (z < far && t < 1) { v += 1e-5 * (A.f0[0] - k * z - car.cdF * v) / car.unsF; z += 1e-5 * v; t += 1e-5; } o.offWant = t; }
    // a 10 mm step up: the load rings at the wheel hop
    { const q = settle(); let last = 0, prev = 0, ups = [], mean = 0;
      for (let t = 0; t < 0.5; t += 0.0005) { stepCar(car, q, { steer: 0, throttle: 0.12, brake: 0, road: { z: [0.01, 0, 0, 0] } }, 0.0005);
        const dv = q.zuV[0]; if (prev > 0 && dv <= 0) ups.push(t); prev = dv; }
      o.hop = ups.length > 1 ? 1 / (ups[1] - ups[0]) : 0;
      // the corner's own: (ks/2 + bar + kt) on the wheel, damped by cs
      const k = car.ksF / 2 + car.KaF / (car.tF * car.tF) + car.ktF, w0 = Math.sqrt(k / car.unsF), z = car.cdF / (2 * Math.sqrt(k * car.unsF));
      o.hopWant = w0 * Math.sqrt(Math.max(0, 1 - z * z)) / (2 * Math.PI); o.ups = ups.length; }
    out.push(o);
  }
  return out;
});
await browser.close();
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
for (const o of R) {
  console.log(`${o.name.padEnd(24)} loads ${o.sum.toFixed(0)} N (weight and downforce ${o.want.toFixed(0)}); off the road ${(o.off * 1000).toFixed(0)} ms ` +
    `(quarter car ${(o.offWant * 1000).toFixed(0)}, half step ${(o.offHalf * 1000).toFixed(1)}); right front ${o.right > 0 ? '+' : ''}${o.right.toFixed(0)} N, rears within ${o.rear.toFixed(0)} N; ` +
    `wheel hop ${o.hop.toFixed(1)} Hz (quarter car ${o.hopWant.toFixed(1)})`);
  if (!near(o.sum, o.want, 0.005)) fails.push(`${o.name}: the four loads do not add up to the weight`);
  if (!(o.off > 0) || !near(o.off, o.offWant, 0.10)) fails.push(`${o.name}: the time off the road is not the quarter car's`);
  if (!near(o.offHalf, o.off, 0.02)) fails.push(`${o.name}: half the step gives another time off the road`);
  if (!(o.right > 0)) fails.push(`${o.name}: the bar does not load the other front wheel`);
  if (!(o.rear < 0.25 * o.f0)) fails.push(`${o.name}: the rear loads move by more than a quarter of a front's`);
  if (!near(o.hop, o.hopWant, 0.08)) fails.push(`${o.name}: the wheel hop is not the quarter car's`);
}
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
