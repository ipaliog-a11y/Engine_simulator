// WHY THIS EXISTS: regression guards for vehicle braking/top-speed edge cases, div-by-zero in
// drive/gear/fuel-cycle, zero-damping suspension calculator hang, malformed/stationary/huge GPX
// traces, and WebAudio NaN guards. What must hold:
//   · extreme front ballast clamps vehicle.fWt to [0.15, 0.85], brakeValveRear() >= 0, and
//     simulateBraking() never cools rear rotors below ambient and sets timedOut when hitting 25 s;
//   · simulateAccel() reports topSpeed === 0 (not vRedline) when drag exceeds drive force everywhere;
//   · driveSineDwell() on a strongly oversteering car (1 + Kus*v^2 < 0), stepCar(..., 0),
//     fitGearbox([3, 1]), and gwNice(0, 5) all produce finite results without throwing;
//   · susp-window with cb = 0, cr = 0 produces finite scFreq/scCalc gains and draws drawSuspFreq()
//     without an infinite tick loop;
//   · parseGPX() accepts lon-before-lat and single quotes, drops out-of-range coords, interpolates
//     missing <ele>; gpxToTrack() rejects stationary traces and caps huge loops at <= 4000 pts;
//   · soundDrive() with NaN AFR/RPM, motorTorqueSplit() with Tpk = 0, and Gas.rate/dyn with E = 0
//     all return finite numbers.
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
  const out = {};

  // 1. Extreme front ballast + brakeValveRear + simulateBraking timedOut
  const prevBallast = document.getElementById('vhBallast').value;
  const prevPos = document.getElementById('vhBallastPos').value;
  document.getElementById('vhBallast').value = '200';
  document.getElementById('vhBallastPos').value = '100';
  buildVehicle();
  out.fWt = vehicle.fWt;
  const vValve = brakeValveRear(0.95, 0.6);
  out.valveNeg = vValve(2) < 0 || vValve(10) < 0 || !Number.isFinite(vValve(5));
  const prevAbs = vehicle.aids && vehicle.aids.abs;
  vehicle.aids = Object.assign({}, vehicle.aids, { abs: false });
  const bNoAbs = simulateBraking(100 / 3.6);
  out.brakeRearCool = bNoAbs.tR < BRAKE_AMBIENT - 1e-6 || !Number.isFinite(bNoAbs.dist);
  out.brakeNormalTimeout = bNoAbs.timedOut;
  // Force 25 s timeout via tiny brakeDecelCap and zero drag
  const svCap = vehicle.brakeDecelCap, svCd = vehicle.cdA;
  vehicle.brakeDecelCap = 0.01; vehicle.cdA = 0;
  const bSlow = simulateBraking(100 / 3.6);
  out.brakeTimedOut = bSlow.timedOut;
  vehicle.brakeDecelCap = svCap; vehicle.cdA = svCd;
  if (vehicle.aids) vehicle.aids.abs = prevAbs;
  document.getElementById('vhBallast').value = prevBallast;
  document.getElementById('vhBallastPos').value = prevPos;
  buildVehicle();

  // 2. Top speed when drag exceeds drive force everywhere (must be 0, not vRedline)
  const svCrr = vehicle.crr;
  vehicle.crr = 50;
  const pDrag = simulateAccel();
  out.dragTopSpeed = pDrag.topSpeed;
  vehicle.crr = svCrr;
  buildVehicle();

  // 3. Drive model (oversteering Kus + dt === 0), fitGearbox(<3), gwNice(0)
  const car = driveCar();
  const overCar = Object.assign({}, car, { Kus: -0.005 }); // 1 + Kus*(80/3.6)^2 < 0
  const swd = driveSineDwell(overCar);
  out.swdFinite = Number.isFinite(swd.beta) && Number.isFinite(swd.y) && swd.path.length > 0;
  const st0 = driveRolling(car, 80);
  const stAfter = stepCar(car, st0, { steer: 0.5, throttle: 0.5, brake: 0 }, 0);
  out.stepZeroFinite = Number.isFinite(stAfter.vx) && Number.isFinite(stAfter.psi);
  const fg2 = fitGearbox([3.2, 1.0]);
  const fg1 = fitGearbox([1.0]);
  out.fitGearsFinite = Object.values(fg2).every(Number.isFinite) && Object.values(fg1).every(Number.isFinite);
  out.gwNiceZero = gwNice(0, 5);

  // 4. Zero-damping suspension calculator (cb = cr = 0)
  openSuspWin();
  sc.p.cb = 0; sc.p.cr = 0;
  renderSuspWin();
  out.suspFinite = sc.r.body.every(Number.isFinite) && sc.r.wheel.every(Number.isFinite) &&
    Number.isFinite(sc.r.pkB.a) && Number.isFinite(sc.r.pkW.a);
  closeSuspWin();

  // 5. GPX hardening: lon-before-lat, single quotes, out-of-range, missing <ele>, stationary, huge
  const gpxMixed = `<gpx><trk><trkseg>
    <trkpt lon='10.000' lat='50.000'><ele>100</ele></trkpt>
    <trkpt lon='10.001' lat='50.000'></trkpt>
    <trkpt lon='10.002' lat='50.000'><ele>200</ele></trkpt>
    <trkpt lat='95.0' lon='10.0'><ele>50</ele></trkpt>
    <trkpt lat='50.0' lon='200.0'><ele>50</ele></trkpt>
  </trkseg></trk></gpx>`;
  const parsed = parseGPX(gpxMixed);
  out.gpxParsed = { len: parsed.length, midEle: parsed[1] && parsed[1].ele };

  const gpxStat = '<gpx><trk><trkseg>' +
    Array.from({ length: 25 }, () => '<trkpt lat="50.0" lon="10.0"><ele>100</ele></trkpt>').join('') +
    '</trkseg></trk></gpx>';
  try { gpxToTrack(gpxStat, {}); out.gpxStatThrew = false; } catch (e) { out.gpxStatThrew = true; }

  // Huge loop (~120 km circumference -> would exceed 4000 pts without cap)
  const gpxHuge = '<gpx><trk><trkseg>' +
    Array.from({ length: 60 }, (_, i) => {
      const a = 2 * Math.PI * i / 60;
      const lat = 50 + 0.18 * Math.sin(a), lon = 10 + 0.28 * Math.cos(a);
      return `<trkpt lon='${lon.toFixed(5)}' lat='${lat.toFixed(5)}'><ele>${(100 + 20 * Math.sin(a)).toFixed(1)}</ele></trkpt>`;
    }).join('') + '</trkseg></trk></gpx>';
  const hugeTrack = gpxToTrack(gpxHuge, { step: 22 });
  out.gpxHugeLen = hugeTrack.pts.length;

  // 6. WebAudio NaN guards: soundDrive, motorTorqueSplit, Gas worklet
  const badDrive = soundDrive(NaN, {
    rpm: NaN, map: NaN, afr: NaN, throttle: NaN, boostActual: NaN, coolant: NaN, knockRisk: NaN, blown: false
  });
  out.soundDriveFinite = ['strength', 'lope', 'crackle', 'bang', 'whineF', 'whineA', 'intake', 'knockProb', 'knockAmp']
    .every(k => Number.isFinite(badDrive[k]));
  const mts = motorTorqueSplit({ groups: [{ Tpk: 0, im: false }, { Tpk: 0, im: false }], Tpk: 0 }, 100);
  out.motorSplitFinite = mts.every(Number.isFinite);
  const gasLib = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', SOUND_GAS_SRC + ';return {Gas};')(class {}, () => {}, 48000);
  const g0 = new gasLib.Gas(101325, 0.001, 300);
  g0.E = 0;
  out.gasZeroFinite = Number.isFinite(g0.dyn(1)) && Number.isFinite(g0.c()) &&
    Number.isFinite(gasLib.Gas.rate(1, 0, 0, 0, 0, g0.lim, g0.choke));

  return out;
});

