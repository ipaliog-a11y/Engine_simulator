// The electric car in a race (build 181, step 2.4 of plans/hybrid-electric/).
//
// WHY THIS EXISTS. An electric car now races on its pack's energy, against engines in the same field (decision 8), with
// no charging in the pit lane. What must hold:
//   · the model: the pack's usable energy in the tank's place, a mass that does not change as it is spent, and a pace
//     grid over battery power: less power, a slower lap and less energy a lap; at full power the race's qualifying lap
//     is the TRACK tab's lap and its energy the TRACK tab's, plus the cells' own losses (I²R, ~12% flat out);
//   · a short race is run flat out and finished with energy to spare, without a stop;
//   · a race the full-power energy will not last (the pack's heat set aside): flat out the car runs out; the energy
//     manager runs less power, finishes, spends nearly all of the pack doing it, and is slower for it than a car whose
//     pack would have lasted;
//   · a race no power on the grid will last: the car retires, OUT OF CHARGE, with the pack empty;
//   · heat: over a long race the pack climbs to the battery management's range and is held there, below its 60 C
//     cut-off, and the laps slow as it cuts the power;
//   · the RACE tab and the race report show kWh for the electric car and litres for the engine beside it.
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
  const evBuild = kWh => { set('edType', 'electric'); set('evKWh', kWh); syncDesignEnable(); buildEngine(); return { name: 'EV ' + kWh, build: serializeBuild('EV ' + kWh, '') }; };
  // 1. the model, against the TRACK tab's lap
  const ev = evBuild(75), L = simulateLap('tech'), mass = vehicle.mass, kWh = engine.pack.kWh;
  const M = raceCarModel(ev, 'tech'), top = (M.grips.length - 1) * RACE_FUEL.length;
  o.model = { unit: M.unit, usable: M.tankKg, kWh, rho: M.fuelRho, mass: M.mass, carMass: mass, qual: M.qual, lap: L.lap,
    track: L.ev.driveKWh - L.ev.regenKWh, epl: M.ev.epl, laps: [0, 1, 2].map(b => M.prof[top + b].lap) };
  M.massNow = 0; racePractice(M, { air: 22 }, 1, 'normal', 0); o.model.massNow = M.massNow;
  // 2. a short race, against an engine
  set('edType', 'petrol4'); syncDesignEnable(); buildEngine();
  const ice = { name: 'ICE', build: serializeBuild('ICE', '') };
  const Ms = [M, raceCarModel(ice, 'tech')];
  const R5 = raceInit(Ms, { track: 'tech', laps: 5, seed: 3, strategy: 'auto', air: 22, weather: 'dry' }); raceRun(R5);
  const c5 = R5.cars.find(c => c.M.ev), res5 = raceResults(R5);
  o.short = { ff: c5.plan.evFF, stops: c5.stopsDone, res: res5.map(x => ({ name: x.name, state: x.state, used: x.fuelL, unit: x.unit || 'L', pack: x.packMax })),
    pits: R5.events.filter(e => e.type === 'pit' && e.car === c5.id).length, iceModel: 'ev' in Ms[1] || 'unit' in Ms[1] };
  // the RACE tab and the race report on that race
  raceUI.run = R5; raceUI.phase = 'live'; raceUI.t = R5.t; setTab('race'); renderRacePanel(true);
  o.short.tele = document.getElementById('raceTele').textContent; o.short.result = document.getElementById('raceResults').textContent;
  let rep = ''; try { raceReportCanvas(R5, 1); } catch (err) { rep = err.message; } o.short.report = rep;
  raceUI.run = null; raceUI.phase = 'setup';
  // 3. energy-limited: a smaller pack, a race between what full power and the lowest power need. A road car's pack on a
  // circuit runs into its temperature before its energy (5. below), and then the battery management, not the manager,
  // decides what it spends; so here the pack's heat is set aside (its heat capacity × 100, on a copy of the model) and
  // the race is the energy's alone.
  const ev40 = evBuild(40), M40 = raceCarModel(ev40, 'tech');
  const cool = Mx => Object.assign({}, Mx, { ev: Object.assign({}, Mx.ev, { pack: Object.assign({}, Mx.ev.pack, { mass: Mx.ev.pack.mass * 100 }) }) });
  const N = Math.floor(M40.tankKg * 0.97 / ((M40.ev.epl[1] + M40.ev.epl[2]) / 2));   // about half power
  const run = (Mx, laps) => { const R = raceInit([Mx], { track: 'tech', laps, seed: 5, strategy: 'auto', air: 22, weather: 'dry' }); raceRun(R); return R; };
  const Rm = run(cool(M40), N), cm = Rm.cars[0], rm = raceResults(Rm)[0];
  o.managed = { N, usable: M40.tankKg, epl: M40.ev.epl, ff: cm.plan.evFF, state: rm.state, used: rm.fuelL, time: rm.time, stops: cm.stopsDone,
    packMax: rm.packMax, k: cm.evK };
  // the same distance with energy to spare (the 75 kWh car, no manager needed)
  const Rf = run(cool(M), N); o.managed.free = { time: raceResults(Rf)[0].time, ff: Rf.cars[0].plan.evFF };
  // and the 40 kWh car with no manager: flat out from the start
  const realPlan = window.evRacePlanFF;
  window.evRacePlanFF = (Mx, laps, mode, E, k) => Object.assign(realPlan(Mx, laps, mode, E, k), { ff: 0 });
  const Rn = run(cool(M40), N), rn = raceResults(Rn)[0];
  window.evRacePlanFF = realPlan;
  o.managed.none = { state: rn.state, why: rn.why, laps: rn.laps };
  // 4. too long for any power on the grid
  const Nx = Math.ceil(M40.tankKg / M40.ev.epl[2]) + 2;
  const Rx = run(M40, Nx), cx = Rx.cars[0], rx = raceResults(Rx)[0];
  o.dead = { N: Nx, state: rx.state, why: rx.why, laps: rx.laps, left: cx.fuelKg, stops: cx.stopsDone };
  // 5. heat: a long race with energy to spare
  const Rh = run(M, 30), ch = Rh.cars[0], rh = raceResults(Rh)[0];
  o.heat = { state: rh.state, pack: rh.packMax, used: rh.fuelL, usable: M.tankKg, early: ch.laps[2].t, late: ch.laps[27].t,
    packAt: ch.laps.map(l => l.pack) };
  set('edType', 'petrol4'); syncDesignEnable(); buildEngine();
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

