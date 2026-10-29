// The three Teslas (build 183, step 2.5b of plans/hybrid-electric/; decision 10).
//
// WHY THIS EXISTS. Electric cars are checked against real ones the way the combustion cars are (tests/test41.mjs): what
// is published about the hardware is matched (mass, drag, area, tyres, the reductions from the owner's manuals, the pack,
// each motor's torque or power), and the 0-100 and the top speed are derived and compared. What must hold:
//   · the front induction unit of the Model 3 and Model Y: 219 Nm, and 137 kW at 6380 rpm, on 320 V;
//   · each drive's peak against the published power (the Model Y's combined 378 kW, the Plaid's 760 kW);
//   · the 0-100: the Model 3 RWD against Tesla's 6.1 s. The Model Y Long Range's stock 5.0 s is a software limit on
//     launch torque (the Acceleration Boost unlocks the same hardware to 0-60 mph in 4.3 s, from 4.8): the model has
//     the hardware's torque, so its 0-60 less the one-foot rollout is held to the unlocked 4.3 s. The Plaid: Tesla's
//     2.1 s takes the rollout off; independent runs without it measured 2.52 s (DragTimes' best was 2.11 with) and
//     2.56 s (AutoTopNL); both are checked;
//   · the top speed: all three are governed at the published figure, and each must be able to reach it;
//   · more than one motor: a front motor makes the car all-wheel drive (and taking it off gives the drive back); at a
//     cruise the controller leaves the induction front motor unpowered, flat out both drive;
//   · the RACE and VEHICLE pickers offer the electric cars beside the combustion ones, which are untouched.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = { cars: [] };
  for (const p of EV_VEHICLE_PRESETS) {
    loadVehiclePreset(p);
    o.cars.push({ name: p.name, real: p.real, kW: engine.score.peakKW, tq: engine.score.peakTQ, drive: vehicle.drive, fd: vehicle.finalDrive,
      motors: engine.motor.parts ? engine.motor.count : 1, t100: perf.t100, roll: perf.rollout, t60: perf.t60, top: perf.topSpeed, free: perf.freeSpeed,
      governed: perf.governed, mass: vehicle.mass });
    if (/Model Y/.test(p.name)) {
      // the front unit at 320 V
      const f = engine.motor.parts[1].m;
      o.front = { im: f.im, tq: motorMaxTorque(f, 100, 320, 60), kW: motorMaxTorque(f, 6380, 320, 60) * 6380 * Math.PI / 30 / 1000 };
      // the split: a cruise and flat out
      const m = engine.motor, V = motorRatedV(engine), t = { w: 90, c: 80, r: 90 }, rear = m.parts[0].m;
      const cruise = motorLosses(m, 40, 7000, V, t), rearOnly = motorLosses(rear, 40, 7000, V, t), frontIdle = motorLosses(f, 0, 7000, V, t);
      o.split = { cruise: cruise.total, rearOnly: rearOnly.total, frontIdle: frontIdle.total, frontIron: frontIdle.fe,
        full: motorMaxTorque(m, 3000, V, 60), rearFull: motorMaxTorque(rear, 3000, V, 60), frontFull: motorMaxTorque(f, 3000, V, 60) };
    }
  }
  // the front motor's drive lock: off the Model Y's front motor, the drivetrain comes back to the driver
  const set = (id, v) => { document.getElementById(id).value = v; };
  loadVehiclePreset(EV_VEHICLE_PRESETS[0]);
  set('evFront', 'im'); syncDesignEnable(); buildEngine();
  o.lock = { on: vehicle.drive, disabled: document.getElementById('vhDrive').disabled };
  set('evFront', 'none'); syncDesignEnable(); buildEngine();
  o.lock.off = vehicle.drive; o.lock.freed = !document.getElementById('vhDrive').disabled;
  // the pickers and the race
  const opts = id => [...document.querySelectorAll('#' + id + ' option')].map(x => x.textContent);
  set('vhFamily', 'Electric'); document.getElementById('vhFamily').dispatchEvent(new Event('change'));
  o.pick = { cars: opts('vhPreset').filter(x => /Tesla/.test(x)).length, families: opts('vhFamily'), combustion: VEHICLE_PRESETS.length,
    factory: FACTORY_CARS.length, others: FACTORY_CARS.length - VEHICLE_PRESETS.length - EV_VEHICLE_PRESETS.length, anyEvInCombustion: VEHICLE_PRESETS.some(p => /Tesla/.test(p.name)) || PRESETS.some(p => p.engine.type === 'electric') };
  const sel = document.getElementById('vhPreset'), plaid = [...sel.options].find(x => /Plaid/.test(x.textContent));
  sel.value = plaid.value; sel.dispatchEvent(new Event('change'));
  o.pick.loaded = { kW: engine.score.peakKW, name: (loaded.car || {}).name || '' };
  raceFillAdd();
  const ro = [...document.querySelectorAll('#raceAddSel option')].find(x => /Model 3/.test(x.textContent));
  const ent = raceEntrantFrom(ro.value);
  o.race = raceCarModel(ent, 'tech').unit;
  set('edType', 'petrol4'); syncDesignEnable(); buildEngine();
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

