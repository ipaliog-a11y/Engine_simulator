// Anti-dive and anti-lift in the stepped car (build 367, plans/small-physics.md step 2).
//
// WHY THIS EXISTS. All the pitch under braking went through the springs; the links carry a share of it, from each
// axle's side-view swing arm (SUSP_GEO svF/svR, Milliken RCVD ch. 17). What must hold, braking steadily in a straight
// line in neutral (M3 E46: strut / multi-link; MX-5: wishbones), downforce off:
//   · the body's pitch matches a reference worked out apart from stepCar: each corner sinks by its spring's load,
//     the transfer m ax h / (2L) less the link's share Fx e/d, over the wheel rate, plus the transfer over the tyre's;
//   · the same with the links carrying nothing (d without end): all of it through the springs, as before build 367;
//   · so the pitch falls by the anti-dive share, and that share is 10-60 %.
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
  for (const n of ['BMW M3 (E46', 'Mazda MX-5']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n)));
    const o = { name: n };
    for (const flat of [false, true]) {
      const car = driveCar(); car.clA = 0;
      if (flat) { car.svF = [0, 1e9]; car.svR = [0, 1e9]; }
      const s = driveRolling(car, 140);
      for (let t = 0; t < 0.5; t += 0.001) stepCar(car, s, { steer: 0, throttle: 0.2, brake: 0 }, 0.001);
      for (let t = 0; t < 2.5; t += 0.001) stepCar(car, s, { steer: 0, throttle: 0, brake: 0.25, gear: 0 }, 0.001);
      let N = 0, p = 0, ax = 0; const fx = [0, 0, 0, 0];
      for (let t = 0; t < 1; t += 0.001) { stepCar(car, s, { steer: 0, throttle: 0, brake: 0.25, gear: 0 }, 0.001);
        N++; p += s.pitch; ax += s.ax; for (let i = 0; i < 4; i++) fx[i] += s.Fx[i]; }
      p /= N; ax /= N; for (let i = 0; i < 4; i++) fx[i] /= N;
      // the reference: steady, each corner's drop = spring load / wheel rate + transfer / tyre rate (outboard brakes)
      const L = car.a + car.b, dW = car.m * ax * car.h / L / 2;            // the front's gain per wheel (ax < 0: dW < 0)
      const dropF = (-dW + fx[0] * car.svF[0] / car.svF[1]) / car.ksF - dW / car.ktF;
      const dropR = (dW + -fx[2] * car.svR[0] / car.svR[1]) / car.ksR + dW / car.ktR;
      o[flat ? 'flat' : 'links'] = { p, ref: (dropR - dropF) / L, ax };
    }
    out.push(o);
  }
  return out;
});
await browser.close();
const deg = x => (x * 180 / Math.PI).toFixed(3);
for (const o of R) {
  const share = 1 - o.links.p / o.flat.p, shareRef = 1 - o.links.ref / o.flat.ref;
  console.log(`${o.name.padEnd(12)} at ${(o.links.ax / 9.81).toFixed(2)} g: pitch ${deg(o.links.p)} deg (reference ${deg(o.links.ref)}); ` +
    `no links ${deg(o.flat.p)} (reference ${deg(o.flat.ref)}); anti share ${(share * 100).toFixed(1)} % (reference ${(shareRef * 100).toFixed(1)} %)`);
  for (const k of ['links', 'flat']) if (!(Math.abs(o[k].p / o[k].ref - 1) < 0.01)) fails.push(`${o.name} (${k}): pitch off its reference by more than 1 %`);
  if (!(Math.abs(share - shareRef) < 0.01)) fails.push(`${o.name}: the pitch does not fall by the anti share`);
  if (!(shareRef > 0.1 && shareRef < 0.6)) fails.push(`${o.name}: anti share outside 10-60 %`);
}
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
