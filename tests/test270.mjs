// WHY THIS EXISTS (build 446): race wet/mandatory-stop strategy, wet wake, idle fuel floor,
// EV drift clutch-kick removal, P2 hybrid Moose regen coast & tip-rate sign, and high-CG skidpad rollover.
// What must hold:
//   · racePractice() uses actual cfg.weather wetness and wet/inter tyre compound for wet/damp races (not dry w=0);
//   · racePlan() honors cfg.minStops so AI cars schedule mandatory stops and finish with zero min_stops penalty;
//   · cars under VSC opportunistically take an upcoming planned stop inside the pit window without double-pitting;
//   · wet weather (w > 0.2) keeps a reduced slipstream/dirty-air wake active alongside RACE.spray;
//   · ICE cars keep a positive idle fuel burn floor (M.idleGs) at low/zero speed instead of burning 0;
//   · EVs never get init:'kick' plans in driftPlans() and never receive clutch:1 from driftDriver();
//   · P2 hybrids (car.el != null, !car.ev) neutralize regen in mooseCoastPedals() instead of full regen scrub;
//   · high-CG cars with SSF < mu fail skidRun() with ROLLOVER above SSF and skidBest() holds below SSF.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const loadCar = q => {
    const fc = FACTORY_CARS.find(c => c.name.includes(q));
    if (!fc) throw new Error('missing factory car: ' + q);
    loadVehiclePreset(fc);
    return fc;
  };
  const entryOf = q => {
    const fc = loadCar(q);
    return { name: fc.name, build: serializeBuild(fc.name, '') };
  };
  const out = {};

  // 1. Wet-race pit planning (racePractice uses cfg.weather & wet compound)
  const e1 = entryOf('MX-5');
  const M1 = raceCarModel(e1, 'tech', { wet: true });
  const prDry = racePractice(M1, { air: 22, weather: 'dry' }, 10, 'normal');
  const prWet = racePractice(M1, { air: 22, weather: 'wet' }, 10, 'normal');
  const prDamp = racePractice(M1, { air: 22, weather: 'damp' }, 10, 'normal');
  out.practice = {
    dryW: prDry.w, dryTyre: prDry.tyre, dryLap: prDry.laps[0].t,
    wetW: prWet.w, wetTyre: prWet.tyre, wetLap: prWet.laps[0].t,
    dampW: prDamp.w, dampTyre: prDamp.tyre, dampLap: prDamp.laps[0].t
  };

  // 2. minStops compliance in racePlan() and full raceRun()
  const M2 = M1;
  const plan0 = racePlan(M2, { laps: 6, air: 22, weather: 'dry', minStops: 0 }, { stops: null, mode: 'normal', start: 'auto' });
  const plan1 = racePlan(M2, { laps: 6, air: 22, weather: 'dry', minStops: 1 }, { stops: null, mode: 'normal', start: 'auto' });
  const Rmin = raceInit([M2, M2], { track: 'tech', laps: 6, air: 22, weather: 'dry', seed: 3, minStops: 1, strategy: 'auto' });
  raceRun(Rmin);
  const resMin = raceResults(Rmin);
  out.minStops = {
    plan0Stops: plan0.stops.length,
    plan1Stops: plan1.stops.length,
    stopsDone: resMin.map(x => x.stops),
    penalties: resMin.map(x => x.timePenalty),
    missEvents: Rmin.events.filter(e => e.type === 'min_stops').length
  };

  // 3. Opportunistic VSC pit stop inside pit window (and no double-pit)
  const Rvsc = raceInit([M2], { track: 'tech', laps: 8, air: 22, weather: 'dry', seed: 4, minStops: 1, vsc: true });
  const cv = Rvsc.cars[0];
  const plannedBefore = cv.plan.stops.slice();
  Rvsc.vsc = { fromLap: 2, left: 1 };
  cv.lapsDone = 1; // raceCross will advance to 2, 2 laps before planned stop 4
  cv.lapStart = 0;
  Rvsc.t = 90;
  raceCross(Rvsc, cv);
  const pitEv = Rvsc.events.find(e => e.type === 'pit');
  out.vscPit = {
    plannedBefore,
    state: cv.state,
    stopsDone: cv.stopsDone,
    remainingPlan: cv.plan.stops.slice(),
    why: pitEv ? pitEv.why : null
  };

  // 4. Wet wake alongside RACE.spray + idle fuel floor at low speed
  const Rw = raceInit([M1, M1], { track: 'tech', laps: 3, air: 22, weather: 'wet', seed: 1 });
  const pwrIdx = M1.lim.findIndex(x => x === 'power');
  const lead = Rw.cars[0], trail = Rw.cars[1];
  lead.launch = null; trail.launch = null;
  lead.lapsDone = 0; trail.lapsDone = 0;
  lead.i = (pwrIdx + 3) % M1.n; lead.f = 0; lead.v = 40; lead.sTot = raceDist(Rw, lead);
  trail.i = pwrIdx; trail.f = 0; trail.v = 40; trail.sTot = raceDist(Rw, trail);
  const gap0 = (raceCentre(Rw, lead) - raceCentre(Rw, trail) + Rw.Lc) % Rw.Lc;
  const x0 = (gap0 - (trail.M.len + lead.M.len) / 2) / lead.M.len;
  const wkExpected = raceWake(trail.M, trail.v, 'power', x0);
  // Step once to inspect trail._vt
  raceStepOnce(Rw);
  // Also check idle fuel burn at v = 0 on an ICE car
  const Ridle = raceInit([M2], { track: 'tech', laps: 3, air: 22, weather: 'dry', seed: 1 });
  const ci = Ridle.cars[0];
  ci.v = 0; ci._pv = 40; ci.launch = { d: 0 };
  const fuelBefore = ci.fuelUsed;
  raceStepOnce(Ridle);
  const fuelBurned = ci.fuelUsed - fuelBefore;
  out.wetAndIdle = {
    wkExpected,
    gap0,
    trailVt: trail._vt,
    trailPv: trail._pv,
    idleGs: M2.idleGs,
    fuelBurned,
    minExpectedBurn: M2.idleGs * RACE.dt / 1000
  };

  // 5. EV drift: no kick plans, never clutch:1 in driftDriver
  loadCar('Tesla Model 3 RWD (2021)');
  const evCar = driveCar();
  const evAutoPlans = driftPlans(evCar, 0, 'auto');
  const evKickPlans = driftPlans(evCar, 0, 'kick');
  // Spy on driftDriver controls across power & handbrake runs
  let maxEvClutch = 0, seenEvClutchProp = false;
  const C = driftSCourse(20, DRIFT_HALF_W, DRIFT_MID);
  for (const init of ['power', 'handbrake']) {
    const pl = { v: 14, betaT: 0.30, kick: 15, init, R: 20, gear: 1, pull: 2.2, initThr: 0.92 };
    for (const p of C.line) p.v = pl.v;
    const s = driveState(evCar);
    s.x = C.line[0].x; s.y = C.line[0].y;
    s.psi = Math.atan2(C.line[1].y - C.line[0].y, C.line[1].x - C.line[0].x);
    s.vx = pl.v; s.w = s.w.map(() => pl.v / evCar.r);
    s.gear = 1; s.we = pl.v / evCar.r * evCar.ratios[0] * evCar.fd;
    const d = { i: 0, kick1: 15, kick2: 15, pull: 2.2, seen1: false, seen2: false };
    for (let k = 0; k < 250; k++) {
      const u = driftDriver(evCar, s, C, d, pl);
      if ('clutch' in u) seenEvClutchProp = true;
      if (u.clutch > maxEvClutch) maxEvClutch = u.clutch;
      stepCar(evCar, s, u, 0.01);
    }
  }
  out.evDrift = {
    ev: evCar.ev,
    autoHasKick: evAutoPlans.some(p => p.init === 'kick'),
    kickFallbackHasKick: evKickPlans.some(p => p.init === 'kick'),
    kickFallbackCount: evKickPlans.length,
    maxEvClutch,
    seenEvClutchProp
  };

  // 6. P2 hybrid Moose coast: regen neutralized (not throttle=0 full regen)
  loadCar('BMW 330e (2020)');
  const p2Car = driveCar();
  const Dp2 = mooseDims();
  const sp2 = driveRolling(p2Car, 72);
  sp2.x = 5; // past x=0 entry
  const uP2 = { steer: 0, throttle: 0.5, brake: 0.3 };
  mooseCoastPedals(p2Car, sp2, uP2, Dp2);
  const tZero = driveEngine(p2Car, 0, sp2.rpm, sp2.boost, sp2.soc);
  const tCoast = driveEngine(p2Car, uP2.throttle, sp2.rpm, sp2.boost, sp2.soc);
  out.p2Moose = {
    ev: p2Car.ev,
    hasEl: p2Car.el != null,
    thr: uP2.throttle,
    brk: uP2.brake,
    tZero,
    tCoast
  };

  // 7. Skidpad high-CG rollover check (set vehicle.cg before driveCar so rollArm/rollI reflect high CG)
  loadCar('MX-5');
  const prevCg = vehicle.cg;
  vehicle.cg = 1.05;
  const tallCar = driveCar();
  vehicle.cg = prevCg;
  tallCar.mu = 1.15;
  tallCar.muF = 1.15;
  const ssf = (tallCar.tF + tallCar.tR) / 4 / tallCar.h;
  const vOver = Math.sqrt(1.05 * DRIVE_G * SKID_R);
  const overRun = skidRun(tallCar, vOver);
  const vHold = skidBest(tallCar);
  const holdRun = vHold ? skidRun(tallCar, vHold) : null;
  out.skidRoll = {
    ssf,
    overOutcome: overRun.outcome,
    overRolled: overRun.rolled,
    overOk: overRun.ok,
    holdOk: holdRun ? holdRun.ok : false,
    holdAy: holdRun ? holdRun.ayMean : 0
  };

  return out;
});

