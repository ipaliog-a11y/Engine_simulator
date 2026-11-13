// The stepped car's pack is a state: a hybrid's controller and an electric car's charge (build 275).
//
// WHY THIS EXISTS. stepCar() drove a hybrid on its engine's and motor's torque added up, with a pack that never
// emptied; an electric car did not regenerate; the 918's front motor was missing. What must hold:
//   · a car carries its electric side as plain data (car.el), and a car without one carries none;
//   · flat out the charge falls, off the pedal it rises, and it stays between 0 and 1;
//   · the Ioniq and the Prius reach 100 km/h within 10% of the solver's time from the charge they hold, and slower
//     from the bottom of their charge window, where the motor's help is gone;
//   · charge-sustaining: a minute at 100 km/h from near the window's low ends higher, and from the target ends
//     within 4 points of it;
//   · energy adds up: what an electric car's pack gives over a full-throttle run is more than the car gained and
//     lost to the air and the tyres, by losses of 5 to 30%;
//   · the 918's front motor pulls at the front wheels and its engine drives the rear;
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
  const load = n => { loadVehiclePreset(FACTORY_CARS.find(x => x.name.startsWith(n))); return driveCar(); };
  const plain = v => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) ? v.every(plain) : Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));
  const rolling = (car, v) => { const s = driveState(car); s.vx = v; s.w = s.w.map(() => v / car.r);
    for (let g = car.ratios.length; g >= 1; g--) { s.gear = g; if (v / car.r * car.ratios[g - 1] * car.fd * 30 / Math.PI > 0.35 * car.redline) break; }
    s.we = v / car.r * car.ratios[s.gear - 1] * car.fd; return s; };
  const to100 = (car, soc) => { const s = driveState(car); if (soc != null) s.soc = soc; while (s.t < 40 && s.vx < 27.78) stepCar(car, s, { throttle: 1 }, 0.01); return s; };
  out.none = load('Mazda MX-5').el;
  for (const n of ['Hyundai Ioniq', 'Toyota Prius', 'Porsche 918', 'Tesla Model 3']) {
    const car = load(n), el = car.el, o = { name: vehicle.chLabel, plain: plain(car), solver: simulateAccel().t100, win: [el.lo, el.tg, el.hi], soc0: el.soc0, plug: !!engine.hyPlug };
    if (el.ml) { const pk = engine.hy.pack, at = (soc, r) => { const m = driveLerp(el.crpm, el.mot, r), k = driveHelp(el, soc, r, m); return { k, over: k * m * r * Math.PI / 30 + driveLerp(el.crpm, el.ml, r) * k - packMaxPower(pk, soc) * el.share }; };
      o.pack = [el.lo + 0.02, 0.6].map(soc => [0.3, 0.6, 0.9].map(f => at(soc, f * car.redline))); }
    if (el.front) { const F = el.front, NT = F.loss.length / F.F.length, k = 80; o.fl = [F.loss[k * NT + 2], F.loss[k * NT + 4]]; }
    o.t100 = to100(car).t; o.low = to100(car, el.lo).t;
    // flat out for 15 s, then off the pedal for 10
    { const s = driveState(car); let lo = 1, hi = 0; const m = car.m, E0 = s.soc * el.capJ; let work = 0;
      for (let i = 0; i < 1500; i++) { stepCar(car, s, { throttle: 1 }, 0.01); work += (0.5 * 1.2 * car.cdA * s.vx ** 3 + car.crr * m * 9.81 * s.vx) * 0.01; lo = Math.min(lo, s.soc); hi = Math.max(hi, s.soc); }
      o.flat = s.soc; o.gave = E0 - s.soc * el.capJ; o.got = 0.5 * m * s.vx * s.vx + 4 * 0.5 * car.Iw * (s.vx / car.r) ** 2 + work;
      for (let i = 0; i < 1000; i++) { stepCar(car, s, { throttle: 0 }, 0.01); lo = Math.min(lo, s.soc); hi = Math.max(hi, s.soc); if (i === 300) o.regenKW = -s.Pm / 1000; }
      o.lifted = s.soc; o.range = [lo, hi]; }
    // a minute at 100 km/h, from near the low and from the target
    o.cruise = [el.lo + 0.02, el.tg].map(s0 => { const s = rolling(car, 27.78); s.soc = s0; let thr = 0.3;
      for (let i = 0; i < 6000; i++) { thr = Math.max(0, Math.min(1, thr + 0.002 * (27.78 - s.vx))); stepCar(car, s, { throttle: thr }, 0.01); } return [s0, s.soc]; });
    if (el.front) { const s = rolling(car, 15); s.soc = 0.5; for (let i = 0; i < 50; i++) stepCar(car, s, { throttle: 1 }, 0.01); o.front = (s.Fx[0] + s.Fx[1]) / 2; o.rear = (s.Fx[2] + s.Fx[3]) / 2; o.drive = car.drive; }
    out.cars.push(o);
  }
  return out;
});
await browser.close();

