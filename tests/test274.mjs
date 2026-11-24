// WHY THIS EXISTS (B11): driving sim stepCar & lap solver parity (tyre thermal/wear/wet/camber/smoke,
// brake thermal fade & proportioning valve, reverse gear, automatic torque converter, and lap/accel aids + AWD + steering).
// What must hold:
//   · stepCar tyre temperature rises under sustained sliding, accumulates wear, and produces smoke; car.wet reduces grip;
//   · driveTyre applies lateral camber grip loss off CAMBER_BEST without reducing pure longitudinal grip;
//   · stepCar brake temperature rises under repeated heavy stops and thermally fades (longer stop distance);
//   · stepCar reverse gear (gear = -1) accelerates the car backward (vx < 0, x < 0) on ICE and EV;
//   · stepCar automatic torque converter multiplies launch torque below stall speed (GEARBOX.auto.stall/mult);
//   · simulateLapCore non-ABS brakes earlier / laps slower than ABS, and steering trace includes Kus * ay slip angle;
//   · simulateAccelRun respects vehicle.aids.tc and centreCoupling(vehicle) (awdMode open vs lock);
//   · simulateBraking supports optional wet grip scaling (wet stop > dry stop);
//   · no page errors.
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
  const out = {};

  // 1. Tyre thermal rise, wear, smoke under sustained sliding + wet grip reduction + camber grip loss
  loadCar('Corvette Z06 (C8');
  const carDry = driveCar();
  const sSlide = driveState(carDry);
  carDry.tc = false; carDry.esp = false;
  const t0 = sSlide.tyreT[2];
  let maxSmoke = 0;
  for (let i = 0; i < 400; i++) {
    stepCar(carDry, sSlide, { steer: 0.35, throttle: 1, brake: 0, gear: 1 }, 0.01);
    maxSmoke = Math.max(maxSmoke, sSlide.smoke[2], sSlide.smoke[3]);
  }
  const stopDry = driveStop100(carDry);
  const carWet = driveCar();
  carWet.wet = 1;
  const stopWet = driveStop100(carWet);
  // Camber grip loss: compare lateral Fy at optimal -1.5 deg vs +4 deg lean, and check pure longitudinal Fx unchanged
  const fOpt = driveTyre(carDry, 4000, 0, 0.12, true, 0, 1, 1.5 * Math.PI / 180);
  const fBad = driveTyre(carDry, 4000, 0, 0.12, true, 0, 1, -4.0 * Math.PI / 180);
  const xOpt = driveTyre(carDry, 4000, 0.10, 0, true, 0, 1, 1.5 * Math.PI / 180);
  const xBad = driveTyre(carDry, 4000, 0.10, 0, true, 0, 1, -4.0 * Math.PI / 180);
  out.tyre = {
    t0, tAfter: Math.max(sSlide.tyreT[2], sSlide.tyreT[3]),
    wear: Math.max(sSlide.tyreW[2], sSlide.tyreW[3]),
    maxSmoke,
    stopDry: stopDry.dist, stopWet: stopWet.dist,
    fyOpt: fOpt[1], fyBad: fBad[1], fxOpt: xOpt[0], fxBad: xBad[0]
  };

  // 2. Brake thermal rise & fade under repeated heavy stops in stepCar
  loadCar('Golf GTI');
  const carBrk = driveCar();
  const coldStop = driveStop100(carBrk);
  const sHeat = driveRolling(carBrk, 180);
  let maxBrkT = 0;
  for (let rep = 0; rep < 6; rep++) {
    sHeat.vx = 180 / 3.6; sHeat.vy = 0; sHeat.w = sHeat.w.map(() => sHeat.vx / carBrk.r);
    while (sHeat.vx > 5 && sHeat.t < 60) {
      stepCar(carBrk, sHeat, { steer: 0, throttle: 0, brake: 1 }, 0.01);
      maxBrkT = Math.max(maxBrkT, sHeat.brakeT[0], sHeat.brakeT[1]);
    }
  }
  // Now measure 100-0 stop starting with the hot rotors
  const sHot = driveRolling(carBrk, 100);
  sHot.brakeT = sHeat.brakeT.slice();
  const tHotStart = sHot.brakeT[0];
  while (sHot.vx > 0.3 && sHot.t < 15) stepCar(carBrk, sHot, { steer: 0, throttle: 0, brake: 1 }, 0.005);
  out.brake = {
    coldDist: coldStop.dist, hotDist: sHot.x,
    tHotStart, maxBrkT, onset: carBrk.brakeTh.onset
  };

  // 3. Reverse gear on ICE and EV
  loadCar('MX-5');
  const carIce = driveCar();
  const sRevIce = driveState(carIce);
  for (let i = 0; i < 200; i++) stepCar(carIce, sRevIce, { steer: 0, throttle: 0.7, brake: 0, gear: -1 }, 0.01);
  loadCar('Tesla Model 3');
  const carEv = driveCar();
  const sRevEv = driveState(carEv);
  for (let i = 0; i < 200; i++) stepCar(carEv, sRevEv, { steer: 0, throttle: 0.5, brake: 0, gear: -1 }, 0.01);
  out.reverse = { iceVx: sRevIce.vx, iceX: sRevIce.x, evVx: sRevEv.vx, evX: sRevEv.x };

  // 4. Automatic torque converter multiplication below stall speed
  loadCar('Golf GTI');
  document.getElementById('vhGearbox').value = 'auto';
  buildVehicle();
  const carAuto = driveCar();
  const sAuto = driveLaunch(carAuto);
  carAuto.tc = false;
  // Hold brakes? No, free launch from stall for 0.05 s and compare Fx against 1:1 engine torque
  let peakFx = 0;
  for (let i = 0; i < 15; i++) {
    stepCar(carAuto, sAuto, { steer: 0, throttle: 1, brake: 0, gear: 1 }, 0.005);
    peakFx = Math.max(peakFx, sAuto.Fx[0] + sAuto.Fx[1] + sAuto.Fx[2] + sAuto.Fx[3]);
  }
  const tqAtStall = driveEngine(carAuto, 1, carAuto.tcStall, sAuto.boost, sAuto.soc);
  const fxNoMult = tqAtStall * carAuto.ratios[0] * carAuto.fd * carAuto.eff / carAuto.r;
  out.autoTc = { tcStall: carAuto.tcStall, tcMult: carAuto.tcMult, peakFx, fxNoMult };

  // 5. simulateLapCore: non-ABS slower than ABS + steering trace includes Kus * ay
  loadCar('Golf GTI');
  vehicle.aids = { abs: true, tc: true, esp: true };
  const lapAbs = simulateLap('tech');
  vehicle.aids = { abs: false, tc: true, esp: true };
  const lapNoAbs = simulateLap('tech');
  // Check steering vs pure Ackermann on corners
  const p = lapAbs.track.line, wb = vehicle.wb || 2.6;
  let maxSteerDiff = 0;
  for (let i = 0; i < p.length; i++) {
    if (Math.abs(lapAbs.replay.gLat[i]) > 0.5) {
      const ack = Math.sign(lapAbs.replay.gLat[i]) * Math.atan(wb / Math.max(1, p[i].r));
      maxSteerDiff = Math.max(maxSteerDiff, Math.abs(lapAbs.replay.steer[i] - ack));
    }
  }
  out.lap = { tAbs: lapAbs.lap, tNoAbs: lapNoAbs.lap, maxSteerDiff };

  // 6. simulateAccelRun: AWD centreCoupling (open vs lock) + simulateBraking wet scaling
  loadCar('Nissan GT-R');
  vehicle.awdMode = 'lock';
  const accLock = simulateAccelRun();
  vehicle.awdMode = 'open';
  const accOpen = simulateAccelRun();
  const brkDry = simulateBraking(100 / 3.6, null, 0);
  const brkWet = simulateBraking(100 / 3.6, null, 1);
  out.awdBrk = {
    t100Lock: accLock.t100, t100Open: accOpen.t100,
    brkDry: brkDry.dist, brkWet: brkWet.dist
  };

  // 7. Existing driveSineDwell ESP sanity check
  loadCar('MX-5');
  const sd = driveSineDwell(driveCar());
  out.sd = { pass: sd.pass, r1: sd.r1, r175: sd.r175, y: sd.y };

  return out;
});
await browser.close();