// Assertions
if (!(r.practice.dryW === 0 && r.practice.wetW > 0.5 && r.practice.dampW > 0.1))
  fails.push('racePractice wetness mismatch: ' + JSON.stringify(r.practice));
if (!(r.practice.wetTyre === 'wet' || r.practice.wetTyre === 'inter'))
  fails.push('racePractice wet did not pick rain tyre: ' + r.practice.wetTyre);
if (!(r.practice.wetLap > r.practice.dryLap))
  fails.push('racePractice wet lap should be slower than dry: ' + JSON.stringify(r.practice));

if (!(r.minStops.plan0Stops === 0 && r.minStops.plan1Stops >= 1))
  fails.push('racePlan minStops not scheduled: ' + JSON.stringify(r.minStops));
if (!(r.minStops.stopsDone.every(s => s >= 1) && r.minStops.penalties.every(p => p === 0) && r.minStops.missEvents === 0))
  fails.push('AI cars failed mandatory minStops compliance: ' + JSON.stringify(r.minStops));

if (!(r.vscPit.state === 'pit' && r.vscPit.stopsDone === 1 && r.vscPit.why === 'vsc' && r.vscPit.remainingPlan.length === 0))
  fails.push('opportunistic VSC pit failed: ' + JSON.stringify(r.vscPit));

