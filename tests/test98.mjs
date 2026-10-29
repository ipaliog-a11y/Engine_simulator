// The electric car on the road (build 180, step 2.3 of plans/hybrid-electric/).
//
// WHY THIS EXISTS. An electric drive now runs the 0-100, the top speed and the lap through the same solvers as an engine,
// with what an electric car does differently: one reduction, regeneration, and its heat over a lap. What must hold:
//   · the driveline: one ratio, a reduction-and-differential efficiency, no gearbox to choose; the reduction is matched
//     so the motor's top speed meets the drag-limited speed, GEARING shortens it (quicker to 100, lower top speed) and
//     a hand-set one is kept;
//   · the 0-100: no shift and no launch rpm; no quicker than the tyres or the torque allow, and not wildly slower; the
//     top speed is the lower of drag's and the motor's top speed through the reduction;
//   · regeneration: the lap takes energy back, the rotors run cooler than with it switched off, and the lap is no slower;
//   · heat: on a short lap nothing is cut; round the Nordschleife the pack's battery management holds it near its limit
//     and cuts the drive, the lap is slower than with the heat ignored, an air-cooled motor is cut far more, and oil
//     spray keeps the winding cooler than a water jacket;
//   · the VEHICLE and TRACK tabs show it: the reduction instead of the ratios, the motor, pack and energy cells.
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
  const o = {}, set = (id, v) => { document.getElementById(id).value = v; };
  set('edType', 'electric'); syncDesignEnable(); buildEngine();
  // 1. the driveline
  const v = vehicle, s = engine.score;
  o.drive = { ratios: v.ratios.slice(), eff: v.driveEff, label: v.gbLabel, fd: v.finalDrive, matched: v.reductionMatched, ev: v.ev,
    mass: v.mass, motorPack: powertrain().mass(), gearboxHidden: getComputedStyle(document.getElementById('vhGearbox').closest('.field')).display === 'none',
    lbl: document.getElementById('lblGearing').textContent, summary: /Reduction/.test(document.getElementById('vehicleSummary').innerHTML),
    vTopMotor: engine.redline * 2 * Math.PI * v.rTire / 60 / v.finalDrive * 3.6 };
  const a0 = perf;
  o.accel = { t100: a0.t100, top: a0.topSpeed, shifts: a0.shifts.length, launch: a0.launchRpm, free: a0.freeSpeed };
  // the bound: the tyres' grip at the static driven load, and the torque through the reduction, whichever is lower
  const r0 = v.rTire, Fmax = s.peakTQ * v.finalDrive * v.driveEff / r0, Ftyre = tyreMuX(v.mass * G * (1 - v.fWt) / 2) * v.mass * G * (1 - v.fWt) * 1.15;
  o.accel.bound = (100 / 3.6) / (Math.min(Fmax, Ftyre) / v.mass);
  // GEARING: shorter
  set('vhGearing', 20); buildVehicle();
  o.short = { fd: vehicle.finalDrive, t100: perf.t100, top: perf.topSpeed };
  set('vhGearing', 52); vehFinalDriveSet = 9.04; buildVehicle();
  o.hand = { fd: vehicle.finalDrive }; vehFinalDriveSet = 0; buildVehicle();
  // 2. regeneration on the technical circuit
  const L = simulateLap('tech');
  const orig = ELECTRIC.overrunTable; ELECTRIC.overrunTable = rl => evRegenTable(engine, rl).map(() => 0);
  const L0 = simulateLap('tech'); ELECTRIC.overrunTable = orig;
  o.regen = { lap: L.lap, lap0: L0.lap, tF: Math.max(...L.replay.tF), tF0: Math.max(...L0.replay.tF), kWh: L.ev.regenKWh, kWh0: L0.ev.regenKWh,
    drive: L.ev.driveKWh, derated: L.ev.derated };
  // 3. heat round the Nordschleife
  const nord = c => { set('evCooling', c); buildEngine(); const N = simulateLap('nord'); return { lap: N.lap, ev: N.ev }; };
  o.nord = { jacket: nord('jacket') };
  const realHeat = window.evLapHeat;
  window.evLapHeat = (e, prof) => { const x = realHeat(e, prof); x.share = x.share.map(() => 1); return x; };
  o.nord.cold = { lap: simulateLap('nord').lap };
  window.evLapHeat = realHeat;
  o.nord.air = nord('air'); o.nord.spray = nord('spray'); set('evCooling', 'jacket'); buildEngine();
  // 4. the panels
  trackKey = 'tech'; setTab('track'); refreshLap(); renderLap();
  o.panel = [...document.querySelectorAll('#lapGrid .perf-cell .k')].map(k => k.textContent);
  setTab('vehicle');
  // back to an engine: the gearbox fields return
  set('edType', 'petrol4'); syncDesignEnable(); buildEngine();
  o.back = { gearboxShown: getComputedStyle(document.getElementById('vhGearbox').closest('.field')).display !== 'none', ev: vehicle.ev,
    ratios: vehicle.ratios.length, lbl: document.getElementById('lblGearing').textContent };
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

