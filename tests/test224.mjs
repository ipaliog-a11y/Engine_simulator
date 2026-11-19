// Camber and toe by heave and pitch, and the weight's own roll moment (build 370, plans/small-physics.md step 3).
//
// WHY THIS EXISTS. Each wheel's camber and toe followed the axle's roll only, and the body's weight leaning added
// nothing to the roll. What must hold in the stepped car (M3 E46: strut / multi-link; MX-5: wishbones; AE86: strut /
// solid axle):
//   · in pure heave (each wheel 20 mm up on the body) an independent wheel's camber moves by its type's curve, 1/fvsa
//     a metre of travel, the top inwards, and its toe by the roll steer's own, rs / (t/2), out at the front;
//   · a solid axle's wheels neither camber nor toe in heave;
//   · cornering steadily, the body's roll per ay and each axle's roll on its springs match the full roll worked out
//     apart (springs on tyres, the roll centres, and m g arm phi), so the weight raises the roll by its share.
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
  for (const n of ['BMW M3 (E46', 'Mazda MX-5', 'Toyota Corolla Levin']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n)));
    const v = vehicle, car = driveCar(); car.clA = 0;
    const o = { name: n, geo: [v.suspFront, v.suspRear] };
    // heave: every wheel 20 mm up on the body, one tiny step
    const s = driveRolling(car, 60), d = 0.02; s.zu = [d, d, d, d];
    stepCar(car, s, { steer: 0, throttle: 0, brake: 0 }, 1e-7);
    o.heave = [0, 1, 2, 3].map(i => {
      const f = i < 2, g = SUSP_GEO[f ? v.suspFront : v.suspRear], t = f ? car.tF : car.tR, sd = i % 2 ? 1 : -1;
      const st = (i % 2 ? -1 : 1) * (f ? car.camF : car.camR), ind = g.fvsa != null;
      const rs = f ? -car.rsF : car.rsR;
      return { cam: s.camber[i] - st, camRef: ind ? sd * d / g.fvsa : 0, toe: s.toe[i], toeRef: ind ? sd * rs * d / (t / 2) : 0 };
    });
    // a steady turn, a small steer at 80 km/h; the links off, so a limited-slip's unequal drive does not roll the body
    const c = driveCar(); c.clA = 0; c.svF = [0, 1e9]; c.svR = [0, 1e9]; const r = driveRolling(c, 80);
    let N = 0, roll = 0, ay = 0, rF = 0, rR = 0;
    for (let k = 0; k < 6000; k++) {
      stepCar(c, r, { steer: 0.06, throttle: 0.2, brake: 0 }, 0.001);
      if (k >= 4000) { N++; roll += r.roll; ay += r.ay; rF += r.rr[0]; rR += r.rr[1]; }
    }
    roll /= N; ay /= N; rF /= N; rR /= N;
    const cs = (K, kt, t) => 1 / (1 / K + 2 / (kt * t * t)), C = cs(c.KaF, c.ktF, c.tF) + cs(c.KaR, c.ktR, c.tR);
    o.corner = { wshare: C / (C - c.m * 9.81 * c.rollArm) - 1, ay, roll: roll / ay, ref: c.rollFull, rF: rF / ay, rFref: c.rrAyF, rR: rR / ay, rRref: c.rrAyR };
    out.push(o);
  }
  return out;
});
await browser.close();
const deg = x => (x * 180 / Math.PI).toFixed(3);
for (const o of R) {
  console.log(`${o.name} (${o.geo.join(' / ')}), 20 mm heave:`);
  o.heave.forEach((w, i) => {
    console.log(`  wheel ${i}: camber ${deg(w.cam)} deg (curve ${deg(w.camRef)}), toe ${deg(w.toe)} deg (curve ${deg(w.toeRef)})`);
    if (!(Math.abs(w.cam - w.camRef) < 1e-6 && Math.abs(w.toe - w.toeRef) < 1e-6)) fails.push(`${o.name} wheel ${i}: heave camber or toe off its type's curve`);
  });
  const k = o.corner;
  console.log(`  steady turn at ${(k.ay / 9.81).toFixed(2)} g: roll ${deg(k.roll * 9.81)} deg/g (worked out ${deg(k.ref * 9.81)}), ` +
    `springs front ${deg(k.rF * 9.81)} (${deg(k.rFref * 9.81)}), rear ${deg(k.rR * 9.81)} (${deg(k.rRref * 9.81)}); the weight's share +${(k.wshare * 100).toFixed(1)} %`);
  for (const [a, b, w] of [[k.roll, k.ref, 'roll'], [k.rF, k.rFref, 'front springs\' roll'], [k.rR, k.rRref, 'rear springs\' roll']])
    if (!(Math.abs(a / b - 1) < 0.01)) fails.push(`${o.name}: steady ${w} off the full roll by more than 1 %`);
  if (!(k.wshare > 0.02 && k.wshare < 0.15)) fails.push(`${o.name}: the weight's share of the roll outside 2-15 %`);
}
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
