// RACE (build 137): the race engine, headless. Several builds on one circuit, run to a lap count.
//
// What is pinned here is that the race layer is honest about the physics underneath it: a car alone
// on the circuit, on tyres held at their best, laps in the time the lap solver gives it; the fuel it
// burns is the power it spends times its own BSFC; tyres from cold are slower and warm toward their
// window; the same seed is the same race; a faster car gets past a slower one; a race longer than a
// tank makes a pit stop; and racing a build never changes the build the user has loaded.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const r = await page.evaluate(() => {
  const car = n => {
    const v = VEHICLE_PRESETS.find(x => x.name.includes(n)), ep = PRESETS.find(x => x.name === v.engine);
    return { name: v.name, build: { engine: Object.assign({}, ep.engine), tune: Object.assign({}, STD_TUNE), vehicle: vehicleFromPreset(v), name: v.name } };
  };
  const out = {};
  const before = JSON.stringify(serializeBuild('x', ''));
  const gt3 = car('911 GT3'), civic = car('Civic Type R'), mx5 = car('MX-5');
  const mGT3 = raceCarModel(gt3, 'tech'), mCivic = raceCarModel(civic, 'tech'), mMX5 = raceCarModel(mx5, 'tech');
  out.restored = JSON.stringify(serializeBuild('x', '')) === before;

  // 1. alone, tyres at their best, no driver error: the solver's lap
  {
    const sv = { grip: window.raceGrip, pace: RACE.pace, mis: RACE.mistake };
    window.raceGrip = () => 1; RACE.pace = 0; RACE.mistake = 0;
    const R = raceInit([mGT3], { track: 'tech', laps: 4, strategy: 'none', seed: 1 });
    raceRun(R);
    window.raceGrip = sv.grip; RACE.pace = sv.pace; RACE.mistake = sv.mis;
    const NF = RACE_FUEL.length, full = mGT3.prof[(RACE_GRIP.length - 1) * NF + 2].lap;
    out.solo = { laps: R.cars[0].laps.map(l => l.t), solver: full };
  }
  // 2. standing start: the solver's own launch lap against its flying lap
  out.launch = withBuild(gt3.build, () => {
    const T = buildTrack('tech'), line = lineFor(T, 'tech');
    return { fly: simulateLap('tech', { line }).lap, rest: simulateLap('tech', { line, fromRest: true }).lap };
  });
  // 3. fuel: the race's burn on a lap against the power x BSFC sum done here, independently
  {
    const sv = { grip: window.raceGrip, pace: RACE.pace, mis: RACE.mistake };
    window.raceGrip = () => 1; RACE.pace = 0; RACE.mistake = 0;
    const R = raceInit([mCivic], { track: 'tech', laps: 3, strategy: 'none', seed: 1 });
    raceRun(R);
    window.raceGrip = sv.grip; RACE.pace = sv.pace; RACE.mistake = sv.mis;
    const c = R.cars[0], lapKg = c.laps[2].fuelKg;
    const P = mCivic.prof[(RACE_GRIP.length - 1) * RACE_FUEL.length + 2];
    let g = 0; for (let i = 0; i < mCivic.n; i++) { const j = (i + 1) % mCivic.n; g += P.fr[i] * (mCivic.cum[i + 1] - mCivic.cum[i]) / Math.max(2, (P.v[i] + P.v[j]) / 2); }
    out.fuel = { race: lapKg, sum: g / 1000, perLapL: lapKg / mCivic.fuelRho, left: c.fuelKg };
  }
  // 4. tyres: from cold, and a slick against a road tyre
  {
    const R = raceInit([mCivic], { track: 'tech', laps: 12, strategy: 'none', seed: 2 }); raceRun(R);
    const c = R.cars[0];
    out.tyres = { laps: c.laps.map(l => l.t), wear: c.laps.map(l => l.wear), T: c.T.slice(), tOpt: mCivic.tyre.tOpt, tWin: mCivic.tyre.tWin };
    // seconds of steady cornering (30 m/s, 0.9 g) until the tyre is within half a window of its best
    const heat = M => { const T = [RACE.air, RACE.air, RACE.air, RACE.air], W = [0, 0, 0, 0]; M.massNow = M.mass;
      let k = 0; for (; k < 3000 && Math.max(...T) < M.tyre.tOpt - M.tyre.tWin / 2; k++) raceTyreStep(M, M.tyre, T, W, 30, 9, 0, 0.1);
      return { s: k / 10 }; };
    const slickM = Object.assign({}, mCivic, { tyre: raceCompound('slick'), mu0: TIRE_TYPE.slick.mu });
    out.slick = { road: heat(mCivic), slick: heat(slickM), coldSlick: tyreTempGrip(RACE.air, TIRE_TYPE.slick), coldRoad: tyreTempGrip(RACE.air, TIRE_TYPE.sport),
      at60: { slick: tyreTempGrip(60, TIRE_TYPE.slick), road: tyreTempGrip(60, TIRE_TYPE.sport) } };
  }
  // 5. seeds
  const sig = R => R.cars.map(c => c.laps.map(l => l.t.toFixed(3)).join(',')).join('|');
  {
    const a = raceInit([mGT3, mCivic, mMX5], { track: 'tech', laps: 5, seed: 11 }); raceRun(a);
    const b = raceInit([mGT3, mCivic, mMX5], { track: 'tech', laps: 5, seed: 11 }); raceRun(b);
    const c = raceInit([mGT3, mCivic, mMX5], { track: 'tech', laps: 5, seed: 12 }); raceRun(c);
    out.seed = { same: sig(a) === sig(b), differs: sig(a) !== sig(c) };
  }
  // 6. traffic: the GT3 from the back of a reversed grid wins; two identical cars hold their order
  {
    const R = raceInit([mMX5, mCivic, mGT3], { track: 'tech', laps: 6, seed: 5, grid: 'reverse' }); raceRun(R);
    const res = raceResults(R);
    out.traffic = { winner: res[0].name, gridOfWinner: res[0].grid, passes: R.events.filter(e => e.type === 'pass').length };
    const sv = RACE.pace; RACE.pace = 0;
    const T = raceInit([mCivic, mCivic], { track: 'tech', laps: 5, seed: 5 }); raceRun(T);
    RACE.pace = sv;
    out.twins = { passes: T.events.filter(e => e.type === 'pass').length, order: raceResults(T).map(x => x.grid) };
    // the car behind never drives through the car ahead unless it is passing it
    let overlap = 0;
    const rc = T.rec;
    for (let k = 0; k < rc.n; k++) {
      const a = rc.data[0][k * rc.K + 13], b = rc.data[1][k * rc.K + 13];
      if (Math.abs(a - b) < 1 && rc.data[0][k * rc.K + 14] === 0 && rc.data[1][k * rc.K + 14] === 0 && rc.data[0][k*rc.K+12] === 0 && rc.data[1][k*rc.K+12] === 0) overlap++;
    }
    out.twins.overlap = overlap;
  }
  // 7. pits: longer than a tank needs a stop; with stops off, a car that cannot make it runs dry
  {
    const small = Object.assign({}, mGT3, { tankKg: mGT3.fuelPerLapKg * 4.5, tankL: mGT3.fuelPerLapKg * 4.5 / mGT3.fuelRho });
    const R = raceInit([small, mCivic], { track: 'tech', laps: 9, seed: 3 }); raceRun(R);
    const c = R.cars.find(x => x.M === small);
    out.pits = { stops: c.stopsDone, state: c.state, minFuel: Math.min(...Array.from({ length: R.rec.n }, (_, k) => R.rec.data[R.cars.indexOf(c)][k * R.rec.K + 10])) };
    const D = raceInit([small, mCivic], { track: 'tech', laps: 9, seed: 3, strategy: 'none' }); raceRun(D);
    out.dry = D.cars.find(x => x.M === small).state;
  }
  out.restoredEnd = JSON.stringify(serializeBuild('x', '')) === before;
  return out;
});

