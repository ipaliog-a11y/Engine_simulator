// The car stepped in time: four wheels, a driver's inputs, one step (build 263).
//
// WHY THIS EXISTS. v1.0 has to carry every value a driving game needs. The lap and the 0-100 solve a whole run at the
// limit; a game needs the car one step later, given the wheel, the pedals and the gear: stepCar(). What must hold:
//   · it agrees with the solvers it sits beside: 0-100 within 20% of simulateAccel on five cars of different kinds,
//     a stop from 100 km/h at 0.85-1.25 of the tyres' braking grip, a skidpad at 0.80-1.02 of their lateral grip;
//   · the car does what the lap cannot: lifting mid-corner tightens the line; power spins a rear-driver and pushes
//     a front-driver wide; without ABS the wheels lock and the stop is longer;
//   · the tyre's cornering stiffness per unit load falls with the load as measured tyres' does (build 267): at 2/3
//     and 4/3 of its nominal load, within 0.07 of Milliken's race tyre (1.09 and 0.80 of the nominal figure);
//   · the road's height (build 268): a 10% climb slows a coasting car by g sin more than the flat, and a crest takes
//     m v² kv off the tyres;
//   · a car is plain data: through JSON and back it drives to the same place, to the last digit;
//   · stepCar reads only its arguments: nothing of the page or of this app's globals;
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
  const out = { cars: [], src: {} };
  const load = n => { loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.startsWith(n))); return driveCar(); };
  // a driver who holds a circle of radius R at speed vt (left turn, centre at (0, R))
  const circle = (car, s, R, vt, thr) => {
    const want = Math.atan((car.a + car.b) / R) / car.steerLock, r0 = Math.hypot(s.x, s.y - R);
    const st = Math.max(-1, Math.min(1, want + 0.08 * (r0 - R) + 0.6 * (vt / R - s.yaw)));
    return { steer: st, throttle: thr != null ? thr : Math.max(0, Math.min(1, (vt - s.vx) * 0.5 + 0.15)) };
  };
  for (const n of ['Mazda MX-5', 'Volkswagen Golf GTI', 'Ford Mustang GT', 'Porsche 911 GT3', 'Subaru Impreza']) {
    const car = load(n), A = simulateAccel(), o = { name: vehicle.chLabel, solver: A.t100, mu: car.mu, muX: car.muX, drive: car.drive };
    car.tc = true;                                    // flat pedal, the ECU holding the tyres at their peak
    let s = driveState(car);
    while (s.t < 40 && s.vx * 3.6 < 100) stepCar(car, s, { throttle: 1 }, 0.01);
    o.t100 = s.t;
    while (s.vx * 3.6 < 110 && s.t < 80) stepCar(car, s, { throttle: 1 }, 0.01);
    let x0 = null; while (s.vx > 0.1 && s.t < 120) { stepCar(car, s, { brake: 1 }, 0.01); if (x0 == null && s.vx * 3.6 <= 100) x0 = s.x; }
    o.stop = s.x - x0; o.decel = (100 / 3.6) ** 2 / (2 * o.stop) / 9.81;
    car.tc = false;
    s = driveState(car); let vt = 8, ay = 0;
    for (let i = 0; i < 9000; i++) { vt += 0.002; stepCar(car, s, circle(car, s, 40, vt), 0.01);
      if (i > 500 && Math.abs(Math.hypot(s.x, s.y - 40) - 40) < 3) ay = Math.max(ay, Math.abs(s.ayF) / 9.81);
      if (Math.abs(Math.atan2(s.vy, s.vx)) > 0.5) break; }
    o.skid = ay;
    out.cars.push(o);
  }
  // ---- lift-off: settle on a 60 m circle at 85% of the grip, then lift
  { const car = load('Mazda MX-5'), s = driveState(car), R = 60, vt = Math.sqrt(0.85 * car.mu * 9.81 * R);
    for (let i = 0; i < 1500; i++) stepCar(car, s, circle(car, s, R, Math.min(vt, 5 + i * 0.02)), 0.01);
    const k0 = s.yaw / s.vx, st = circle(car, s, R, vt).steer; let k1 = 0;
    for (let i = 0; i < 60; i++) { stepCar(car, s, { steer: st, throttle: 0 }, 0.01); k1 = Math.max(k1, s.yaw / s.vx); }
    out.lift = { before: k0 * R, after: k1 * R }; }
  // ---- power in a corner, second gear held, no traction control
  const power = n => { const car = load(n); car.tc = false; const s = driveState(car), R = 30, vt = Math.sqrt(0.6 * car.mu * 9.81 * R);
    for (let i = 0; i < 1200; i++) { const u = circle(car, s, R, Math.min(vt, 4 + i * 0.02)); u.gear = s.vx > 6 ? 2 : 1; stepCar(car, s, u, 0.01); }
    const st = circle(car, s, R, vt).steer; let beta = 0, rmax = 0, aF = 0, aR = 0;
    for (let i = 0; i < 300; i++) { stepCar(car, s, { steer: st, throttle: 1, gear: 2 }, 0.01);
      beta = Math.max(beta, Math.abs(Math.atan2(s.vy, s.vx))); rmax = Math.max(rmax, Math.hypot(s.x, s.y - R));
      aF = Math.max(aF, Math.abs(s.alpha[0]), Math.abs(s.alpha[1])); aR = Math.max(aR, Math.abs(s.alpha[2]), Math.abs(s.alpha[3])); }
    return { beta: beta * 180 / Math.PI, r: rmax, aF: aF * 180 / Math.PI, aR: aR * 180 / Math.PI }; };
  out.rwd = power('Ford Mustang GT'); out.fwd = power('Honda Civic Type R (FK8');
  // ---- no ABS
  { const car = load('Mazda MX-5'); const stop = abs => { car.abs = abs; const s = driveState(car); s.vx = 100 / 3.6; s.w = s.w.map(() => s.vx / car.r); s.we = 400; s.gear = 0;
      let lock = false; while (s.vx > 0.1 && s.t < 30) { stepCar(car, s, { brake: 1, gear: 0 }, 0.01); if (s.vx > 5 && Math.abs(s.w[0]) < 0.5) lock = true; } return { d: s.x, lock }; };
    out.abs = stop(true); out.noAbs = stop(false); }
  // ---- plain data
  { const car = load('Subaru Impreza'), copy = JSON.parse(JSON.stringify(car)); const run = c => { const s = driveState(c);
      for (let i = 0; i < 800; i++) stepCar(c, s, { throttle: 1, steer: i > 400 ? 0.2 : 0 }, 0.01); return [s.x, s.y, s.psi, s.vx, s.rpm]; };
    out.same = JSON.stringify(run(car)) === JSON.stringify(run(copy)); out.fields = Object.values(car).every(v => ['number', 'string', 'boolean'].includes(typeof v) || Array.isArray(v));
    const s = driveState(car), t0 = performance.now(); for (let i = 0; i < 2000; i++) stepCar(car, s, { throttle: 0.5 }, 0.01); out.ms = performance.now() - t0; }
  { const car = load('Mazda MX-5'), k = x => driveTyre(car, x * car.FzRef, 0, 1e-4, false)[1] / (x * car.FzRef); out.ccLoad = [k(2 / 3) / k(1), k(4 / 3) / k(1)]; }
  { const car = load('Mazda MX-5'), go = u => { const s = driveState(car); s.vx = 30; s.w = s.w.map(() => 30 / car.r); s.gear = 0;
      for (let i = 0; i < 10; i++) stepCar(car, s, Object.assign({ gear: 0 }, u), 0.01); return { v: s.vx, Fz: s.Fz.reduce((a, b) => a + b, 0), z: s.z }; };
    const flat = go({}), hill = go({ grade: 0.1 }), crest = go({ kv: -0.004 });
    out.road = { hill: (flat.v - hill.v) / 0.0981 * (1 + 4 * car.Iw / (car.r * car.r * car.m)) /* the wheels turn too */, z: hill.z, crest: (flat.Fz - crest.Fz) / (car.m * crest.v * crest.v * 0.004) }; }
  for (const f of [stepCar, driveTyre, driveEngine, driveLerp, driveState]) out.src[f.name] = f.toString();
  return out;
});
await browser.close();