console.log(`== front induction unit at 320 V: ${f(r.front.tq, 0)} Nm (219), ${f(r.front.kW)} kW at 6380 rpm (137) ==`);
if (!r.front.im) fails.push('the Model Y\'s front motor is not an induction motor');
if (Math.abs(pct(r.front.tq, 219)) > 3) fails.push(`the front unit gives ${f(r.front.tq, 0)} Nm, not 219`);
if (Math.abs(pct(r.front.kW, 137)) > 5) fails.push(`the front unit gives ${f(r.front.kW)} kW at 6380 rpm, not 137`);

const C = Object.fromEntries(r.cars.map(c => [/Model 3/.test(c.name) ? 'm3' : /Model Y/.test(c.name) ? 'my' : 'ms', c]));
const pub = { m3: 208, my: 378, ms: 760 };
for (const [k, c] of Object.entries(C)) {
  console.log(`== ${c.name}: ${c.motors} motor(s), ${c.kW} kW (published ${pub[k]}), ${c.tq} Nm, ${c.drive}, ${f(c.fd, 2)}:1, ${f(c.mass, 0)} kg; ` +
    `0-100 ${f(c.t100, 2)} s (${f(c.t100 - c.roll, 2)} less the rollout), 0-60 mph less the rollout ${f(c.t60 - c.roll, 2)} s; ` +
    `top ${f(c.top, 0)} km/h${c.governed ? ' (governed)' : ''} against ${c.real.top}, free ${f(c.free, 0)} ==`);
  if (Math.abs(pct(c.kW, pub[k])) > 10) fails.push(`${c.name}: ${c.kW} kW against the published ${pub[k]}`);
  if (Math.abs(c.top - c.real.top) > 2 || c.free < c.real.top) fails.push(`${c.name}: cannot reach its published ${c.real.top} km/h`);
}
if (C.m3.drive !== 'rwd' || C.my.drive !== 'awd' || C.ms.drive !== 'awd' || C.ms.motors !== 3 || C.my.motors !== 2) fails.push('the motors and drivetrains are not the cars\'');
const e3 = pct(C.m3.t100, 6.1), eY = pct(C.my.t60 - C.my.roll, 4.3), eS = pct(C.ms.t100 - C.ms.roll, 2.1), eS0 = pct(C.ms.t100, 2.54);
console.log(`== 0-100: Model 3 RWD ${f(e3)}% off 6.1 s; Model Y LR 0-60 ${f(eY)}% off the unlocked 4.3 s (the stock 4.8 s is a software limit: ` +
  `${f(pct(C.my.t60 - C.my.roll, 4.8))}%); Plaid ${f(eS)}% off Tesla's 2.1 s with the rollout taken off, ${f(eS0)}% off the 2.52-2.56 s measured without ==`);
if (Math.abs(e3) > 8) fails.push(`Model 3 RWD 0-100 ${f(e3)}% off`);
if (Math.abs(eY) > 10) fails.push(`Model Y Long Range 0-60 ${f(eY)}% off the unlocked hardware`);
if (Math.abs(eS) > 12) fails.push(`Model S Plaid 0-100 ${f(eS)}% off Tesla's figure`);
if (Math.abs(eS0) > 8) fails.push(`Model S Plaid 0-100 ${f(eS0)}% off the measured runs`);

const Sp = r.split;
console.log(`== Model Y split: a 40 Nm cruise at 7000 rpm loses ${f(Sp.cruise, 0)} W, the rear alone ${f(Sp.rearOnly, 0)} W, the idle front ${f(Sp.frontIdle, 0)} W ` +
  `(iron ${f(Sp.frontIron, 0)}); flat out at 3000 rpm ${f(Sp.full, 0)} Nm = ${f(Sp.rearFull, 0)} + ${f(Sp.frontFull, 0)} ==`);
if (!(Sp.frontIron === 0 && Math.abs(Sp.cruise - Sp.rearOnly - Sp.frontIdle) < 1)) fails.push('at a cruise the induction front motor is not left unpowered');
if (Math.abs(Sp.full - Sp.rearFull - Sp.frontFull) > 1e-6) fails.push('flat out the two motors\' torques do not add');
console.log(`== front motor fitted: ${r.lock.on}${r.lock.disabled ? ' (locked)' : ''}; taken off: ${r.lock.off}${r.lock.freed ? ' (free)' : ''} ==`);
if (r.lock.on !== 'awd' || !r.lock.disabled || r.lock.off !== 'rwd' || !r.lock.freed) fails.push('a front motor does not make the car AWD, or taking it off does not give the drive back');

const P = r.pick;
console.log(`== pickers: families ${P.families.join(', ')}; ${P.cars} Teslas; ${P.combustion} combustion cars of ${P.factory}; Plaid loaded ${P.loaded.kW} kW; a Tesla races in ${r.race} ==`);
if (P.cars !== 3 || !P.families.includes('Electric') || P.factory !== P.combustion + 3 + P.others || P.anyEvInCombustion) fails.push('the electric cars are not offered beside the combustion ones');
if (!(P.loaded.kW > 700)) fails.push('picking the Plaid did not load it');
if (r.race !== 'kWh') fails.push('a factory Tesla does not race');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the three Teslas, matched on their hardware, reach their published 0-100s and top speeds.');
process.exit(fails.length || errors.length ? 1 : 0);
