// Lift-off and braking in a turn, steering held (build 329, phase G8). A test only.
//
// WHY THIS EXISTS. The plan's G8: the stepped car (stepCar) through the two ISO open-loop manoeuvres in a turn, on five
// cars. Steady state is reached on the circle by driveDriver; then the steering is held at its mean over the last 3 s
// and the gear held (the standards' open-loop method). Read 1 s after the release or the brake (t0 + 1 s).
//   · ISO 9816:2018, power-off in a turn: 40 m radius, 4 m/s^2, the throttle released at once (PROBABLE: the standard
//     is paywalled; these are its commonly quoted preferred conditions);
//   · ISO 7975:2019, braking in a turn: 100 m radius, 5 m/s^2, brake pedal set for 3 and 5 m/s^2 of brakes alone
//     (PROBABLE, as above). The deceleration reached (with drag and the engine) is reported.
// What must hold, by path curvature at 1 s over that before (the yaw rate ratio is reported):
//   · the rear-drivers tighten their line (ratio > 1), unless named in LIFT_KNOWN with the reason;
//   · the front-drivers keep it (ratio >= 1: they don't run wide); the all-wheel driver is reported only;
//   · a car in LIFT_KNOWN still runs wide (else the gap has closed: take it off), and tightens with an open rear diff,
//     which is the reason given;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
// Named gaps (may only shrink). The friction diff is modelled 2-way (diffCoupling: the same locking on coast as on
// drive), so under engine braking it holds the rear wheels to one speed and the braked outer wheel pushes the line wide.
// The real car (the Performance Pack preset) has a Torsen (Ford), which also biases on the coast; Ford publishes no
// bias ratio, so no coast ramp closes this (build 405).
const LIFT_KNOWN = { 'Ford Mustang GT (2018': 'diff locks on the coast as on drive (a friction 2-way; the real unit is a Torsen, no bias ratio published)' };
const CARS = ['Mazda MX-5 1.6', 'Ford Mustang GT (2018', 'Honda Civic Type R (FK8', 'VW Golf GTI (Mk7', 'Subaru Impreza WRX STI'];
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const R = await page.evaluate(([CARS, KNOWN]) => {
  const mk = (n, o) => { loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n))); return Object.assign(driveCar(), o); };
  const run = (car, Rc, ay0, dec) => {
    const v = Math.sqrt(ay0 * Rc), line = [];
    for (let i = 0; i < 1440; i++) { const a = i * Math.PI / 720; line.push({ x: Rc * Math.sin(a), y: Rc * (1 - Math.cos(a)), v, grade: 0, kv: 0 }); }
    const s = driveState(car), d = { i: 0 };
    s.vx = v; s.w = s.w.map(() => v / car.r); s.gear = 2; s.we = v / car.r * car.ratios[1] * car.fd;
    let st = 0, n = 0;
    for (let i = 0; i < 2000; i++) { const u = driveDriver(car, s, line, d); stepCar(car, s, u, 0.01); if (i >= 1700) { st += u.steer; n++; } }
    const kap = s => s.yaw / Math.hypot(s.vx, s.vy), y0 = s.yaw, k0 = kap(s), gear = s.gear;
    const u = { steer: st / n, throttle: 0, brake: dec ? dec * car.m / car.brakeF : 0, gear };
    for (let i = 0; i < 100; i++) stepCar(car, s, u, 0.01);
    return { yaw: s.yaw / y0, kap: kap(s) / k0, ax: -s.ax, gear };
  };
  return CARS.map(n => ({ n, drive: mk(n).drive, lift: run(mk(n), 40, 4), b3: run(mk(n), 100, 5, 3), b5: run(mk(n), 100, 5, 5),
    open: KNOWN[n] ? run(mk(n, { diff: { type: 'open' } }), 40, 4) : null }));
}, [CARS, LIFT_KNOWN]);
await browser.close();

const f = x => x.toFixed(3);
for (const r of R) {
  console.log(`${r.n} (${r.drive})`);
  for (const [k, lab] of [['lift', 'ISO 9816 lift-off, 40 m, 4 m/s2'], ['b3', 'ISO 7975 brake 3, 100 m, 5 m/s2'], ['b5', 'ISO 7975 brake 5, 100 m, 5 m/s2']]) {
    const m = r[k], known = k === 'lift' && LIFT_KNOWN[r.n];
    console.log(`  ${lab}: curvature x${f(m.kap)}, yaw rate x${f(m.yaw)}, decel ${m.ax.toFixed(2)} m/s2, gear ${m.gear}${known ? '  [KNOWN: ' + known + ']' : ''}`);
    if (r.drive === 'rwd' && !known && !(m.kap > 1)) fails.push(`${r.n}, ${lab}: a rear-driver does not tighten (x${f(m.kap)})`);
    if (r.drive === 'fwd' && !(m.kap >= 1)) fails.push(`${r.n}, ${lab}: a front-driver runs wide (x${f(m.kap)})`);
    if (known && m.kap > 1) fails.push(`${r.n}: now tightens on lift-off (x${f(m.kap)}); take it off LIFT_KNOWN`);
  }
  if (r.open) { console.log(`  lift-off with an open rear diff: curvature x${f(r.open.kap)}`);
    if (!(r.open.kap > 1)) fails.push(`${r.n}: does not tighten with an open diff either; the reason in LIFT_KNOWN is wrong`); }
}
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const x of fails) console.log('  - ' + x); process.exit(1); }
console.log('\nPASS');
