// WHY THIS EXISTS (B12): dynamic aero (ride-height/pitch sensitivity, wing post-stall, suspension bottoming),
// global ISA altitude/barometric pressure & headwind environment, and downforce-dependent rolling resistance.
// What must hold:
//   · wingAero drops CL smoothly below WING_CLMAX and adds separated wake drag (cdStall > 0) past stall;
//   · driveAeroAt & stepCar couple heave (ground-effect gain + bottoming choke) and pitch (aeroBal shift + drag);
//   · aeroDownforce caps downforce at axle bump-stop capacity and flags aeroBottomed in accel & lap solves;
//   · ENV defaults (alt=0, temp=20°C, wind=0) anchor pAmbBar=1.01325 bar and airRho=1.20 kg/m³ exactly;
//   · high altitude reduces airRho and NA torque more strongly than wastegated turbo torque;
//   · headwind lowers top speed and raises WLTP fuel & lap time, while tailwind does the opposite;
//   · higher clA at fixed cdA increases rolling resistance (higher WLTP L/100 km, higher eco fuel, lower vTop);
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
  const resetEnv = () => { ENV.alt_m = 0; ENV.tempC = 20; ENV.headwind_ms = 0; };
  const out = {};

  try {
    // 1. Wing post-stall lift drop & wake drag rise
    const baseWing = { span_mm: 1600, chord_mm: 250, plate_mm: 120, camber_pct: 6, height_mm: 900 };
    const w8 = wingAero({ ...baseWing, angle_deg: 8 });
    const w22 = wingAero({ ...baseWing, angle_deg: 22 });
    const w34 = wingAero({ ...baseWing, angle_deg: 34 });
    out.wing = {
      cl8: w8.CL, cd8: w8.cdA, st8: w8.stalled, cds8: w8.cdStall,
      cl22: w22.CL, cd22: w22.cdA, st22: w22.stalled, cds22: w22.cdStall,
      cl34: w34.CL, cd34: w34.cdA, st34: w34.stalled, cds34: w34.cdStall,
      clMax: WING_CLMAX
    };

    // 2. Dynamic aero ride-height & pitch sensitivity in driveAeroAt and stepCar
    loadCar('911 GT3');
    const carAero = driveCar();
    const a0 = driveAeroAt(carAero, 0, 0, 60, 1.20);
    const aLow = driveAeroAt(carAero, -0.04, 0, 60, 1.20);
    const aBot = driveAeroAt(carAero, -0.12, 0, 60, 1.20);
    const aDive = driveAeroAt(carAero, 0, -0.03, 60, 1.20);
    const aSquat = driveAeroAt(carAero, 0, 0.03, 60, 1.20);
    const sFast = driveRolling(carAero, 220);
    for (let i = 0; i < 60; i++) stepCar(carAero, sFast, { steer: 0, throttle: 0.4, brake: 0 }, 0.01);
    out.dynAero = {
      clA0: carAero.clA, bal0: carAero.aeroBal,
      a0, aLow, aBot, aDive, aSquat,
      stepHeave: sFast.heave, stepClAEff: sFast.clAEff, stepDown: sFast.aeroDown,
      stepCdAEff: sFast.cdAEff, stepBalEff: sFast.aeroBalEff
    };

    // 3. Suspension travel / bottoming check in aeroDownforce, simulateAccelRun, simulateLapCore
    loadCar('Golf GTI');
    const accStock = simulateAccelRun();
    const lapStock = simulateLap('tech');
    // Force extreme downforce onto soft street springs to trigger bottoming
    const svCl = vehicle.clA, svCapF = vehicle.aeroBumpCapF, svCapR = vehicle.aeroBumpCapR;
    vehicle.clA = 6.0;
    vehicle.aeroBumpCapF = 1800;
    vehicle.aeroBumpCapR = 1800;
    const adCap = aeroDownforce(vehicle, 60, 1.20);
    const accBot = simulateAccelRun();
    const lapBot = simulateLap('tech');
    vehicle.clA = svCl; vehicle.aeroBumpCapF = svCapF; vehicle.aeroBumpCapR = svCapR;
    out.bottoming = {
      stockAccBot: accStock.aeroBottomed, stockLapBot: lapStock.aeroBottomed,
      adCapF: adCap.F, adCapBot: adCap.bottomed,
      accBot: accBot.aeroBottomed, lapBot: lapBot.aeroBottomed
    };

    // 4. Global ISA altitude/barometric pressure & headwind
    resetEnv();
    const p0 = pAmbBar(), rho0 = airRho();
    ENV.alt_m = 2500;
    const p25 = pAmbBar(), rho25 = airRho();
    // Compare NA vs turbo torque drop at 2500 m
    resetEnv();
    loadCar('MX-5');
    const naTq0 = Math.max(...buildTorqueCurve().map(p => p.tq));
    ENV.alt_m = 2500;
    const naTq25 = Math.max(...buildTorqueCurve().map(p => p.tq));
    resetEnv();
    loadCar('Golf GTI');
    const tbTq0 = Math.max(...buildTorqueCurve().map(p => p.tq));
    ENV.alt_m = 2500;
    const tbTq25 = Math.max(...buildTorqueCurve().map(p => p.tq));

    // Headwind vs calm vs tailwind on Golf GTI
    resetEnv();
    loadCar('Golf GTI');
    const accCalm = simulateAccelRun();
    const cycCalm = engineCycle(vehicle);
    const lapCalm = simulateLap('tech');
    ENV.headwind_ms = 15;
    const accHead = simulateAccelRun();
    const cycHead = engineCycle(vehicle);
    const lapHead = simulateLap('tech');
    ENV.headwind_ms = -10;
    const accTail = simulateAccelRun();
    const cycTail = engineCycle(vehicle);
    resetEnv();
    out.env = {
      p0, rho0, p25, rho25,
      naDrop: 1 - naTq25 / naTq0,
      tbDrop: 1 - tbTq25 / tbTq0,
      vCalm: accCalm.topSpeed, vHead: accHead.topSpeed, vTail: accTail.topSpeed,
      lCalm: cycCalm.l100, lHead: cycHead.l100, lTail: cycTail.l100,
      lapCalm: lapCalm.lap, lapHead: lapHead.lap
    };

    // 5. Downforce-dependent rolling resistance at fixed cdA
    resetEnv();
    loadCar('Golf GTI');
    vehicle.clA = 0;
    const vDrag0 = dragLimitedV(180, vehicle.cdA, vehicle.crr, vehicle.mass, 0);
    const lCrr0 = engineCycle(vehicle).l100;
    const accCrr0 = simulateAccelRun().freeSpeed;
    const ecoLine = buildTrack('tech').line.slice(0, 60);
    const ecoV = ecoLine.map(() => 35);
    const ecoF0 = ecoFuelKg(ecoLine, ecoV);
    vehicle.clA = 2.5;
    const vDragDf = dragLimitedV(180, vehicle.cdA, vehicle.crr, vehicle.mass, 2.5);
    const lCrrDf = engineCycle(vehicle).l100;
    const accCrrDf = simulateAccelRun().freeSpeed;
    const ecoFDf = ecoFuelKg(ecoLine, ecoV);
    out.dfRoll = { vDrag0, vDragDf, lCrr0, lCrrDf, accCrr0, accCrrDf, ecoF0, ecoFDf };
  } finally {
    resetEnv();
  }
  return out;
});