console.log('car                        0-100 step / solver    100-0             skidpad');
for (const c of R.cars) {
  const e = 100 * (c.t100 / c.solver - 1), b = c.decel / (c.mu * c.muX), k = c.skid / c.mu;
  console.log(`${c.name.slice(0, 26).padEnd(26)} ${c.t100.toFixed(2)} / ${c.solver.toFixed(2)} (${e >= 0 ? '+' : ''}${e.toFixed(0)}%)   ${c.stop.toFixed(1)} m ${c.decel.toFixed(2)} g (${b.toFixed(2)} of grip)   ${c.skid.toFixed(2)} g (${k.toFixed(2)} of grip)`);
  if (Math.abs(e) > 20) fails.push(`${c.name}: 0-100 ${c.t100.toFixed(2)} s against the solver's ${c.solver.toFixed(2)} (${e.toFixed(0)}%)`);
  if (b < 0.85 || b > 1.25) fails.push(`${c.name}: stops at ${b.toFixed(2)} of its braking grip`);
  if (k < 0.80 || k > 1.02) fails.push(`${c.name}: skidpad at ${k.toFixed(2)} of its lateral grip`);
}
console.log(`lift-off: path curvature x R ${R.lift.before.toFixed(3)} -> ${R.lift.after.toFixed(3)}`);
if (!(R.lift.after > R.lift.before * 1.02)) fails.push('lifting mid-corner did not tighten the line');
console.log(`power, rear drive: slip angle of the car ${R.rwd.beta.toFixed(0)} deg, rear tyres ${R.rwd.aR.toFixed(0)} deg, front ${R.rwd.aF.toFixed(0)} deg`);
console.log(`power, front drive: runs out to ${R.fwd.r.toFixed(1)} m from a 30 m circle, front tyres ${R.fwd.aF.toFixed(0)} deg, rear ${R.fwd.aR.toFixed(0)} deg`);
if (!(R.rwd.aR > R.rwd.aF && R.rwd.beta > 12)) fails.push('full power did not swing the rear-driver\'s tail out');
if (!(R.fwd.aF > R.fwd.aR && R.fwd.r > 31)) fails.push('full power did not push the front-driver wide');
console.log(`no ABS: ${R.noAbs.d.toFixed(1)} m, wheels ${R.noAbs.lock ? 'locked' : 'turning'}; ABS ${R.abs.d.toFixed(1)} m, wheels ${R.abs.lock ? 'locked' : 'turning'}`);
if (!R.noAbs.lock || R.abs.lock) fails.push('ABS: the wheels lock with it, or do not lock without it');
if (!(R.noAbs.d > R.abs.d)) fails.push('the stop without ABS is not longer');
console.log(`cornering stiffness per load at 2/3 and 4/3 of nominal: ${R.ccLoad.map(x => x.toFixed(2)).join(', ')} (measured race tyre 1.09, 0.80)`);
if (Math.abs(R.ccLoad[0] - 1.09) > 0.06 || Math.abs(R.ccLoad[1] - 0.80) > 0.07) fails.push('the cornering stiffness does not fall with load as measured');
console.log(`road: a 10% climb takes ${R.road.hill.toFixed(3)} of g sin off a coasting car, climbing ${R.road.z.toFixed(3)} m in 0.1 s at 30 m/s; a crest takes ${R.road.crest.toFixed(3)} of m v² kv off the tyres`);
if (Math.abs(R.road.hill - 1) > 0.02 || Math.abs(R.road.crest - 1) > 0.01 || Math.abs(R.road.z - 0.3) > 0.01) fails.push('the road\'s height does not act on the car as it should');
if (!R.same) fails.push('a car through JSON does not drive to the same place');
if (!R.fields) fails.push('driveCar() holds something that is not plain data');
for (const [n, src] of Object.entries(R.src)) {
  const bad = src.match(/\b(document|window|canvas|vehicle|engine|state|powertrain|tr)\s*[.(\[]/);
  if (bad) fails.push(`${n} reaches outside its arguments: ${bad[0]}`);
}
console.log(`20 s of driving stepped in ${R.ms.toFixed(0)} ms`);
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