console.log('== racing a build leaves the loaded build alone ==');
console.log(`  restored after modelling: ${r.restored}, after everything: ${r.restoredEnd}`);
if (!r.restored || !r.restoredEnd) fails.push('serializeBuild() changed: the race did not put the user\'s build back');

console.log('\n== a car alone on perfect tyres laps in the solver\'s time ==');
const solo = r.solo.laps.slice(1);
console.log(`  solver ${r.solo.solver.toFixed(2)} s · race laps ${r.solo.laps.map(t => t.toFixed(2)).join(' ')}`);
for (const t of solo) if (Math.abs(t / r.solo.solver - 1) > 0.004) fails.push(`flying lap ${t.toFixed(2)} s against the solver's ${r.solo.solver.toFixed(2)} (more than 0.4%)`);

console.log('\n== a standing start costs a believable amount ==');
const dl = r.launch.rest - r.launch.fly;
console.log(`  flying ${r.launch.fly.toFixed(2)} s · from rest ${r.launch.rest.toFixed(2)} s (+${dl.toFixed(2)})`);
if (!(dl > 1.5 && dl < 6)) fails.push(`a standing start costs ${dl.toFixed(2)} s on a GT3 (expected 1.5-6)`);
if (!(r.solo.laps[0] > r.solo.laps[1] + 1.5)) fails.push('the race\'s first lap is not slower than its flying laps');

