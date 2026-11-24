// WHY THIS EXISTS (B6): wheel-lift vertical-load conservation, solid-axle roll center on low-CG builds,
// extreme-downforce corner ceiling, and eco-run active-gear meff + brakeCap downforce/longitudinal grip.
// What must hold:
//   · axleLatCap conserves vertical load on wheel lift (o + inr === Nax for |d| > Nax/2);
//   · simulateBraking (stoppie) and simulateAccelRun (RWD wheelie) never create phantom normal load > Wtot;
//   · solid-axle roll center stays below CG when rTire > cg so rollGrad > 0, while stock solid-axle cars keep rc = rTire;
//   · extreme-downforce featherweight builds are capped physically by tyre load rating in corners (< VMAX) in both
//     racing-line-lap.js and eco-run.js, while straights still reach VMAX;
//   · ecoCostTable and ecoFuelKg use active-gear rotational inertia meff (not 1st gear ratios[0] at highway speeds);
//   · ecoMinTime brakeCap includes aero downforce (N/m) and TYRE_MU_X and omits straight-line dCorner diff scrub.
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
  const loadCar = name => {
    const c = FACTORY_CARS.find(x => x.name.includes(name));
    if (!c) throw new Error('car not found: ' + name);
    loadVehiclePreset(c);
  };
  const out = {};

  // 1a. axleLatCap vertical-load conservation on wheel lift
  loadCar('Golf GTI');
  const Nax = 8000, fzRef = vehicle.FzRef;
  const expectCap = tyreMu(Nax, fzRef) * Nax;
  out.axleLiftPos = { got: axleLatCap(Nax, 6000, fzRef, 0), exp: expectCap };
  out.axleLiftNeg = { got: axleLatCap(Nax, -6000, fzRef, 0), exp: expectCap };

  // 1b. simulateBraking stoppie load conservation (Nf <= Wtot)
  const v0 = 100 / 3.6;
  vehicle.cg = 1.2; vehicle.wb = 1.8; vehicle.fWt = 0.70; vehicle.clA = 0;
  vehicle.brakeDecelCap = 30; vehicle.aids = { abs: true, tc: true, esc: true };
  vehicle.muRef = TIRE_TYPE.slick.mu;
  const brk = simulateBraking(v0);
  const maxTyreA = tyreMuX(vehicle.mass * G / 2, vehicle.FzRefF) * G;
  const maxAeroA = 0.5 * AIR_RHO * vehicle.cdA * v0 * v0 / vehicle.mass;
  const minPhysDist = (v0 * v0) / (2 * (maxTyreA + maxAeroA));
  out.stoppie = { dist: brk.dist, minPhysDist };

  // 1c. simulateAccel RWD wheelie load conservation (drivenN <= Wtot)
  loadCar('Corvette Z06 (C8');
  vehicle.drive = 'rwd'; vehicle.cg = 1.4; vehicle.wb = 1.6; vehicle.fWt = 0.45;
  vehicle.clA = 0; vehicle.df = DIFF.spool; vehicle.diff = 'spool';
  vehicle.muRef = TIRE_TYPE.slick.mu;
  const acc = simulateAccel();
  const maxAccBound = tyreMuX(vehicle.mass * G / 2) * G;
  const minPhysT100 = (100 / 3.6) / maxAccBound;
  out.wheelie = { t100: acc.t100, minPhysT100 };

  // 2. Solid-axle roll center on low-CG build vs stock AE86
  loadCar('AE86');
  out.ae86 = { rcR: vehicle.rcR, rTire: vehicle.rTire, rollGrad: vehicle.rollGrad };
  document.getElementById('vhGeoF').value = 'solid';
  document.getElementById('vhGeoR').value = 'solid';
  document.getElementById('vhWheel').value = '20';
  document.getElementById('vhTireW').value = '265';
  document.getElementById('vhTireA').value = '45';
  document.getElementById('vhDims').value = 'design';
  document.getElementById('vhCg').value = '0.30';
  buildVehicle();
  out.lowCgSolid = { rTire: vehicle.rTire, cg: vehicle.cg, rcF: vehicle.rcF, rcR: vehicle.rcR, rollGrad: vehicle.rollGrad };

  // 3. Extreme-downforce corner ceiling (featherweight + huge clA)
  loadCar('Golf GTI');
  vehicle.governor = 0;
  vehicle.mass = 450; vehicle.clA = 10.0; vehicle.muRef = TIRE_TYPE.slick.mu;
  vehicle.mu = tyreMu(vehicle.mass * G / 4);
  const mkPt = (r, ds3 = 5) => ({ r, ds3, cosT: 1, sinT: 0, kv: 0, kw: 0, kws: 0, turn: 1 });
  const synLine = [];
  for (let i = 0; i < 20; i++) synLine.push(mkPt(1e6));
  for (let i = 0; i < 20; i++) synLine.push(mkPt(80));
  const ecoAero = ecoMinTime(synLine, 0);
  const lapProbe = simulateLapRun('tsukuba', { quick: true, probe: true, line: buildTrack('tsukuba').centre });
  out.aeroCeil = {
    ecoStraightVC: ecoAero.vC[5],
    ecoCornerVC: ecoAero.vC[25],
    lapStraightVC: lapProbe.ceilAt(mkPt(1e6)),
    lapCornerVC: lapProbe.ceilAt(mkPt(80))
  };

  // 4a. Eco-run active-gear meff in ecoCostTable and ecoFuelKg
  loadCar('Golf GTI');
  const T = ecoCostTable(80, 0.5);
  const flatAcc = [], vAcc = [];
  for (let i = 0; i <= 40; i++) {
    flatAcc.push(mkPt(1e6, 10));
    vAcc.push(25 + 5 * (i / 40)); // 25 -> 30 m/s (highway acceleration)
  }
  const origIe = engine.inertia;
  engine.inertia = 0.2;
  const fLowIe = ecoFuelKg(flatAcc, vAcc);
  engine.inertia = 1.0;
  const fHighIe = ecoFuelKg(flatAcc, vAcc);
  engine.inertia = origIe;
  out.ecoMeff = {
    isTyped: ArrayBuffer.isView(T.meff),
    meff0: T.meff[0],
    meff30ms: T.meff[120], // j=120 -> vm = 120 * 0.25 = 30 m/s
    fLowIe,
    fHighIe,
    relDiff: (fHighIe - fLowIe) / Math.max(1e-9, fLowIe)
  };

  // 4b. ecoMinTime brakeCap downforce + TYRE_MU_X + no straight-line dCorner scrub
  loadCar('Golf GTI');
  vehicle.brakeDecelCap = 35; // tyre-limited
  vehicle.cdA = 0; // isolate tyre braking decel from aero drag
  const brkLine = [];
  for (let i = 0; i < 120; i++) brkLine.push(mkPt(1e6, 5)); // 600 m straight so car reaches high speed before braking
  brkLine.push(mkPt(8, 5)); // tight corner at end forces pure straight-line braking at indices ~110..119
  const decelAt = (res, idx) => (res.v[idx] * res.v[idx] - res.v[idx + 1] * res.v[idx + 1]) / (2 * 5);
  vehicle.clA = 0; vehicle.df = DIFF.open;
  const bNoAeroOpen = ecoMinTime(brkLine, 0);
  vehicle.clA = 0; vehicle.df = DIFF.spool;
  const bNoAeroSpool = ecoMinTime(brkLine, 0);
  vehicle.clA = 4.0; vehicle.df = DIFF.open;
  const bHiAero = ecoMinTime(brkLine, 0);
  out.ecoBrake = {
    aNoAeroOpen: decelAt(bNoAeroOpen, 115),
    aNoAeroSpool: decelAt(bNoAeroSpool, 115),
    aHiAero: decelAt(bHiAero, 115),
    aStaticLat: vehicle.mu * G
  };

  return out;
});