const Mo = r.model;
console.log(`== model: ${f(Mo.usable)} of ${Mo.kWh} kWh usable (${Mo.unit}), ${f(Mo.mass, 0)} kg whatever is left (practice ${f(Mo.massNow, 0)} kg); ` +
  `power 100/65/30%: laps ${Mo.laps.map(x => f(x, 2)).join(' / ')} s, ${Mo.epl.map(x => f(x, 2)).join(' / ')} kWh a lap ==`);
console.log(`== qualifying ${f(Mo.qual, 2)} s against the TRACK tab's ${f(Mo.lap, 2)} s; ${f(Mo.epl[0], 2)} kWh a lap against the TRACK tab's ${f(Mo.track, 2)} kWh at the motor ==`);
if (Mo.unit !== 'kWh' || Mo.rho !== 1) fails.push('an electric car\'s store is not counted in kWh');
if (Math.abs(Mo.usable / Mo.kWh - 0.9) > 1e-9) fails.push(`${f(Mo.usable)} kWh usable of ${Mo.kWh}: not the 95% to 5% window`);
if (Math.abs(Mo.mass - Mo.carMass) > 1e-9 || Math.abs(Mo.massNow - Mo.mass) > 1e-9) fails.push('the electric car\'s mass changes with its energy');
if (!(Mo.laps[0] < Mo.laps[1] && Mo.laps[1] < Mo.laps[2])) fails.push('less power is not a slower lap');
if (!(Mo.epl[0] > Mo.epl[1] && Mo.epl[1] > Mo.epl[2])) fails.push('less power does not spend less energy a lap');
if (Math.abs(Mo.qual - Mo.lap) > 0.05) fails.push('the race\'s full-power lap is not the TRACK tab\'s');
if (!(Mo.epl[0] > Mo.track && Mo.epl[0] < Mo.track * 1.2)) fails.push('a lap\'s energy is not the drive\'s plus the cells\' losses');

