// Build real cars from their REAL engine geometry and compare against published figures.
//
// This is a different question from test41. That one scales each car's torque curve until peak
// power matches the real car, then measures 0-100 — so it tests traction, gearing and weight with
// the engine model taken out of the loop. Here nothing is matched: bore, stroke, compression,
// redline, induction and boost go in, and whatever power the model produces is what the car gets.
// So it measures the engine model and the vehicle model together, end to end.
//
// Three numbers per car:
//   POWER   modelled peak hp vs the manufacturer's rating        — the engine model alone
//   0-100   modelled, on the model's own power                   — the whole chain
//   0-100*  modelled, with the torque curve scaled to real power — the vehicle model alone
// The third is there so a bad 0-100 can be attributed: if 0-100* is good and 0-100 is not, the
// engine model is at fault, and vice versa.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];

// Manufacturer figures. Geometry is from published engine specs; performance is the maker's own
// claim or the commonly-quoted road-test figure. Where a car was speed-limited the limiter value is
// given and marked, because the model has no governor and will sail past it — those are excluded
// from the top-speed comparison rather than counted as a miss.
//
// ANCHOR QUALITY, since a test is only as good as its reference. Power, torque and geometry here
// are factory ratings and are solid. Two caveats carried deliberately rather than smoothed over:
// the Supra RZ is quoted at its EXPORT rating (320 hp / 427 Nm) because the JDM 280 PS figure is
// the gentlemen's-agreement number and not what the engine made; and the Alto Works 0-100 is NOT a
// factory figure at all — road tests cluster 10.5-11.5 s, so 11.0 is a midpoint and should not be
// treated as precise. Nothing in the model should ever be tuned to make a specific car here land.
const CARS = [
  { name: 'Mazda MX-5 1.6 (NA)', year: 1989,
    eng: { type: 'petrol4', cylinders: 4, bore_mm: 78.0, stroke_mm: 83.6, compression: 9.4,
           layout: 'inline', redline: 7200, intake: 'na', valves: 4, cam: 'stock',
           injector: 'port', octane: 95, intakeSys: 'efi', exhaust: 'stock', airFilter: 'stock' },
    car: { chassis: 'roadster', kg: 955, drive: 'rwd', tire: 'eco', gbx: 'manual', gears: 5, diff: 'open' },
    real: { hp: 115, tq: 136, t100: 8.8, top: 195 } },

  { name: 'Honda S2000 AP1', year: 2000,
    eng: { type: 'petrol4', cylinders: 4, bore_mm: 87.0, stroke_mm: 84.0, compression: 11.0,
           layout: 'inline', redline: 8900, intake: 'na', valves: 4, cam: 'race',
           injector: 'port', octane: 98, intakeSys: 'efi', exhaust: 'sport', airFilter: 'perf' },
    car: { chassis: 'roadster', kg: 1250, drive: 'rwd', tire: 'sport', gbx: 'manual', gears: 6, diff: 'clsd' },
    real: { hp: 240, tq: 208, t100: 6.2, top: 240 } },

  { name: 'BMW M3 E46 (S54)', year: 2000,
    eng: { type: 'petrol4', cylinders: 6, bore_mm: 87.0, stroke_mm: 91.0, compression: 11.5,
           layout: 'inline', redline: 8000, intake: 'na', valves: 4, cam: 'race',
           injector: 'port', octane: 98, intakeSys: 'itb', exhaust: 'sport', airFilter: 'perf' },
    car: { chassis: 'coupe', kg: 1495, drive: 'rwd', tire: 'sport', gbx: 'manual', gears: 6, diff: 'clsd' },
    real: { hp: 343, tq: 365, t100: 5.2, top: 250, limited: true } },

  { name: 'Chevrolet Corvette C6 (LS3)', year: 2008,
    eng: { type: 'petrol4', cylinders: 8, bore_mm: 103.25, stroke_mm: 92.0, compression: 10.7,
           layout: 'v', redline: 6600, intake: 'na', valves: 2, cam: 'sport',
           injector: 'port', octane: 98, intakeSys: 'efi', exhaust: 'sport', airFilter: 'perf' },
    car: { chassis: 'coupe', kg: 1450, drive: 'rwd', tire: 'sport', gbx: 'manual', gears: 6, diff: 'clsd' },
    real: { hp: 430, tq: 575, t100: 4.2, top: 306 } },

  { name: 'VW Golf GTI Mk7', year: 2013,
    eng: { type: 'petrol4', cylinders: 4, bore_mm: 82.5, stroke_mm: 92.8, compression: 9.6,
           layout: 'inline', redline: 6500, intake: 'turbo', boost_bar: 1.1, turboSize: 'small',
           valves: 4, cam: 'stock', injector: 'direct', octane: 98, intercooler: 'large',
           intakeSys: 'efi', exhaust: 'stock', airFilter: 'stock' },
    car: { chassis: 'hatch', kg: 1351, drive: 'fwd', tire: 'sport', gbx: 'manual', gears: 6, diff: 'open' },
    real: { hp: 220, tq: 350, t100: 6.5, top: 246, limited: true } },

  { name: 'Toyota Supra RZ (2JZ-GTE)', year: 1993,
    eng: { type: 'petrol4', cylinders: 6, bore_mm: 86.0, stroke_mm: 86.0, compression: 8.5,
           layout: 'inline', redline: 6800, intake: 'turbo', boost_bar: 0.75, turboSize: 'medium',
           turboConfig: 'sequential', valves: 4, cam: 'sport', injector: 'port', octane: 98,
           intercooler: 'large', intakeSys: 'efi', exhaust: 'sport', airFilter: 'perf' },
    car: { chassis: 'coupe', kg: 1570, drive: 'rwd', tire: 'sport', gbx: 'manual', gears: 6, diff: 'clsd' },
    real: { hp: 320, tq: 427, t100: 4.9, top: 250, limited: true } },

  { name: 'VW Golf 2.0 TDI 150', year: 2013,
    eng: { type: 'diesel', cylinders: 4, bore_mm: 81.0, stroke_mm: 95.5, compression: 16.2,
           // The EA288 runs a VARIABLE-GEOMETRY turbine (VW call it VTG), which is factory
           // hardware, not a knob to turn: it is why this engine holds 320 Nm from 1750 rpm.
           layout: 'inline', redline: 4800, intake: 'turbo', boost_bar: 1.3, turboSize: 'small',
           vgt: true,
           valves: 4, cam: 'stock', injector: 'direct', fuel: 'diesel', intercooler: 'large',
           intakeSys: 'efi', exhaust: 'stock', airFilter: 'stock' },
    car: { chassis: 'hatch', kg: 1375, drive: 'fwd', tire: 'eco', gbx: 'manual', gears: 6, diff: 'open' },
    real: { hp: 150, tq: 320, t100: 8.6, top: 216 } },

  { name: 'Suzuki Alto Works (K6A)', year: 2015,
    eng: { type: 'petrol4', cylinders: 3, bore_mm: 68.0, stroke_mm: 60.4, compression: 8.9,
           layout: 'inline', redline: 7200, intake: 'turbo', boost_bar: 0.75, turboSize: 'small',
           valves: 4, cam: 'stock', injector: 'port', octane: 95, intercooler: 'small',
           intakeSys: 'efi', exhaust: 'stock', airFilter: 'stock' },
    car: { chassis: 'kei', kg: 720, drive: 'fwd', tire: 'eco', gbx: 'manual', gears: 5, diff: 'open' },
    real: { hp: 64, tq: 100, t100: 11.0, top: 140, limited: true } },
];