const check = (ok, msg) => { if (!ok) fails.push(msg); };

// 1. Wing post-stall
check(!r.wing.st8 && r.wing.cds8 === 0, `8 deg wing should not stall: st=${r.wing.st8} cds=${r.wing.cds8}`);
check(r.wing.st22 && r.wing.st34, `22/34 deg wing should stall: st22=${r.wing.st22} st34=${r.wing.st34}`);
check(r.wing.cl22 < r.wing.clMax && r.wing.cl34 < r.wing.cl22, `post-stall CL should drop: cl22=${r.wing.cl22.toFixed(3)} cl34=${r.wing.cl34.toFixed(3)} max=${r.wing.clMax}`);
check(r.wing.cds22 > 0 && r.wing.cds34 > r.wing.cds22 && r.wing.cd34 > r.wing.cd22 && r.wing.cd22 > r.wing.cd8,
  `post-stall wake drag should rise: cd8=${r.wing.cd8.toFixed(3)} cd22=${r.wing.cd22.toFixed(3)} cd34=${r.wing.cd34.toFixed(3)}`);

// 2. Dynamic aero ride-height & pitch
check(r.dynAero.aLow.clScale > 1.05 && r.dynAero.aLow.down > r.dynAero.a0.down,
  `lower heave should increase downforce: clScale=${r.dynAero.aLow.clScale.toFixed(3)}`);