const S = r.short;
console.log(`== 5 laps: ${S.res.map(x => `${x.name} ${x.state} ${f(x.used, 2)} ${x.unit}`).join(', ')}; the EV at power ${f(100 - S.ff * 70, 0)}% with ${S.stops} stops, pack ${f(S.res.find(x => x.unit === 'kWh').pack)} C ==`);
if (S.ff !== 0) fails.push('a short race is not run at full power');
if (S.stops !== 0 || S.pits !== 0) fails.push('the electric car stopped in a short race');
if (!S.res.every(x => x.state === 'fin')) fails.push('a car did not finish the short race');
if (S.iceModel) fails.push('an engine\'s race model carries electric fields');
if (!/kWh/.test(S.tele) || !/BATTERY/.test(S.tele) || !/ENERGY/.test(S.tele)) fails.push('the RACE tab does not show the electric car\'s energy and pack');
if (!/kWh/.test(S.result) || !/\d L/.test(S.result)) fails.push('the result does not give kWh for the EV and litres for the engine');
if (S.report) fails.push('the race report failed: ' + S.report);

const Mg = r.managed;
console.log(`== ${Mg.N} laps on ${f(Mg.usable)} kWh (full power would need ${f(Mg.N * Mg.epl[0])}): power ${f(100 - Mg.ff * 70, 0)}%, ${Mg.state}, ` +
  `${f(Mg.used)} kWh spent (learned ×${f(Mg.k, 3)}), ${f(Mg.time)} s against ${f(Mg.free.time)} s with energy to spare; flat out instead: ${Mg.none.state} ${Mg.none.why} after ${Mg.none.laps} laps ==`);
if (!(Mg.ff > 0 && Mg.ff < 1)) fails.push('the energy manager did not pick a power between the caps');
if (Mg.state !== 'fin') fails.push('the managed car did not finish');
if (!(Mg.used > 0.95 * Mg.usable && Mg.used <= Mg.usable + 1e-6)) fails.push(`the managed car spent ${f(Mg.used)} of ${f(Mg.usable)} kWh`);
if (!(Mg.none.state === 'dnf' && Mg.none.why === 'OUT OF CHARGE')) fails.push('without the manager the same race was finished: it was not a race that needed managing');
if (!(Mg.time > Mg.free.time + 2 && Mg.free.ff === 0)) fails.push('managing the energy did not cost time');
if (Mg.stops) fails.push('the managed car stopped');

const Dd = r.dead;
console.log(`== ${Dd.N} laps (more than the lowest power can last): ${Dd.state} (${Dd.why}) after ${Dd.laps} laps, ${f(Dd.left, 3)} kWh left ==`);
if (Dd.state !== 'dnf' || Dd.why !== 'OUT OF CHARGE' || Dd.left > 1e-6 || Dd.stops) fails.push('a car whose pack cannot last is not out of charge');

const H = r.heat;
console.log(`== 30 laps: ${H.state}, pack peak ${f(H.pack)} C (lap 10 ${f(H.packAt[9])}, lap 20 ${f(H.packAt[19])}), lap 3 ${f(H.early, 2)} s -> lap 28 ${f(H.late, 2)} s, ` +
  `${f(H.used)} of ${f(H.usable)} kWh ==`);
if (H.state !== 'fin') fails.push('the long race was not finished');
if (!(H.pack > 50 && H.pack < 60)) fails.push(`the pack peaked at ${f(H.pack)} C, not held in the battery management's range`);
if (!(H.late > H.early + 2)) fails.push('a hot pack does not slow the laps');
if (!(H.used < H.usable * 0.95)) fails.push('a heat-limited car used its whole pack');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the electric car races on its energy, manages it to the flag, runs out when it cannot, and pays for its heat.');
process.exit(fails.length || errors.length ? 1 : 0);