const out = await page.evaluate((CARS) => CARS.map(C => {
  // Each car is built from geometry alone — no power target is fed in anywhere.
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, C.eng));
  buildEngine();
  const s = engine.score;
  const modHp = s.peakHP, modTq = s.peakTQ, disp = engine.displacement_L;

  applyChassisFit(C.car.chassis);
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  set('vhDrive', C.car.drive); set('vhTire', C.car.tire); set('vhGearbox', C.car.gbx);
  set('vhGears', C.car.gears); set('vhDiff', C.car.diff);
  buildVehicle();
  vehicle.mass = C.car.kg;
  vehicle.powerToWeight = modHp / (C.car.kg / 1000);

  const own = simulateAccel();

  // Same car again, but with the torque curve scaled so peak power equals the real rating.
  const realCurve = buildTorqueCurve, realGrid = buildTorqueGrid;
  const k = C.real.hp / Math.max(1, modHp);
  window.buildTorqueCurve = () => realCurve().map(p => ({ rpm: p.rpm, tq: p.tq * k }));
  window.buildTorqueGrid = () => { const g = realGrid(); return { ...g, tq: g.tq.map(r => r.map(t => t * k)) }; };
  const matched = simulateAccel();
  window.buildTorqueCurve = realCurve; window.buildTorqueGrid = realGrid;

  return { name: C.name, real: C.real, disp: +disp.toFixed(2),
    modHp: Math.round(modHp), modTq: Math.round(modTq), hpRpm: s.peakHPrpm, tqRpm: s.peakTQrpm,
    t100: own.t100, top: Math.round(own.topSpeed),
    t100m: matched.t100, topm: Math.round(matched.topSpeed) };
}), CARS);
await browser.close();

