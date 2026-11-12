// The stepped car's turbo has a shaft (build 273).
//
// WHY THIS EXISTS. stepCar() gave a turbo engine its settled boost the moment the pedal went down. The bench, the
// 0-100 and the lap integrate the shaft (advanceShaft); a game's car must lag the same way, from plain data alone.
// What must hold:
//   · the car's tables step the shaft as advanceShaft does: held flat out at half and at 0.8 of the redline from a
//     stopped shaft, the boost after 3 s is within 5% and the time to 90% of it within 15%, on three turbo cars;
//     at 70% load and 0.6 of the redline the boost is within 10%;
//   · floored from a light cruise in a high gear, the car starts with little boost and less pull than the same car
//     with settled boost, and has its boost within 3 s; off the pedal the boost falls (only as fast as the
//     closed engine empties the charge pipes);
//   · a car without a turbo carries no tables;
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
  const out = { cars: [] }, load = n => { loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n))); return driveCar(); };
  for (const n of ['Subaru Impreza WRX STI', 'Suzuki Alto Works', 'Toyota GR Yaris']) {
    const car = load(n), pt = powertrain(), o = { name: vehicle.chLabel || n, runs: [] };
    for (const [f, th] of [[0.5, 1], [0.8, 1], [0.6, 0.7]]) {
      const rpm = f * car.redline, s = { shaftE: 0, boost: 0 }, A = [], B = []; let E = 0, b = 0;
      for (let k = 0; k < 300; k++) { const r = pt.advanceShaft(E, rpm, b, th, 0.01); E = r.shaftE; b = r.boost; driveShaft(car, s, rpm, th, 0.01); A.push(b); B.push(s.boost); }
      const t90 = X => (X.findIndex(x => x >= 0.9 * b) + 1) / 100;
      o.runs.push({ f, th, app: b, car: s.boost, tApp: t90(A), tCar: t90(B) });
    }
    out.cars.push(o);
  }
  // ---- floored from a cruise in fourth, against the same car with its boost always settled
  { const car = load('Subaru Impreza WRX STI'), settled = Object.assign({}, car, { turbo: null }), g = 4, rpm0 = 0.45 * car.redline;
    const start = c => { const s = driveState(c); s.gear = g; s.we = rpm0 * Math.PI / 30; s.vx = s.we / (c.ratios[g - 1] * c.fd) * c.r; s.w = s.w.map(() => s.vx / c.r); s.rpm = rpm0; return s; };
    const a = start(car), z = start(settled), u = { throttle: 1, gear: g };
    for (let i = 0; i < 5; i++) { stepCar(car, a, u, 0.01); stepCar(settled, z, u, 0.01); }
    out.pull = { b03: a.boost, ax03: a.ax / z.ax };
    for (let i = 0; i < 295; i++) { stepCar(car, a, u, 0.01); stepCar(settled, z, u, 0.01); }
    Object.assign(out.pull, { b3: a.boost, ax3: a.ax / z.ax, v: a.vx / z.vx });
    for (let i = 0; i < 100; i++) stepCar(car, a, { throttle: 0, gear: g }, 0.01);
    out.pull.lift = a.boost; }
  out.na = load('Mazda MX-5').turbo;
  return out;
});
await browser.close();

for (const c of R.cars) for (const r of c.runs) {
  console.log(`${c.name.slice(0, 26).padEnd(26)} ${r.f} of redline, load ${r.th}: boost ${r.car.toFixed(2)} bar (the app's shaft ${r.app.toFixed(2)}), 90% in ${r.tCar} s (${r.tApp})`);
  if (Math.abs(r.car - r.app) > (r.th < 1 ? 0.10 : 0.05) * r.app) fails.push(`${c.name} at ${r.f}/${r.th}: boost ${r.car.toFixed(3)} against ${r.app.toFixed(3)}`);
  if (r.th === 1 && Math.abs(r.tCar - r.tApp) > Math.max(0.03, 0.15 * r.tApp)) fails.push(`${c.name} at ${r.f}: 90% of boost in ${r.tCar} s against ${r.tApp}`);
}
const p = R.pull;
console.log(`floored in fourth: boost ${p.b03.toFixed(2)} bar and ${(100 * p.ax03).toFixed(0)}% of the settled car's pull after 0.05 s; ${p.b3.toFixed(2)} bar and ${(100 * p.ax3).toFixed(0)}% after 3 s, at ${(100 * p.v).toFixed(1)}% of its speed; ${p.lift.toFixed(2)} bar 1 s after a lift`);
if (!(p.ax03 < 0.85)) fails.push('floored, the car pulls as if its boost were already there');
if (!(p.b3 > 1.5 * p.b03 && p.ax3 > 0.95)) fails.push('the boost has not come in 3 s');
if (!(p.v < 1)) fails.push('lag cost no speed');
if (!(p.lift < 0.8 * p.b3)) fails.push('a lift does not let the boost go');
if (R.na !== null) fails.push('a car without a turbo carries turbo tables');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nPASS');
