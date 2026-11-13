// A driver for the stepped car: round a circuit's racing line, with opposite lock (build 269).
//
// WHY THIS EXISTS. The lap solver takes a car round a circuit at the limit in one solve; a driving game needs the
// stepped car to get round the same line from a wheel and two pedals. Build 264 tried and the rear-drivers spun at
// the first fast corner. driveDriver() is the driver that holds them. What must hold:
//   · round the racing line with the road's height, a flying lap is within 5% of the lap solver's on five cars of
//     different kinds (rear, front and all-wheel drive, rear-engined with wings, electric), never more than 4 m off
//     the line, the car never more than 25 degrees sideways;
//   · a slide is caught: on a circle near the limit, with the car thrown 0.6 rad/s into a spin, the driver applies
//     opposite lock and the car is back within 4 degrees of straight in 4 s, still on its circle;
//   · the driver reads only its arguments, and a line is plain data;
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
  const out = { cars: [] };
  const place = (car, line) => { const s = driveState(car); s.x = line[0].x; s.y = line[0].y; s.psi = Math.atan2(line[1].y - line[0].y, line[1].x - line[0].x);
    s.vx = line[0].v; s.w = s.w.map(() => s.vx / car.r);
    for (let g = 1; g <= car.ratios.length; g++) { s.gear = g; if (s.vx / car.r * car.ratios[g - 1] * car.fd * 30 / Math.PI < 0.9 * car.redline) break; }
    s.we = s.vx / car.r * car.ratios[s.gear - 1] * car.fd; return s; };
  for (const n of ['Mazda MX-5', 'Honda Civic Type R (FK8', 'Subaru Impreza', 'Porsche 911 GT3', 'Tesla Model 3']) {
    loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n)));
    const lap = simulateLap('tech'), line = driveLine(lap), N = line.length, car = driveCar(), s = place(car, line), d = { i: 0 };
    car.esp = false;                                  // a hot lap is driven with the stability control off (build 279; with it, test174)
    const o = { name: vehicle.chLabel, solver: lap.lap, lap: 0, e: 0, beta: 0, plain: JSON.stringify(line).length > 0 && line.every(q => Object.values(q).every(Number.isFinite)) };
    let laps = 0, t1 = 0, prev = 0;
    while (s.t < 300) {
      stepCar(car, s, driveDriver(car, s, line, d), 0.01);
      o.e = Math.max(o.e, Math.abs(d.e)); o.beta = Math.max(o.beta, Math.abs(Math.atan2(s.vy, Math.max(1, s.vx))) * 180 / Math.PI);
      if (Math.abs(d.e) > 15 || s.vx < 1) { o.off = `left the line at point ${d.i} of ${N}, ${s.t.toFixed(1)} s`; break; }
      if (d.i < prev - N / 2 && ++laps) { if (laps === 2) { o.lap = s.t - t1; break; } t1 = s.t; }
      prev = d.i;
    }
    out.cars.push(o);
  }
  // ---- a slide, caught: a 60 m circle at 90% of the grip, then thrown into a spin
  { loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.startsWith('Mazda MX-5')));
    const car = driveCar(), Rc = 60, v = Math.sqrt(0.9 * car.mu * 9.81 * Rc), line = [];
    for (let i = 0; i < 360; i++) { const a = i * Math.PI / 180; line.push({ x: Rc * Math.sin(a), y: Rc * (1 - Math.cos(a)), v, grade: 0, kv: 0 }); }
    const s = place(car, line), d = { i: 0 };
    for (let i = 0; i < 600; i++) stepCar(car, s, driveDriver(car, s, line, d), 0.01);
    const o = { before: Math.atan2(s.vy, s.vx) * 180 / Math.PI, ay: s.ayF / 9.81 / car.mu, peak: 0, lock: 0, e: 0 };
    s.yaw += 0.6;
    for (let i = 0; i < 400; i++) { const u = driveDriver(car, s, line, d); stepCar(car, s, u, 0.01);
      o.peak = Math.max(o.peak, Math.abs(Math.atan2(s.vy, s.vx)) * 180 / Math.PI); o.lock = Math.min(o.lock, u.steer); o.e = Math.max(o.e, Math.abs(d.e)); }
    o.after = Math.atan2(s.vy, s.vx) * 180 / Math.PI; o.v = s.vx / v;
    out.slide = o; }
  out.src = driveDriver.toString();
  return out;
});
await browser.close();

console.log('car                        flying lap / solver       furthest off the line   most sideways');
for (const c of R.cars) {
  const e = 100 * (c.lap / c.solver - 1);
  console.log(`${c.name.slice(0, 26).padEnd(26)} ${c.lap.toFixed(2)} / ${c.solver.toFixed(2)} (${e >= 0 ? '+' : ''}${e.toFixed(1)}%)   ${c.e.toFixed(1)} m   ${c.beta.toFixed(0)} deg ${c.off || ''}`);
  if (c.off) fails.push(`${c.name}: ${c.off}`);
  else if (Math.abs(e) > 5) fails.push(`${c.name}: laps ${e.toFixed(1)}% from the solver`);
  if (c.e > 4) fails.push(`${c.name}: ${c.e.toFixed(1)} m off the line`);
  if (c.beta > 25) fails.push(`${c.name}: ${c.beta.toFixed(0)} degrees sideways`);
  if (!c.plain) fails.push(`${c.name}: the line is not plain numbers`);
}
const S = R.slide;
console.log(`slide: at ${S.ay.toFixed(2)} of the grip, ${S.before.toFixed(1)} deg; thrown, it reaches ${S.peak.toFixed(0)} deg, the wheel goes to ${S.lock.toFixed(2)} of opposite lock; 4 s on: ${S.after.toFixed(1)} deg, ${S.e.toFixed(1)} m off at most, ${(100 * S.v).toFixed(0)}% of the speed`);
if (!(S.peak > Math.abs(S.before) + 4)) fails.push('the throw did not start a slide: the check is empty');
if (!(S.lock < -0.05)) fails.push('no opposite lock in the slide');
if (!(Math.abs(S.after - S.before) < 4 && S.e < 4)) fails.push('the slide was not caught');
const bad = R.src.match(/\b(document|window|canvas|vehicle|engine|state|powertrain|tr)\s*[.(\[]/);
if (bad) fails.push(`driveDriver reaches outside its arguments: ${bad[0]}`);
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