const pc = (m, r) => ((m / r - 1) * 100);
const f = (v, w) => String(v).padStart(w);
const sg = v => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';

console.log('=== cars built from their real engine geometry, nothing matched ===\n');
console.log('car                             disp    hp real/model        tq real/model      0-100 real/model      top real/model');
for (const r of out) {
  console.log(`${r.name.padEnd(30)} ${f(r.disp.toFixed(1), 4)}   ${f(r.real.hp, 4)}/${f(r.modHp, 4)} ${sg(pc(r.modHp, r.real.hp)).padStart(6)}   ` +
    `${f(r.real.tq, 4)}/${f(r.modTq, 4)} ${sg(pc(r.modTq, r.real.tq)).padStart(6)}   ` +
    `${f(r.real.t100.toFixed(1), 5)}/${f(r.t100 === null ? 'never' : r.t100.toFixed(2), 6)} ${r.t100 ? sg(pc(r.t100, r.real.t100)).padStart(6) : '      '}   ` +
    `${f(r.real.top, 4)}/${f(r.top, 4)} ${sg(pc(r.top, r.real.top)).padStart(6)}${r.real.limited ? ' (ltd)' : ''}`);
}

const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
console.log(`\n  RMS power error      ${rms(out.map(r => pc(r.modHp, r.real.hp))).toFixed(1)}%`);
console.log(`  RMS torque error     ${rms(out.map(r => pc(r.modTq, r.real.tq))).toFixed(1)}%`);
console.log(`  RMS 0-100 error      ${rms(out.filter(r => r.t100).map(r => pc(r.t100, r.real.t100))).toFixed(1)}%   (on the model's own power)`);
console.log(`  RMS 0-100 error      ${rms(out.filter(r => r.t100m).map(r => pc(r.t100m, r.real.t100))).toFixed(1)}%   (with power matched to real — the vehicle model alone)`);

console.log('\n--- attribution: engine model vs vehicle model ---');
console.log('car                             0-100 own    0-100 power-matched    hp error');
for (const r of out)
  console.log(`${r.name.padEnd(30)} ${f(r.t100 === null ? 'never' : r.t100.toFixed(2), 7)} ${sg(pc(r.t100, r.real.t100)).padStart(6)}    ` +
    `${f(r.t100m === null ? 'never' : r.t100m.toFixed(2), 7)} ${sg(pc(r.t100m, r.real.t100)).padStart(6)}        ${sg(pc(r.modHp, r.real.hp)).padStart(6)}`);