check(r.dynAero.aBot.bottomed && r.dynAero.aBot.clScale < r.dynAero.aLow.clScale,
  `excessive heave should bottom and choke CL: bot=${r.dynAero.aBot.bottomed} clBot=${r.dynAero.aBot.clScale.toFixed(3)} clLow=${r.dynAero.aLow.clScale.toFixed(3)}`);
check(r.dynAero.aDive.aeroBal > r.dynAero.bal0 + 0.03 && r.dynAero.aDive.cdScale > 1.01,
  `nose-down pitch should shift aeroBal forward & add drag: bal=${r.dynAero.aDive.aeroBal.toFixed(3)} vs ${r.dynAero.bal0.toFixed(3)}`);
check(r.dynAero.aSquat.aeroBal < r.dynAero.bal0 - 0.03,
  `nose-up pitch should shift aeroBal rearward: bal=${r.dynAero.aSquat.aeroBal.toFixed(3)} vs ${r.dynAero.bal0.toFixed(3)}`);
check(r.dynAero.stepHeave < -0.002 && r.dynAero.stepClAEff > r.dynAero.clA0 && Number.isFinite(r.dynAero.stepDown),
  `stepCar at 220 km/h should compress heave & raise clAEff: heave=${r.dynAero.stepHeave.toFixed(4)} clA=${r.dynAero.stepClAEff.toFixed(3)} vs ${r.dynAero.clA0.toFixed(3)}`);

// 3. Suspension travel / bottoming
check(!r.bottoming.stockAccBot && !r.bottoming.stockLapBot,
  `stock Golf GTI should not aero-bottom: acc=${r.bottoming.stockAccBot} lap=${r.bottoming.stockLapBot}`);
check(r.bottoming.adCapBot && Math.abs(r.bottoming.adCapF - 3600) < 1e-6,
  `aeroDownforce should cap at 3600 N and flag bottomed: F=${r.bottoming.adCapF} bot=${r.bottoming.adCapBot}`);
check(r.bottoming.accBot && r.bottoming.lapBot,
  `soft-spring high-aero build should flag aeroBottomed in accel & lap: acc=${r.bottoming.accBot} lap=${r.bottoming.lapBot}`);

// 4. Global ISA altitude & wind
check(Math.abs(r.env.p0 - 1.01325) < 1e-6 && Math.abs(r.env.rho0 - 1.20) < 1e-6,
  `sea-level anchor failed: p0=${r.env.p0} rho0=${r.env.rho0}`);
check(r.env.p25 > 0.72 && r.env.p25 < 0.77 && r.env.rho25 > 0.85 && r.env.rho25 < 0.92,
  `2500 m ISA values out of range: p25=${r.env.p25.toFixed(4)} rho25=${r.env.rho25.toFixed(4)}`);
check(r.env.naDrop > 0.18 && r.env.naDrop < 0.35 && r.env.tbDrop < r.env.naDrop * 0.7,
  `altitude power drop: NA=${(r.env.naDrop*100).toFixed(1)}% turbo=${(r.env.tbDrop*100).toFixed(1)}%`);