if (!(r.fWt >= 0.15 && r.fWt <= 0.85)) fails.push('ballast fWt out of [0.15, 0.85]: ' + r.fWt);
if (r.valveNeg) fails.push('brakeValveRear returned negative or non-finite');
if (r.brakeRearCool) fails.push('simulateBraking cooled rear rotor or returned non-finite dist');
if (r.brakeNormalTimeout !== false) fails.push('normal braking unexpectedly timed out');
if (r.brakeTimedOut !== true) fails.push('25 s cap did not set timedOut: true');
if (r.dragTopSpeed !== 0) fails.push('expected topSpeed === 0 when drag exceeds drive force, got ' + r.dragTopSpeed);
if (!r.swdFinite) fails.push('driveSineDwell failed on oversteering car');
if (!r.stepZeroFinite) fails.push('stepCar(dt=0) produced non-finite state');
if (!r.fitGearsFinite) fails.push('fitGearbox(<3 gears) produced non-finite values');
if (!(r.gwNiceZero > 0 && Number.isFinite(r.gwNiceZero))) fails.push('gwNice(0,5) invalid: ' + r.gwNiceZero);
if (!r.suspFinite) fails.push('zero-damping susp-window produced non-finite values');
if (r.gpxParsed.len !== 3 || Math.abs(r.gpxParsed.midEle - 150) > 1e-6) fails.push('parseGPX hardening failed: ' + JSON.stringify(r.gpxParsed));
if (!r.gpxStatThrew) fails.push('gpxToTrack did not reject stationary trace');
if (!(r.gpxHugeLen > 0 && r.gpxHugeLen <= 4000)) fails.push('gpxToTrack did not cap huge trace: ' + r.gpxHugeLen);
if (!r.soundDriveFinite) fails.push('soundDrive returned non-finite on NaN state');
if (!r.motorSplitFinite) fails.push('motorTorqueSplit returned non-finite on Tpk=0');
if (!r.gasZeroFinite) fails.push('Gas worklet returned non-finite on E=0');
if (errors.length) fails.push(...errors);

console.log('test266:', JSON.stringify(r));
await browser.close();
if (fails.length) { console.error('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