console.log('B11 results:', JSON.stringify(r, null, 2));

if (!(r.tyre.tAfter > r.tyre.t0 + 5)) fails.push(`tyre temp did not rise under sliding (${r.tyre.t0.toFixed(1)} -> ${r.tyre.tAfter.toFixed(1)} C)`);
if (!(r.tyre.wear > 0)) fails.push(`tyre wear did not accumulate (${r.tyre.wear})`);
if (!(r.tyre.maxSmoke > 0.05)) fails.push(`tyre smoke stayed near zero (${r.tyre.maxSmoke})`);
if (!(r.tyre.stopWet > r.tyre.stopDry * 1.15)) fails.push(`wet stop not longer than dry (${r.tyre.stopDry.toFixed(1)} vs ${r.tyre.stopWet.toFixed(1)} m)`);
if (!(r.tyre.fyBad < r.tyre.fyOpt * 0.95)) fails.push(`camber loss did not reduce lateral Fy (${r.tyre.fyOpt.toFixed(0)} vs ${r.tyre.fyBad.toFixed(0)} N)`);
if (!(Math.abs(r.tyre.fxBad - r.tyre.fxOpt) < 1)) fails.push(`camber loss altered pure longitudinal Fx (${r.tyre.fxOpt.toFixed(1)} vs ${r.tyre.fxBad.toFixed(1)} N)`);