check(r.env.vHead < r.env.vCalm - 10 && r.env.vTail > r.env.vCalm + 5,
  `wind topSpeed: head=${r.env.vHead.toFixed(1)} calm=${r.env.vCalm.toFixed(1)} tail=${r.env.vTail.toFixed(1)}`);
check(r.env.lHead > r.env.lCalm + 0.5 && r.env.lTail < r.env.lCalm - 0.2,
  `wind WLTP L/100km: head=${r.env.lHead.toFixed(2)} calm=${r.env.lCalm.toFixed(2)} tail=${r.env.lTail.toFixed(2)}`);
check(r.env.lapHead > r.env.lapCalm + 0.3,
  `headwind lap should be slower: head=${r.env.lapHead.toFixed(2)} calm=${r.env.lapCalm.toFixed(2)}`);

// 5. Downforce-dependent rolling resistance
check(r.dfRoll.vDragDf < r.dfRoll.vDrag0 - 0.2,
  `dragLimitedV should drop with clA rolling resistance: ${r.dfRoll.vDragDf.toFixed(2)} vs ${r.dfRoll.vDrag0.toFixed(2)}`);
check(r.dfRoll.lCrrDf > r.dfRoll.lCrr0 + 0.05,
  `WLTP L/100km should rise with clA rolling resistance: ${r.dfRoll.lCrrDf.toFixed(3)} vs ${r.dfRoll.lCrr0.toFixed(3)}`);
check(r.dfRoll.accCrrDf < r.dfRoll.accCrr0 - 0.3,
  `accel freeSpeed should drop with clA rolling resistance: ${r.dfRoll.accCrrDf.toFixed(2)} vs ${r.dfRoll.accCrr0.toFixed(2)}`);
check(r.dfRoll.ecoFDf > r.dfRoll.ecoF0 + 1e-4,
  `ecoFuelKg should rise with clA rolling resistance: ${r.dfRoll.ecoFDf.toFixed(5)} vs ${r.dfRoll.ecoF0.toFixed(5)}`);

for (const e of errors) fails.push(e);

console.log('test275 B12 dynamic aero & ambient environment:');
console.log('  wing post-stall:', `CL 8°=${r.wing.cl8.toFixed(2)}, 22°=${r.wing.cl22.toFixed(2)}, 34°=${r.wing.cl34.toFixed(2)}; CdA=${r.wing.cd8.toFixed(3)}->${r.wing.cd22.toFixed(3)}->${r.wing.cd34.toFixed(3)}`);
console.log('  dynAero:', `heave=-40mm clScale=${r.dynAero.aLow.clScale.toFixed(3)}, bot=${r.dynAero.aBot.clScale.toFixed(3)}, diveBal=${r.dynAero.aDive.aeroBal.toFixed(3)} vs ${r.dynAero.bal0.toFixed(3)}`);
console.log('  bottoming:', `stock=${r.bottoming.stockAccBot}/${r.bottoming.stockLapBot}, softHighAero=${r.bottoming.accBot}/${r.bottoming.lapBot}`);
console.log('  env:', `2500m rho=${r.env.rho25.toFixed(3)}, NA -${(r.env.naDrop*100).toFixed(1)}%, turbo -${(r.env.tbDrop*100).toFixed(1)}%, vTop=${r.env.vHead.toFixed(1)}/${r.env.vCalm.toFixed(1)}/${r.env.vTail.toFixed(1)} km/h`);
console.log('  dfRoll:', `WLTP ${r.dfRoll.lCrr0.toFixed(3)}->${r.dfRoll.lCrrDf.toFixed(3)} L/100km, vFree ${r.dfRoll.accCrr0.toFixed(1)}->${r.dfRoll.accCrrDf.toFixed(1)} km/h`);

await browser.close();
if (fails.length) {
  console.error('FAILS:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS');