// ==================================================================== assertions
// Budgets are set at what the model does TODAY so it cannot drift worse, and each one names the
// mechanism that has to land for the budget to come down. Widening a budget to make this pass
// would defeat the only test in the suite that checks the engine model against reality at all.

for (const r of out) {
  if (!(r.modHp > 0)) fails.push(`${r.name}: builds but makes no power`);
  if (r.t100 === null) fails.push(`${r.name}: cannot reach 100 km/h`);
}

// ---- the engine model ----------------------------------------------------------------------
// Every badly under-powered car is a high-specific-output engine: the S2000 makes 120 hp/L, the
// S54 106 hp/L, the 2JZ 107 hp/L on boost. Everything more modest — MX-5, LS3, GTI, TDI, Alto —
// lands inside 8%. Two separate defects compound to produce that, and it is worth keeping them
// apart because they have different fixes.
//
// 1. THE TORQUE PEAK SITS TOO LOW, on every NA engine measured, by 600 to 3000 rpm:
//      MX-5   real 5500  model 3500        S54   real 4900  model 4300
//      S2000  real 7500  model 4500        LS3   real 4600  model 3400
//    That is vePeakRpm, still asserted as redline*0.60 + (boreStroke-1)*1500 — a formula in which
//    nothing about how the engine actually breathes appears. Item 4 in the v1.0 queue, and this is
//    the sharpest measurement of why it matters. Note the POWER peak lands close (S2000 8200 model
//    vs 8300 real), because hp = tq*rpm pushes the power peak up the range regardless; looking only
//    at where power peaks hides this entirely.
//
// 2. PEAK BMEP DOES NOT REACH WHAT A WELL-BREATHING NA ENGINE MAKES. At their real compression
//    ratios the two high-output engines come out well short, while the two modest ones are right:
//      S2000  13.09 bar real  10.82 model  -17%      MX-5  10.70 real  11.40 model  +7%
//      S54    14.13 bar real  11.50 model  -19%      LS3   11.73 real  11.85 model  +1%
//    So the model tops out near 11.5-11.9 bar for an NA engine at CR 11-11.5, where the real
//    articles reach 13-14. It CAN produce 16 bar — the ITB screamer preset does — but only at CR
//    12.5 and with VE pinned against the 1.2 clamp, which says the model leans on compression
//    ratio where the real engines lean on breathing. Stated as the measurement, not as a diagnosis:
//    which of VE, IMEP_K or the valve/port model is responsible has not been established here.
const POWER_RMS_BUDGET = 20;     // currently 15.8
const POWER_WORST_CAP = 35;      // currently 30 (S2000)
const POWER_OVER_15_BUDGET = 3;  // S2000, M3, Supra — all high-rpm
const pErr = out.map(r => pc(r.modHp, r.real.hp));
const pRms = rms(pErr);
const bigP = out.filter(r => Math.abs(pc(r.modHp, r.real.hp)) > 15);
console.log(`\n  power: RMS ${pRms.toFixed(1)}% (budget ${POWER_RMS_BUDGET}) · over 15%: ${bigP.length} (budget ${POWER_OVER_15_BUDGET})`);
for (const r of bigP) console.log(`    ${r.name.padEnd(30)} ${sg(pc(r.modHp, r.real.hp))} — peak power at ${r.hpRpm} rpm`);
if (pRms > POWER_RMS_BUDGET) fails.push(`power RMS ${pRms.toFixed(1)}% over budget ${POWER_RMS_BUDGET}%`);
if (bigP.length > POWER_OVER_15_BUDGET) fails.push(`cars over 15% power error spread to ${bigP.length} (budget ${POWER_OVER_15_BUDGET})`);
for (const r of out)
  if (Math.abs(pc(r.modHp, r.real.hp)) > POWER_WORST_CAP)
    fails.push(`${r.name}: power off by ${sg(pc(r.modHp, r.real.hp))} (cap ${POWER_WORST_CAP}%)`);

