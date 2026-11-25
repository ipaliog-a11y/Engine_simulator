// WHY THIS EXISTS: E3 Cylinder deactivation on the HEAD & VALVES card.
// What must hold:
//   · default is false (NONE), disabled on <4 cyl, odd cyl, CI diesel, 2-stroke, and rotary;
//   · when enabled on a 4+ even-cyl 4-stroke petrol engine, activates only when warm (>= 60 C),
//     within 1100-4000 rpm and light load (<= 0.75 bar abs), never at WOT or cold;
//   · reduces pumping loss and valvetrain/ring friction at light load, leaving dyno peak HP/TQ unchanged;
//   · improves WLTP (engineCycle) and Eco Run (ecoFuelKg) fuel consumption & CO2;
//   · adds actuator mass (0.5 kg/cyl) and build cost ($450 + $50/cyl);
//   · no console or page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const out = {};
  out.def = engine.cylDeact;
  out.defDis = document.getElementById('edCylDeact').disabled;

  // Ineligible types: 3-cyl, diesel, rotary
  const p3 = PRESETS.find(x => x.name.includes('1.0 Kei Turbo I3'));
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p3.engine));
  out.dis3 = document.getElementById('edCylDeact').disabled;

  document.getElementById('edType').value = 'diesel';
  document.getElementById('edCyl').value = '4';
  syncDesignEnable();
  out.disCI = document.getElementById('edCylDeact').disabled;

  document.getElementById('edType').value = 'rotary';
  syncDesignEnable();
  out.disRot = document.getElementById('edCylDeact').disabled;

  // 5.0 V8 NA Muscle baseline (cylDeact = false)
  const pv8 = PRESETS.find(x => x.name.includes('5.0 V8 NA'));
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pv8.engine));
  buildEngine();
  buildVehicle();
  out.v8Dis = document.getElementById('edCylDeact').disabled;
  out.hp0 = engine.score.peakHP;
  out.tq0 = engine.score.peakTQ;
  out.mass0 = engineMass();
  out.cost0 = engine.cost;
  const wltp0 = engineCycle(vehicle);
  out.wltp0 = wltp0.l100;
  out.co2_0 = wltp0.co2;
  state.coolant = 90; state.oil = 95;
  out.pmepFull = pumpingMEP(2000, 0.5, 1);
  out.fmepFull = mechFrictionMEP(2000, 0.5, 1);

  const road = Array.from({ length: 100 }, () => ({ ds3: 10, r: 1e6, kv: 0, sinT: 0, cosT: 1 }));
  const vProf = Array(100).fill(22);
  out.eco0 = ecoFuelKg(road, vProf);

  // Enable cylinder deactivation
  const sel = document.getElementById('edCylDeact');
  sel.value = 'yes';
  sel.dispatchEvent(new Event('change'));
  buildEngine();
  buildVehicle();
  out.hp1 = engine.score.peakHP;
  out.tq1 = engine.score.peakTQ;
  out.mass1 = engineMass();
  out.cost1 = engine.cost;
  const wltp1 = engineCycle(vehicle);
  out.wltp1 = wltp1.l100;
  out.co2_1 = wltp1.co2;
  out.eco1 = ecoFuelKg(road, vProf);

  // Operating window checks
  state.coolant = 90; state.oil = 95; state.nitrousActive = false;
  out.actCruise = cylDeactActive(2000, 0.5);
  out.actWot = cylDeactActive(2000, wotMapAt(2000));
  out.actLowRpm = cylDeactActive(900, 0.5);
  out.actHighRpm = cylDeactActive(4500, 0.5);
  out.pmepCda = pumpingMEP(2000, 0.5, 0.5);
  out.fmepCda = mechFrictionMEP(2000, 0.5, 0.5);
  state.coolant = 40;
  out.actCold = cylDeactActive(2000, 0.5);
  state.coolant = 90;

  return out;
});

if (r.def !== false) fails.push(`default cylDeact is ${r.def}, expected false`);
if (r.defDis) fails.push('#edCylDeact should be enabled on default 4-cyl petrol');
if (!r.dis3) fails.push('#edCylDeact should be disabled on 3-cyl');
if (!r.disCI) fails.push('#edCylDeact should be disabled on diesel');
if (!r.disRot) fails.push('#edCylDeact should be disabled on rotary');
if (r.v8Dis) fails.push('#edCylDeact should be enabled on 5.0 V8');

if (!r.actCruise) fails.push('cylDeactActive(2000, 0.5) should be true when warm');
if (r.actWot) fails.push('cylDeactActive should be false at WOT');
if (r.actLowRpm) fails.push('cylDeactActive should be false below 1100 rpm');
if (r.actHighRpm) fails.push('cylDeactActive should be false above 4000 rpm');
if (r.actCold) fails.push('cylDeactActive should be false when cold (40 C)');

if (!(r.pmepCda < r.pmepFull * 0.55)) fails.push(`CDA PMEP ${r.pmepCda.toFixed(3)} not ~half of ${r.pmepFull.toFixed(3)}`);
if (!(r.fmepCda < r.fmepFull)) fails.push(`CDA FMEP ${r.fmepCda.toFixed(3)} not < ${r.fmepFull.toFixed(3)}`);
if (r.hp1 !== r.hp0 || r.tq1 !== r.tq0) fails.push(`peak HP/TQ changed: ${r.hp0}/${r.tq0} -> ${r.hp1}/${r.tq1}`);
if (r.mass1 - r.mass0 !== 4) fails.push(`V8 mass delta ${r.mass1 - r.mass0} kg, expected 4`);
if (r.cost1 - r.cost0 !== 850) fails.push(`V8 cost delta $${r.cost1 - r.cost0}, expected $850`);

if (!(r.wltp1 < r.wltp0)) fails.push(`WLTP L/100km did not improve: ${r.wltp0.toFixed(2)} -> ${r.wltp1.toFixed(2)}`);
if (!(r.co2_1 < r.co2_0)) fails.push(`WLTP CO2 did not improve: ${r.co2_0.toFixed(1)} -> ${r.co2_1.toFixed(1)}`);
if (!(r.eco1 < r.eco0)) fails.push(`Eco fuel kg did not improve: ${r.eco0.toFixed(4)} -> ${r.eco1.toFixed(4)}`);
fails.push(...errors);

const wPct = ((r.wltp1 - r.wltp0) / r.wltp0 * 100).toFixed(1);
const ePct = ((r.eco1 - r.eco0) / r.eco0 * 100).toFixed(1);
console.log(`V8: peak ${r.hp0} hp / ${r.tq0} Nm (unchanged), WLTP ${r.wltp0.toFixed(2)}→${r.wltp1.toFixed(2)} L/100km (${wPct}%), Eco ${r.eco0.toFixed(3)}→${r.eco1.toFixed(3)} kg (${ePct}%)`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