const pc = x => (100 * x).toFixed(1) + '%';
for (const o of R.cars) {
  const hyb = o.name.startsWith('Hyundai') || o.name.startsWith('Toyota'), ev = o.name.startsWith('Tesla');
  console.log(`${o.name.slice(0, 26).padEnd(26)} 0-100 ${o.t100.toFixed(2)} s (solver ${o.solver.toFixed(2)}), from the low ${o.low.toFixed(2)}; 15 s flat ${pc(o.flat)}, 10 s off the pedal ${pc(o.lifted)} (${o.regenKW.toFixed(0)} kW back); a minute at 100 km/h: ${o.cruise.map(q => pc(q[0]) + ' -> ' + pc(q[1])).join(', ')}` + (o.front != null ? `; front wheels ${o.front.toFixed(0)} N each, rear ${o.rear.toFixed(0)} N` : ''));
  if (!o.plain) fails.push(`${o.name}: the car is not plain data`);
  // build 279: a plug-in sets off full; the help is cut to the pack's own power at the charge; the front motor's own losses
  if (o.win[1] !== o.win[2] && o.soc0 !== (o.plug ? o.win[2] : o.win[1])) fails.push(`${o.name}: starts at ${pc(o.soc0)}, not ${o.plug ? 'full' : 'at its target'}`);
  if (o.pack) { const [lo, mid] = o.pack; console.log(`  the pack carries ${lo.map(q => (100 * q.k).toFixed(1)).join(', ')}% of the full help near the low, ${mid.map(q => (100 * q.k).toFixed(1)).join(', ')}% at 60%`);
    if ([...lo, ...mid].some(q => q.over > 1 || q.k > 1)) fails.push(`${o.name}: the motor's help draws more than packMaxPower at the charge`);
    if (lo.some((q, i) => q.k > mid[i].k)) fails.push(`${o.name}: a lower charge carries more of the help`); }
  if (o.fl && !(o.fl[0] > 0 && o.fl[0] < o.fl[1])) fails.push(`${o.name}: the front motor's losses do not follow its torque`);
  if (!(o.flat < o.soc0 && o.lifted > o.flat && o.regenKW > 1)) fails.push(`${o.name}: the charge does not fall flat out and come back off the pedal`);
  if (!(o.range[0] >= 0 && o.range[1] <= 1)) fails.push(`${o.name}: the charge left 0..1`);
  if (hyb && Math.abs(o.t100 / o.solver - 1) > 0.10) fails.push(`${o.name}: 0-100 ${o.t100.toFixed(2)} s against the solver's ${o.solver.toFixed(2)}`);
  if (!ev && !(o.low > o.t100 * 1.03)) fails.push(`${o.name}: with the pack at its low the car is no slower`);
  if (!ev && !(o.cruise[0][1] > o.cruise[0][0] + 0.01)) fails.push(`${o.name}: a low pack is not charged at a cruise`);
  if (!ev && !(Math.abs(o.cruise[1][1] - o.cruise[1][0]) <= 0.04)) fails.push(`${o.name}: the charge does not hold its target at a cruise (${pc(o.cruise[1][1])})`);
  if (ev) { const loss = 1 - o.got / o.gave; console.log(`  the pack gave ${(o.gave / 1e6).toFixed(2)} MJ for ${(o.got / 1e6).toFixed(2)} MJ of motion, air and rolling (${(100 * loss).toFixed(0)}% lost)`);
    if (!(loss > 0.05 && loss < 0.30)) fails.push(`${o.name}: the pack's energy does not add up (${(100 * loss).toFixed(0)}% lost)`); }
  if (o.front != null && !(o.front > 200 && o.rear > 200 && o.drive === 'rwd')) fails.push(`${o.name}: the front motor does not pull at the front wheels`);
}
if (R.none !== null) fails.push('a car with no motor carries an electric side');
for (const e of errors) fails.push(e);
if (fails.length) { console.log('\nFAIL'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nPASS');