const D = r.drive;
console.log(`== driveline: ratios [${D.ratios}], ${f(D.eff * 100, 0)}% efficient, "${D.label}", reduction ${f(D.fd, 2)}:1 (matched ${f(D.matched, 2)}), ` +
  `${f(D.mass, 0)} kg with ${D.motorPack} kg of motor and pack; gearbox fields hidden ${D.gearboxHidden}, "${D.lbl}" ==`);
if (!(D.ratios.length === 1 && D.ratios[0] === 1 && D.ev)) fails.push('an electric car does not run on one ratio');
if (!(D.eff > 0.94 && D.eff < 0.99)) fails.push(`the reduction is ${f(D.eff * 100, 0)}% efficient`);
if (Math.abs(D.fd / D.matched - 1) > 0.01) fails.push('at the default GEARING the reduction is not the matched one');
if (!D.gearboxHidden || !/REDUCTION/.test(D.lbl) || !D.summary) fails.push('the VEHICLE tab still offers a gearbox for an electric car');

const A = r.accel;
console.log(`== 0-100 ${f(A.t100, 2)} s (bound ${f(A.bound, 2)} s), top ${f(A.top, 0)} km/h (motor's top speed through the reduction ${f(D.vTopMotor, 0)}), ` +
  `${A.shifts} shifts, launched at ${A.launch} rpm ==`);
if (A.shifts !== 0 || A.launch !== 0) fails.push('the electric car shifted or chose a launch speed');
if (!(A.t100 >= A.bound * 0.98 && A.t100 < A.bound * 1.6)) fails.push(`0-100 in ${f(A.t100, 2)} s against a bound of ${f(A.bound, 2)}`);
if (A.top > D.vTopMotor * 1.01) fails.push('the car runs past the motor\'s top speed');
console.log(`== GEARING 52 -> 20: reduction ${f(D.fd, 2)} -> ${f(r.short.fd, 2)}, 0-100 ${f(A.t100, 2)} -> ${f(r.short.t100, 2)} s, top ${f(A.top, 0)} -> ${f(r.short.top, 0)} km/h; hand-set 9.04 -> ${f(r.hand.fd, 2)} ==`);
if (!(r.short.fd > D.fd && r.short.t100 < A.t100 && r.short.top < A.top)) fails.push('a shorter reduction does not trade top speed for acceleration');
if (Math.abs(r.hand.fd - 9.04) > 1e-9) fails.push('a hand-set reduction is not kept');

const R = r.regen;
console.log(`== regeneration (tech): lap ${f(R.lap, 2)} s (off ${f(R.lap0, 2)}), rotors ${f(R.tF, 0)} C (off ${f(R.tF0, 0)}), takes back ${f(R.kWh, 2)} of ${f(R.drive, 2)} kWh; cut back ${f(R.derated * 100, 1)}% of the lap ==`);
if (!(R.kWh > 0.02 && R.kWh0 === 0)) fails.push('the lap does not take energy back');
if (!(R.tF < R.tF0 - 5)) fails.push('regeneration does not take heat off the rotors');
if (R.lap > R.lap0 + 1e-6) fails.push('regeneration makes the lap slower');
if (R.derated > 0.001) fails.push('a short lap cuts the drive back');

const N = r.nord;
console.log(`== Nordschleife: jacket ${f(N.jacket.lap)} s, pack peak ${f(N.jacket.ev.bMax)} C, cut back ${f(N.jacket.ev.derated * 100, 0)}% of the lap; heat ignored ${f(N.cold.lap)} s; ` +
  `air ${f(N.air.lap)} s (winding ${f(N.air.ev.wMax, 0)} C, cut ${f(N.air.ev.derated * 100, 0)}%); spray winding ${f(N.spray.ev.wMax, 0)} C against the jacket's ${f(N.jacket.ev.wMax, 0)} C ==`);
if (!(N.jacket.ev.bMax > 50 && N.jacket.ev.bMax < 58)) fails.push(`the pack peaks at ${f(N.jacket.ev.bMax)} C, not held near its 50-60 C limit`);
if (!(N.jacket.ev.derated > 0.05)) fails.push('a Nordschleife lap does not cut the drive back');
if (!(N.jacket.lap > N.cold.lap + 1)) fails.push('the heat does not cost the Nordschleife lap time');
if (!(N.air.lap > N.jacket.lap + 5 && N.air.ev.derated > N.jacket.ev.derated)) fails.push('an air-cooled motor is not cut back more than a water-jacketed one');
if (!(N.spray.ev.wMax < N.jacket.ev.wMax)) fails.push('oil spray does not keep the winding cooler than a water jacket');

console.log(`== TRACK cells: ${r.panel.join(', ')} ==`);
if (!['MOTOR', 'BATTERY', 'ENERGY'].every(k => r.panel.includes(k))) fails.push('the TRACK tab does not show the motor, pack and energy');
console.log(`== back on petrol: gearbox fields ${r.back.gearboxShown ? 'back' : 'missing'}, ${r.back.ratios} ratios, "${r.back.lbl}" ==`);
if (!r.back.gearboxShown || r.back.ev || r.back.ratios < 4 || /REDUCTION/.test(r.back.lbl)) fails.push('an engine\'s gearbox did not come back after an electric car');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the electric car drives on one reduction, takes energy back braking, and pays for its heat on a long lap.');
process.exit(fails.length || errors.length ? 1 : 0);