// ---- the whole car -------------------------------------------------------------------------
// Ratcheted at build 81. Every car used to upshift only at the redline; shifting at the wheel-torque
// crossover took the RMS from 24.4% to 10.2% and the TDI from +60% to +5%. Worst is now the Supra,
// whose residual is an ENGINE error (-23% power) — power-matched it lands at +5%.
const T100_RMS_BUDGET = 13;      // currently 10.2
const T100_WORST_CAP = 26;       // currently 21 (the Supra)
const tRms = rms(out.filter(r => r.t100).map(r => pc(r.t100, r.real.t100)));
if (tRms > T100_RMS_BUDGET) fails.push(`0-100 RMS ${tRms.toFixed(1)}% over budget ${T100_RMS_BUDGET}%`);
for (const r of out)
  if (r.t100 && Math.abs(pc(r.t100, r.real.t100)) > T100_WORST_CAP)
    fails.push(`${r.name}: 0-100 off by ${sg(pc(r.t100, r.real.t100))} (cap ${T100_WORST_CAP}%)`);

// ---- attribution ---------------------------------------------------------------------------
// The structural assertion, and the most useful one here: a car whose engine makes very nearly the
// right power has no excuse for a badly wrong 0-100. For a long time exactly one did: the 2.0 TDI,
// power within 1% and 0-100 55-60% slow. The first suspect was gearing, read off a slider; deriving
// the final drive (build 74) fixed its top speed, -24% to -1%, and left the 0-100 where it was. The
// real cause was the shift rule: every car upshifted only at the redline, and this diesel's torque
// has collapsed long before its 4800 rpm limiter. Shifting at the wheel-torque crossover (build 81)
// took it from 13.75 s to 9.03 s against a real 8.6. None left, so the budget is now zero.
const MISATTRIBUTED_BUDGET = 0;   // was 1 (the TDI) until the shift rule was fixed
const mis = out.filter(r => r.t100 && Math.abs(pc(r.modHp, r.real.hp)) < 10 && Math.abs(pc(r.t100, r.real.t100)) > 25);
console.log(`\n  right power but wrong car: ${mis.length} (budget ${MISATTRIBUTED_BUDGET})`);
for (const r of mis)
  console.log(`    ${r.name.padEnd(30)} power ${sg(pc(r.modHp, r.real.hp))} but 0-100 ${sg(pc(r.t100, r.real.t100))}, top ${sg(pc(r.top, r.real.top))}`);
if (mis.length > MISATTRIBUTED_BUDGET)
  fails.push(`cars with right power and wrong performance spread to ${mis.length} (budget ${MISATTRIBUTED_BUDGET})`);

// ---- top speed, excluding the governed cars --------------------------------------------------
const TOP_RMS_BUDGET = 20;       // currently 3.5 since the derived final drive
const TOP_WORST_CAP = 30;
const free = out.filter(r => !r.real.limited);
const topRms = rms(free.map(r => pc(r.top, r.real.top)));
console.log(`\n  top speed (ungoverned cars only): RMS ${topRms.toFixed(1)}% (budget ${TOP_RMS_BUDGET})`);
for (const r of free) console.log(`    ${r.name.padEnd(30)} ${r.real.top} real / ${r.top} model  ${sg(pc(r.top, r.real.top))}`);
if (topRms > TOP_RMS_BUDGET) fails.push(`top-speed RMS ${topRms.toFixed(1)}% over budget ${TOP_RMS_BUDGET}%`);
for (const r of free)
  if (Math.abs(pc(r.top, r.real.top)) > TOP_WORST_CAP)
    fails.push(`${r.name}: top speed off by ${sg(pc(r.top, r.real.top))} (cap ${TOP_WORST_CAP}%)`);
// A governed car must at least REACH its limiter, or the model is slower than the real car was
// even before the governor got involved.
for (const r of out)
  if (r.real.limited && r.top < r.real.top * 0.85)
    fails.push(`${r.name}: tops out at ${r.top} km/h, below its ${r.real.top} km/h governor`);

console.log('\nERRORS: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'));
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