// Assertions
if (Math.abs(r.axleLiftPos.got - r.axleLiftPos.exp) > 1e-6)
  fails.push(`axleLatCap(+lift) expected ${r.axleLiftPos.exp.toFixed(2)}, got ${r.axleLiftPos.got.toFixed(2)}`);
if (Math.abs(r.axleLiftNeg.got - r.axleLiftNeg.exp) > 1e-6)
  fails.push(`axleLatCap(-lift) expected ${r.axleLiftNeg.exp.toFixed(2)}, got ${r.axleLiftNeg.got.toFixed(2)}`);
if (!(r.stoppie.dist >= r.stoppie.minPhysDist * 0.99))
  fails.push(`simulateBraking stoppie dist ${r.stoppie.dist.toFixed(2)}m < physical bound ${r.stoppie.minPhysDist.toFixed(2)}m`);
if (!(r.wheelie.t100 >= r.wheelie.minPhysT100 * 0.99))
  fails.push(`simulateAccel wheelie t100 ${r.wheelie.t100.toFixed(3)}s < physical bound ${r.wheelie.minPhysT100.toFixed(3)}s`);

if (Math.abs(r.ae86.rcR - r.ae86.rTire) > 1e-6)
  fails.push(`AE86 stock solid-axle rcR (${r.ae86.rcR}) should still equal rTire (${r.ae86.rTire})`);