console.log('\n== fuel is power x BSFC ==');
console.log(`  race lap ${r.fuel.race.toFixed(3)} kg · summed here ${r.fuel.sum.toFixed(3)} kg · ${r.fuel.perLapL.toFixed(2)} L/lap`);
if (Math.abs(r.fuel.race / r.fuel.sum - 1) > 0.03) fails.push(`the race burns ${r.fuel.race.toFixed(3)} kg a lap against ${r.fuel.sum.toFixed(3)} from power x BSFC`);
if (!(r.fuel.perLapL > 0.3 && r.fuel.perLapL < 1.5)) fails.push(`${r.fuel.perLapL.toFixed(2)} L a lap of a 2 km circuit is not a believable figure`);
if (r.fuel.left < 0) fails.push('the tank went negative');

console.log('\n== tyres from cold ==');
console.log(`  laps ${r.tyres.laps.map(t => t.toFixed(2)).join(' ')}`);
console.log(`  wear ${r.tyres.wear.map(w => w.toFixed(3)).join(' ')} · temps ${r.tyres.T.map(Math.round).join('/')} C (window ${r.tyres.tOpt}±${r.tyres.tWin})`);
// lap 1 is a standing start on cold tyres; after that the tyres come in and then go off slowly, so the
// laps stay close together and, past the first few, never get quicker as the tread wears
const run = r.tyres.laps.slice(1);
if (!(r.tyres.laps[0] > Math.max(...run) + 3)) fails.push('a standing start on cold tyres is not the slowest lap');
if (Math.max(...run) / Math.min(...run) > 1.02) fails.push('the laps after the first spread by more than 2%');
if (!(r.tyres.laps[11] >= r.tyres.laps[2])) fails.push('the car is quicker on worn tyres than on fresh warm ones');
for (let k = 1; k < r.tyres.wear.length; k++) if (r.tyres.wear[k] < r.tyres.wear[k - 1]) fails.push('tyre wear went down');
const hot = Math.max(...r.tyres.T), cool = Math.min(...r.tyres.T);
if (!(hot > r.tyres.tOpt - r.tyres.tWin && hot < r.tyres.tOpt + 2 * r.tyres.tWin)) fails.push(`the hottest tyre settles at ${Math.round(hot)} C, outside any working range for its compound`);
if (!(cool > 35)) fails.push(`a tyre stays at ${Math.round(cool)} C after twelve laps`);
console.log(`  steady cornering to within half a window: road tyre ${r.slick.road.s.toFixed(1)} s · slick ${r.slick.slick.s.toFixed(1)} s`);
console.log(`  grip at ambient: road ${r.slick.coldRoad.toFixed(3)} · slick ${r.slick.coldSlick.toFixed(3)} · at 60 C: road ${r.slick.at60.road.toFixed(3)} · slick ${r.slick.at60.slick.toFixed(3)}`);
if (!(r.slick.coldSlick < r.slick.coldRoad)) fails.push('a cold slick grips no worse than a cold road tyre');
if (!(r.slick.at60.slick < r.slick.at60.road)) fails.push('at road-tyre temperatures a slick is not below its window');
if (!(r.slick.slick.s > r.slick.road.s)) fails.push('a slick comes up to temperature no later than a road tyre');

console.log('\n== the seed ==');
console.log(`  same seed same race: ${r.seed.same} · another seed another race: ${r.seed.differs}`);
if (!r.seed.same) fails.push('the same seed gave two different races');
if (!r.seed.differs) fails.push('a different seed gave the same race');

console.log('\n== traffic ==');
console.log(`  reversed grid: ${r.traffic.winner} wins from P${r.traffic.gridOfWinner}, ${r.traffic.passes} passes`);
if (!/911/.test(r.traffic.winner)) fails.push(`the GT3 does not win from the back (won by ${r.traffic.winner})`);
if (r.traffic.passes < 2) fails.push('the GT3 got to the front without passing anybody');
console.log(`  identical cars, no driver variation: ${r.twins.passes} passes, finish ${r.twins.order.join(',')}, ${r.twins.overlap} samples nose to tail inside a metre`);
if (r.twins.passes !== 0 || r.twins.order.join(',') !== '1,2') fails.push('two identical cars swapped places with nothing between them');
if (r.twins.overlap > 0) fails.push('the car behind drove through the car ahead');

console.log('\n== pit stops ==');
console.log(`  4.5 laps of fuel, 9 laps: ${r.pits.stops} stop(s), ${r.pits.state}, lowest ${r.pits.minFuel.toFixed(2)} L · with stops off: ${r.dry}`);
if (r.pits.stops < 1) fails.push('a race longer than a tank made no pit stop');
if (r.pits.state !== 'fin') fails.push(`with stops the short-tank car did not finish (${r.pits.state})`);
if (r.pits.minFuel < 0) fails.push('the tank ran below empty');
if (r.dry !== 'dnf') fails.push('with stops off the short-tank car did not run out');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
