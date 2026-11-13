// The stepped car through a double lane change (build 277).
//
// WHY THIS EXISTS. Phase E asked that the stepped car, with its driver, give sensible numbers in a lane change. This is
// ISO 3888-2's (the "moose test"): a 12 m lane 1.1 x the car's width + 0.25 m wide, 13.5 m on a lane the car's width
// + 1 m wide and 1 m further over, 12.5 m on a 3 m lane back in line; the throttle released at the entry, top gear.
// The car's own width and overhangs (CAR_DIMS, build 272) set the cones. A test driver finds the line over several
// runs; here the best of twelve smooth lines. What must hold:
//   · the highest entry speed with no cone touched is between 55 and 90 km/h for four cars of different kinds
//     (magazines publish 65-85 for road cars), and the car on track tyres is quicker than the one on road tyres;
//   · at that speed the tyres work near their grip (peak 0.6 to 1.15 of it) and the car stays under 20 degrees sideways;
//   · 8 km/h faster on the same line, it touches a cone;
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
  const out = [];
  // the line: two smooth steps (a quintic each), from x = A0 to A1 across and from B0 to B1 back
  const mk = (G, v, [A0, A1, B0, B1]) => { const line = [], sm = (x, x0, x1, y0, y1) => { const u = Math.max(0, Math.min(1, (x - x0) / (x1 - x0))); return y0 + (y1 - y0) * (u * u * u * (10 - 15 * u + 6 * u * u)); };
    for (let x = -60; x <= 140; x += 0.5) line.push({ x, y: x <= (A1 + B0) / 2 ? sm(x, A0, A1, 0, G.y2) : sm(x, B0, B1, G.y2, G.y3), v, grade: 0, kv: 0 }); return line; };
  const run = (car, D, vk, shape) => { const b = D.w, w1 = 1.1 * b + 0.25, w2 = b + 1, G = { w1, w2, y2: w1 / 2 + 1 + w2 / 2, y3: (3 - w1) / 2 };
    const v = vk / 3.6, line = mk(G, v, shape), s = driveState(car), d = { i: 0 }; s.x = -60; s.vx = v; s.w = s.w.map(() => v / car.r);
    for (let g = car.ratios.length; g >= 1; g--) { s.gear = g; if (v / car.r * car.ratios[g - 1] * car.fd * 30 / Math.PI >= 2000) break; }   // top gear, at least 2000 rpm
    s.we = v / car.r * car.ratios[s.gear - 1] * car.fd;
    const o = { ok: true, ay: 0, beta: 0 };
    while (s.x < 70 && s.t < 20) { const u = driveDriver(car, s, line, d); u.gear = s.gear; if (s.x + car.a + D.ovF > 0) { u.throttle = 0; u.brake = 0; }
      stepCar(car, s, u, 0.005); o.ay = Math.max(o.ay, Math.abs(s.ayF) / 9.81); o.beta = Math.max(o.beta, Math.abs(Math.atan2(s.vy, Math.max(1, s.vx))) * 180 / Math.PI);
      const c = Math.cos(s.psi), sn = Math.sin(s.psi);                    // the body's four corners against the cones
      for (const [dx, dy] of [[car.a + D.ovF, b / 2], [car.a + D.ovF, -b / 2], [-car.b - D.ovR, b / 2], [-car.b - D.ovR, -b / 2]]) { const X = s.x + dx * c - dy * sn, Y = s.y + dx * sn + dy * c;
        if ((X >= 0 && X <= 12 && Math.abs(Y) > w1 / 2) || (X >= 25.5 && X <= 36.5 && Math.abs(Y - G.y2) > w2 / 2) || (X >= 49 && X <= 61 && Math.abs(Y - G.y3) > 1.5)) o.ok = false; } }
    return o; };
  for (const n of ['Mazda MX-5', 'Honda Civic Type R (FK8', 'Porsche 911 GT3', 'Ford F-150']) {
    const p = FACTORY_CARS.find(x => x.name.startsWith(n)); loadVehiclePreset(p); const car = driveCar(), D = carDims(p);
    let best = 0, shape = null;
    for (const A0 of [9, 10, 11]) for (const A1 of [25, 28]) for (const B0 of [34, 36]) { const sh = [A0, A1, B0, 50];
      if (!run(car, D, Math.max(40, best + 1), sh).ok) continue; let lo = Math.max(40, best + 1), hi = 120;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (run(car, D, m, sh).ok) lo = m; else hi = m; }
      if (lo > best) { best = lo; shape = sh; } }
    const r = shape ? run(car, D, best, shape) : { ay: 0, beta: 0 };
    out.push({ name: vehicle.chLabel, w: D.w, mu: car.mu, best, shape, ay: r.ay, beta: r.beta, over: shape ? run(car, D, best + 8, shape).ok : true });
  }
  return out;
});
await browser.close();

for (const o of R) {
  console.log(`${o.name.slice(0, 28).padEnd(28)} ${o.w.toFixed(2)} m wide: ${o.best} km/h in (line ${o.shape}), ${o.ay.toFixed(2)} g at most (${(o.ay / o.mu).toFixed(2)} of the grip), ${o.beta.toFixed(0)} deg sideways`);
  if (!(o.best >= 55 && o.best <= 90)) fails.push(`${o.name}: ${o.best} km/h through the lane change`);
  if (!(o.ay / o.mu >= 0.6 && o.ay / o.mu <= 1.15)) fails.push(`${o.name}: ${o.ay.toFixed(2)} g on tyres of ${o.mu.toFixed(2)}`);
  if (!(o.beta < 20)) fails.push(`${o.name}: ${o.beta.toFixed(0)} degrees sideways`);
  if (o.over) fails.push(`${o.name}: 8 km/h faster it still touches nothing`);
}
const gt3 = R.find(o => o.name.startsWith('Porsche')), mx5 = R.find(o => o.name.startsWith('Mazda'));
if (!(gt3.best > mx5.best)) fails.push('the 911 GT3 on track tyres is no quicker than the MX-5 on road tyres');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nPASS');