if (!(r.brake.maxBrkT > r.brake.onset)) fails.push(`brake rotor did not heat past onset (${r.brake.maxBrkT.toFixed(0)} <= ${r.brake.onset} C)`);
if (!(r.brake.hotDist > r.brake.coldDist + 0.5)) fails.push(`hot faded brakes did not stop longer (${r.brake.coldDist.toFixed(1)} vs ${r.brake.hotDist.toFixed(1)} m)`);

if (!(r.reverse.iceVx < -2 && r.reverse.iceX < -2)) fails.push(`ICE reverse failed (vx=${r.reverse.iceVx.toFixed(2)}, x=${r.reverse.iceX.toFixed(2)})`);
if (!(r.reverse.evVx < -2 && r.reverse.evX < -2)) fails.push(`EV reverse failed (vx=${r.reverse.evVx.toFixed(2)}, x=${r.reverse.evX.toFixed(2)})`);

if (!(r.autoTc.tcStall > 0 && r.autoTc.tcMult > 1)) fails.push(`auto torque converter params missing (${JSON.stringify(r.autoTc)})`);
if (!(r.autoTc.peakFx > r.autoTc.fxNoMult * 1.15)) fails.push(`auto torque converter did not multiply launch force (${r.autoTc.peakFx.toFixed(0)} vs ${r.autoTc.fxNoMult.toFixed(0)} N)`);

if (!(r.lap.tNoAbs > r.lap.tAbs + 0.05)) fails.push(`non-ABS lap not slower than ABS (${r.lap.tAbs.toFixed(2)} vs ${r.lap.tNoAbs.toFixed(2)} s)`);
if (!(r.lap.maxSteerDiff > 0.002)) fails.push(`lap steering trace missing Kus*ay slip-angle delta (max diff ${r.lap.maxSteerDiff.toFixed(5)} rad)`);

if (!(r.awdBrk.t100Open > r.awdBrk.t100Lock + 0.02)) fails.push(`AWD open centre not slower than locked on launch (${r.awdBrk.t100Lock.toFixed(2)} vs ${r.awdBrk.t100Open.toFixed(2)} s)`);
if (!(r.awdBrk.brkWet > r.awdBrk.brkDry * 1.15)) fails.push(`simulateBraking wet not longer than dry (${r.awdBrk.brkDry.toFixed(1)} vs ${r.awdBrk.brkWet.toFixed(1)} m)`);

if (!r.sd.pass) fails.push(`MX-5 driveSineDwell with ESP failed (${JSON.stringify(r.sd)})`);
if (errors.length) fails.push(...errors);

if (fails.length) {
  console.error('FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS: B11 driving sim & lap parity');
