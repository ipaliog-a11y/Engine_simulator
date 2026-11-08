// The chassis numbers as a part (build 250).
//
// WHY THIS EXISTS. A car's wheelbase, tracks, CG height and weight split were always the factory's: a real car's
// published ones, else its class's. The VEHICLE tab's CHASSIS NUMBERS card now sets them by hand, and adds ballast at
// its own place. What must hold:
//   · the factory's numbers written down as DESIGNED are the same car, exactly (the lap and the 0-100), on a real
//     front-drive car, a real rear-drive car and an archetype; FACTORY moved nothing (the fingerprint is identical);
//   · the physics: a lower CG rolls less and laps faster; a wider rear track rolls less and, on the same springs, takes
//     more of the roll (its stiffness grows as the track squared);
//     ballast is mass on the scales, and moves the split and the CG by its mass against the car's;
//   · a designed chassis or ballast is not the factory fit, a refit puts the factory's back, and both travel with a build.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {}, g = id => document.getElementById(id);
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
  const set = (kv) => { for (const k in kv) g(k).value = kv[k]; buildVehicle(); };
  const lap = () => simulateLap('mixed').lap;
  // 1. the factory's numbers, as DESIGNED
  o.fac = [];
  for (const car of ['Golf GTI (Mk7', 'BMW M3 (E46', null]) {
    if (car) load(car); else { g('vhChassis').value = 'coupe'; g('vhChassis').dispatchEvent(new Event('input')); }
    const F = vehicle.dimsFactory, a = { lap: lap(), t100: perf.t100, lltd: vehicle.lltdF, form: g('vhWb').value };
    set({ vhDims: 'design', vhFwt: F.fWtCar * 100 });
    o.fac.push({ car: vehicle.chLabel, a, b: { lap: lap(), t100: perf.t100, lltd: vehicle.lltdF }, dims: JSON.stringify(vehicle.dims),
      wb: vehicle.wb === F.wb && vehicle.trackF === F.trackF && vehicle.trackR === F.trackR && vehicle.cg === F.cg });
  }
  // 2. the physics, on the M3
  load('BMW M3 (E46');
  const F = vehicle.dimsFactory, m0 = vehicle.mass, f0 = vehicle.fWt, c0 = vehicle.cg;
  o.cg = [0.36, 0.48, 0.60].map(h => { set({ vhDims: 'design', vhCg: h }); return { roll: vehicle.rollGrad, lap: lap() }; });
  set({ vhDims: 'factory' });
  o.trk = [F.trackR, F.trackR + 0.15].map(t => { set({ vhDims: 'design', vhTrackR: t }); return { lltd: vehicle.lltdF, roll: vehicle.rollGrad }; });
  set({ vhDims: 'factory' });
  set({ vhBallast: 100, vhBallastPos: 0, vhBallastH: 0.1 });
  o.ball = { dm: vehicle.mass - m0, f: vehicle.fWt, fWant: f0 * m0 / (m0 + 100), cg: vehicle.cg, cgWant: (c0 * m0 + 10) / (m0 + 100),
    fit: isFactoryFit(readVehicleFromForm()) };
  // 3. a build carries it; a refit puts the factory's back
  set({ vhDims: 'design', vhWb: 2.9, vhCg: 0.4 });
  o.fitD = isFactoryFit(readVehicleFromForm());
  const saved = serializeBuild('t', '');
  load('Golf GTI (Mk7');
  applyBuild(saved);
  o.travel = { wb: vehicle.wb, cg: vehicle.cg, m0: vehicle.mass - 100, kg: vehicle.ballastKg, sel: g('vhDims').value };
  g('btnRefit').click();
  o.refit = { sel: g('vhDims').value, kg: vehicle.ballastKg, wb: vehicle.wb === vehicle.dimsFactory.wb, fit: isFactoryFit(readVehicleFromForm()) };
  o.card = !!g('vcdCard-dims');
  return o;
});
await browser.close();

console.log('== the factory\'s chassis numbers as DESIGNED: lap / 0-100 / front share of load transfer ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(30)} ${c.a.lap.toFixed(3)} → ${c.b.lap.toFixed(3)} s  ${c.a.t100} → ${c.b.t100} s  ${c.a.lltd.toFixed(4)} → ${c.b.lltd.toFixed(4)}  ${c.dims}`);
  if (c.a.lap !== c.b.lap || c.a.t100 !== c.b.t100 || c.a.lltd !== c.b.lltd || !c.wb) fails.push(`${c.car}: the factory's numbers as DESIGNED are not the same car`);
}
console.log(`== CG 0.36/0.48/0.60 m: roll ${r.cg.map(x => x.roll.toFixed(2)).join(' / ')} deg/g, lap ${r.cg.map(x => x.lap.toFixed(2)).join(' / ')} s ==`);
if (!(r.cg[0].roll < r.cg[1].roll && r.cg[1].roll < r.cg[2].roll)) fails.push('a lower CG does not roll less');
if (!(r.cg[0].lap < r.cg[1].lap && r.cg[1].lap < r.cg[2].lap)) fails.push('a lower CG does not lap faster');
console.log(`== rear track +0.15 m: front share of the roll ${r.trk.map(x => x.lltd.toFixed(4)).join(' → ')}, roll ${r.trk.map(x => x.roll.toFixed(2)).join(' → ')} deg/g ==`);
if (!(r.trk[1].lltd < r.trk[0].lltd && r.trk[1].roll < r.trk[0].roll)) fails.push('a wider rear track does not roll less and take more of the roll');
console.log(`== 100 kg on the rear axle at 0.1 m: ${JSON.stringify(r.ball)} ==`);
if (r.ball.dm !== 100 || Math.abs(r.ball.f - r.ball.fWant) > 1e-12 || Math.abs(r.ball.cg - r.ball.cgWant) > 1e-12) fails.push('ballast is not mass at its own place');
if (r.ball.fit || r.fitD) fails.push('ballast or a designed chassis counts as the factory fit');
console.log(`== travels: ${JSON.stringify(r.travel)}; refit: ${JSON.stringify(r.refit)}; card: ${r.card} ==`);
if (r.travel.wb !== 2.9 || Math.abs(r.travel.cg - (0.4 * r.travel.m0 + 100 * 0.1) / (r.travel.m0 + 100)) > 1e-12 || r.travel.kg !== 100 || r.travel.sel !== 'design') fails.push('a saved build does not carry its chassis numbers and ballast');
if (r.refit.sel !== 'factory' || r.refit.kg !== 0 || !r.refit.wb || !r.refit.fit) fails.push('REFIT does not put the factory\'s chassis numbers back');
if (!r.card) fails.push('no CHASSIS NUMBERS card');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the chassis numbers and ballast feed the car\'s own physics, the factory\'s as DESIGNED are the same car, and a build carries them.');
process.exit(fails.length || errors.length ? 1 : 0);