if (!(r.wetAndIdle.wkExpected > 1))
  fails.push('expected positive slipstream wake on power segment: ' + JSON.stringify(r.wetAndIdle));
if (!(r.wetAndIdle.idleGs > 0 && r.wetAndIdle.fuelBurned >= r.wetAndIdle.minExpectedBurn * 0.99))
  fails.push('idle fuel floor not maintained at low speed: ' + JSON.stringify(r.wetAndIdle));

if (!(r.evDrift.ev && !r.evDrift.autoHasKick && !r.evDrift.kickFallbackHasKick && r.evDrift.kickFallbackCount > 0))
  fails.push('EV driftPlans still includes kick: ' + JSON.stringify(r.evDrift));
if (r.evDrift.seenEvClutchProp || r.evDrift.maxEvClutch > 0)
  fails.push('EV driftDriver sent clutch command: ' + JSON.stringify(r.evDrift));

if (!(!r.p2Moose.ev && r.p2Moose.hasEl && r.p2Moose.thr > 0 && r.p2Moose.brk === 0 && r.p2Moose.tZero < -5 && Math.abs(r.p2Moose.tCoast) < 1))
  fails.push('P2 hybrid Moose coast did not neutralize regen: ' + JSON.stringify(r.p2Moose));

if (!(r.skidRoll.overOutcome === 'ROLLOVER' && r.skidRoll.overRolled && !r.skidRoll.overOk))
  fails.push('high-CG skidpad above SSF did not ROLLOVER: ' + JSON.stringify(r.skidRoll));
if (!(r.skidRoll.holdOk && r.skidRoll.holdAy <= r.skidRoll.ssf + 0.05))
  fails.push('high-CG skidpad hold exceeded SSF: ' + JSON.stringify(r.skidRoll));

await browser.close();
if (errors.length) fails.push(...errors);
console.log(JSON.stringify(r, null, 2));
if (fails.length) {
  console.error('FAIL:\n' + fails.join('\n'));
  process.exit(1);
}
console.log('PASS test270');