if (!(r.lowCgSolid.rTire > r.lowCgSolid.cg))
  fails.push(`low-CG test setup failed: rTire=${r.lowCgSolid.rTire} <= cg=${r.lowCgSolid.cg}`);
if (!(r.lowCgSolid.rcF < r.lowCgSolid.cg && r.lowCgSolid.rcR < r.lowCgSolid.cg && r.lowCgSolid.rollGrad > 0.1))
  fails.push(`low-CG solid-axle roll collapsed: ${JSON.stringify(r.lowCgSolid)}`);

if (Math.abs(r.aeroCeil.ecoStraightVC - 140) > 1e-3 || Math.abs(r.aeroCeil.lapStraightVC - 140) > 1e-3)
  fails.push(`featherweight straight vC expected 140, got eco=${r.aeroCeil.ecoStraightVC}, lap=${r.aeroCeil.lapStraightVC}`);
if (!(r.aeroCeil.ecoCornerVC > 20 && r.aeroCeil.ecoCornerVC < 120))
  fails.push(`eco featherweight r=80m corner vC should be physically capped < 120 m/s, got ${r.aeroCeil.ecoCornerVC}`);
if (!(r.aeroCeil.lapCornerVC > 20 && r.aeroCeil.lapCornerVC < 120))
  fails.push(`lap featherweight r=80m corner vC should be physically capped < 120 m/s, got ${r.aeroCeil.lapCornerVC}`);

if (!r.ecoMeff.isTyped || !(r.ecoMeff.meff30ms < r.ecoMeff.meff0 - 50))
  fails.push(`ecoCostTable meff should drop in top gear vs 1st: ${JSON.stringify(r.ecoMeff)}`);
if (!(r.ecoMeff.relDiff < 0.15))
  fails.push(`ecoFuelKg highway fuel too sensitive to engine.inertia (still using 1st gear?): relDiff=${r.ecoMeff.relDiff.toFixed(3)}`);
if (Math.abs(r.ecoBrake.aNoAeroOpen - r.ecoBrake.aNoAeroSpool) > 1e-4)
  fails.push(`ecoMinTime straight braking decel should not depend on diff dCorner: open=${r.ecoBrake.aNoAeroOpen}, spool=${r.ecoBrake.aNoAeroSpool}`);
if (!(r.ecoBrake.aNoAeroOpen > r.ecoBrake.aStaticLat * 1.10))
  fails.push(`ecoMinTime brakeCap should include TYRE_MU_X (1.15x lateral): got ${r.ecoBrake.aNoAeroOpen.toFixed(2)} vs lat ${r.ecoBrake.aStaticLat.toFixed(2)}`);
if (!(r.ecoBrake.aHiAero > r.ecoBrake.aNoAeroOpen + 0.5))
  fails.push(`ecoMinTime brakeCap should brake harder with downforce: clA=0 -> ${r.ecoBrake.aNoAeroOpen.toFixed(2)}, clA=4 -> ${r.ecoBrake.aHiAero.toFixed(2)}`);

if (errors.length) fails.push(...errors);
await browser.close();
console.log(JSON.stringify(r, null, 2));
if (fails.length) { console.error('FAIL:\n' + fails.join('\n')); process.exit(1); }
console.log('PASS test269');
