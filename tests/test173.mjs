// A hybrid in the stepped car: its motors, pack and controller, in time (build 274).
//
// WHY THIS EXISTS. Until build 274 stepCar drove a hybrid as an engine with the motor's torque added to its curve: no
// pack, no charge, no front motor, and a power-split or a series hybrid did not move at all. What must hold:
//   · every hybrid car drives: 0-100 within 20% of simulateAccel (the 918's launch is a named gap, below);
//   · the pack is the pack: flat out its charge falls, it never gives more than packMaxPower at that charge, it gives
//     more electricity than the motors' shaft work (their losses), and at the window's low the motors stop;
//   · off the pedal the motor regenerates and the charge rises; over the window's high it does not;
//   · charge-sustaining: at part pedal a low pack is charged by the engine and a high one is spent;
//   · a front axle motor drives the front wheels while the gearbox drives its own axle (the 918: the rear);
//   · a hybrid is plain data (through JSON it drives to the same place) and the controller reads only its arguments;
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
// Known gap, may only shrink. The 918 pulls away 27% slower than the solver: the stepped car's driver feeds one clutch
// by the rear tyres' slip, the solver holds all four tyres at their peak from the first metre (launch control).
const LAUNCH_KNOWN = { 'Porsche 918 Spyder (2013)': 30 };

const R = await page.evaluate(() => {
  const out = { cars: [], src: {} };
  for (const p of HYB_VEHICLE_PRESETS) {
    loadVehiclePreset(p);
    const car = JSON.parse(JSON.stringify(driveCar())), A = simulateAccel(), hy = car.hy, pack = engine.hy.pack;
    const o = { name: p.name, solver: A.t100, drive: car.drive, front: !!hy.front, over: 0, elec: 0, mech: 0, tf: 0, fxF: 0 };
    car.tc = true;
    let s = driveState(car); o.soc0 = s.soc;
    while (s.t < 40 && s.vx * 3.6 < 100) { const soc = s.soc; stepCar(car, s, { throttle: 1 }, 0.01);
      o.over = Math.max(o.over, s.Pb - packMaxPower(pack, soc)); o.tf = Math.max(o.tf, s.Tf); o.fxF = Math.max(o.fxF, s.Fx[0] + s.Fx[1]);
      if (s.Tm > 0 && !hy.front) { o.elec += s.Pb * 0.01; o.mech += s.Tm * s.rpm * Math.PI / 30 * 0.01; } }
    o.t100 = s.t; o.soc100 = s.soc;
    // off the pedal from 100 km/h: regeneration; then the same with the pack over its high
    let e = s.soc; for (let i = 0; i < 200; i++) stepCar(car, s, { throttle: 0 }, 0.01); o.lift = s.soc - e; o.liftTm = s.Tm;
    const t = JSON.parse(JSON.stringify(s)); t.soc = hy.socHi + 0.01; stepCar(car, t, { throttle: 0 }, 0.01); o.fullTm = t.Tm;
    // part pedal for 30 s with the pack 15% under its target, and 15% over it
    for (const d of [-0.15, 0.15]) { const q = JSON.parse(JSON.stringify(s)); q.soc = e = Math.max(hy.socLo + 0.01, hy.socT + d);
      for (let i = 0; i < 3000; i++) stepCar(car, q, { throttle: 0.3 }, 0.01); o[d < 0 ? 'low' : 'high'] = q.soc - e; }
    // flat out with the pack at its low: nothing from the motors
    s.soc = hy.socLo - 0.01; for (let i = 0; i < 100; i++) stepCar(car, s, { throttle: 1 }, 0.01); o.emptyTm = s.Tm; o.emptyTf = s.Tf;
    // the same car, not through JSON, to the same place
    const c2 = driveCar(); c2.tc = true; const s2 = driveState(c2); while (s2.t < 40 && s2.vx * 3.6 < 100) stepCar(c2, s2, { throttle: 1 }, 0.01);
    o.same = s2.t === o.t100 && s2.soc === o.soc100;
    out.cars.push(o);
  }
  loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.startsWith('Mazda MX-5'))); out.plain = !('hy' in driveCar());
  for (const f of [driveHybrid, driveLoss]) out.src[f.name] = f.toString();
  return out;
});
await browser.close();

console.log('car                          0-100 step / solver   charge      lift      low / high pack at part pedal');
for (const c of R.cars) {
  const e = 100 * (c.t100 / c.solver - 1), cap = LAUNCH_KNOWN[c.name] || 20, pc = x => (100 * x >= 0 ? '+' : '') + (100 * x).toFixed(2) + '%';
  console.log(`${c.name.slice(0, 28).padEnd(28)} ${c.t100.toFixed(2)} / ${c.solver.toFixed(2)} (${e >= 0 ? '+' : ''}${e.toFixed(0)}%)   ${(100 * c.soc0).toFixed(0)} -> ${(100 * c.soc100).toFixed(1)}%  ${pc(c.lift)}   ${pc(c.low)} / ${pc(c.high)}`);
  if (Math.abs(e) > cap) fails.push(`${c.name}: 0-100 ${c.t100.toFixed(2)} s against the solver's ${c.solver.toFixed(2)} (${e.toFixed(0)}%)`);
  if (!(c.soc100 < c.soc0)) fails.push(`${c.name}: flat out, the pack's charge did not fall`);
  if (c.over > 1) fails.push(`${c.name}: the pack gave ${c.over.toFixed(0)} W more than packMaxPower allows`);
  if (!c.front && !(c.elec > c.mech && c.elec < 1.5 * c.mech)) fails.push(`${c.name}: the pack gave ${(c.elec / 1000).toFixed(1)} kJ for ${(c.mech / 1000).toFixed(1)} kJ at the motor's shaft`);
  if (!(c.lift > 0 && c.liftTm < 0)) fails.push(`${c.name}: off the pedal the motor did not regenerate`);
  if (c.fullTm !== 0) fails.push(`${c.name}: a pack over its high was still charged`);
  if (!(c.low > 0)) fails.push(`${c.name}: at part pedal a low pack was not charged`);
  if (!(c.high < 0)) fails.push(`${c.name}: at part pedal a high pack was not spent`);
  if (c.emptyTm > 0 || c.emptyTf > 0) fails.push(`${c.name}: the motors still help with the pack at its low`);
  if (c.front && !(c.tf > 0 && c.fxF > 0 && c.drive === 'rwd')) fails.push(`${c.name}: the front motor does not drive the front wheels beside a rear-driving gearbox`);
  if (!c.front && c.tf !== 0) fails.push(`${c.name}: a front motor's torque without a front motor`);
  if (!c.same) fails.push(`${c.name}: through JSON it does not drive to the same place`);
}
if (!R.cars.some(c => c.front)) fails.push('no car with a front axle motor was driven');
if (!R.plain) fails.push('a car that is not a hybrid carries a hybrid');
for (const [n, src] of Object.entries(R.src)) {
  const bad = src.match(/\b(document|window|canvas|vehicle|engine|state|powertrain|tr)\s*[.(\[]/);
  if (bad) fails.push(`${n} reaches outside its arguments: ${bad[0]}`);
}
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
