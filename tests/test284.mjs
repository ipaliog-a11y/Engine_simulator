// WHY THIS EXISTS (E9): physical catalyst brick thermal model and light-off curve (~250-300 °C T50).
// What must hold:
//   · cold catalyst at ambient (23 °C) has ~0 conversion (catLightOff < 0.01; tailpipe CO/HC/NOx ≈ decat);
//   · conversion ramps through ~250-300 °C (T50 = 275 °C) and reaches >0.99 when hot (450 °C);
//   · with autoThermal on, a cold brick heats from EGT & exhaust flow past light-off, and cools toward ambient when off;
//   · WLTP cold-start crosses light-off and has higher CO, HC, and NOx (g/km) in the cold phase than the hot phase;
//   · #statCat shows °C + COLD/LIT on ICE and is hidden on pure EVs;
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
  const out = {};
  const fc = FACTORY_CARS.find(c => c.name.includes('Golf GTI'));
  loadVehiclePreset(fc);
  engine.afrMode = 'fixed';
  engine.cat = 'stock'; engine.catConv = CAT.stock.conv;
  state.rpm = 2500; state.map = 0.55; state.coolant = 90; state.iat = 25; state.fuelCut = false;
  state.ve = computeVE(state.rpm, state.map);
  state.afr = engine.stoichAFR;

  // 1. Cold vs hot vs decat steady-state
  state.tCat = 23;
  computeEmissions();
  const cold = { co: state.emCO, hc: state.emHC, nox: state.emNOx, rating: state.emRating };
  state.tCat = 450;
  computeEmissions();
  const hot = { co: state.emCO, hc: state.emHC, nox: state.emNOx, rating: state.emRating };
  engine.cat = 'none'; engine.catConv = 0;
  computeEmissions();
  const decat = { co: state.emCO, hc: state.emHC, nox: state.emNOx };
  engine.cat = 'stock'; engine.catConv = CAT.stock.conv;

  out.curve = {
    lo23: catLightOff(23),
    lo250: catLightOff(250),
    lo275: catLightOff(275),
    lo300: catLightOff(300),
    lo450: catLightOff(450),
    t50: CAT_T50_C
  };
  out.steady = { cold, hot, decat };

  // 2. Live thermal heat-up and cool-down
  setAutoThermal(true);
  state.firing = true; state.throttle = 0.35; state.load = 0.5;
  state.coolant = 23; state.oil = 23; state.tCat = 23;
  state.rpm = 2200; state.map = 0.55; state.ve = computeVE(state.rpm, state.map);
  state.fuelFlowLph = (meteredFuelKgS(state.map) * 3600) / engine.fuelDensity;
  for (let i = 0; i < 120; i++) stepThermal(1);
  const heatedT = state.tCat;
  computeEmissions();
  const heatedRating = state.emRating;

  // Cool down with engine off
  state.firing = false; state.fuelFlowLph = 0;
  for (let i = 0; i < 600; i++) stepThermal(1);
  const cooledT = state.tCat;
  setAutoThermal(false);
  state.firing = true;

  out.thermal = { heatedT, heatedRating, cooledT };

  // 3. WLTP cold-start vs hot phase emissions
  loadVehiclePreset(fc);
  const cyc = engineCycle(vehicle);
  out.wltp = {
    lightOffS: cyc.lightOffS,
    tCatEnd: cyc.tCatEnd,
    l100: cyc.l100,
    cold: cyc.cold,
    hot: cyc.hot
  };

  // 4. UI tile #statCat
  setTab('engine');
  state.tCat = 100; updateUI();
  const uiCold = {
    visible: document.getElementById('statCat').style.display !== 'none',
    val: document.querySelector('#statCat .value').textContent,
    unit: document.querySelector('#statCat .unit').textContent,
    cls: document.getElementById('statCat').className
  };
  state.tCat = 450; updateUI();
  const uiHot = {
    val: document.querySelector('#statCat .value').textContent,
    unit: document.querySelector('#statCat .unit').textContent,
    cls: document.getElementById('statCat').className
  };
  const ev = typeof EV_VEHICLE_PRESETS !== 'undefined' && EV_VEHICLE_PRESETS[0];
  let uiEvHidden = null;
  if (ev) { loadVehiclePreset(ev); updateUI(); uiEvHidden = document.getElementById('statCat').style.display === 'none'; }
  out.ui = { uiCold, uiHot, uiEvHidden };

  return out;
});

if (!(r.curve.lo23 < 0.01)) fails.push(`cold catLightOff(23)=${r.curve.lo23}, expected <0.01`);
if (!(r.curve.t50 >= 250 && r.curve.t50 <= 300)) fails.push(`CAT_T50_C=${r.curve.t50} outside 250-300 °C`);
if (!(Math.abs(r.curve.lo275 - 0.5) < 0.01)) fails.push(`catLightOff(275)=${r.curve.lo275}, expected 0.5`);
if (!(r.curve.lo300 > r.curve.lo250 && r.curve.lo450 > 0.99)) fails.push(`light-off curve did not ramp cleanly: ${JSON.stringify(r.curve)}`);
if (!(Math.abs(r.steady.cold.co - r.steady.decat.co) / r.steady.decat.co < 0.02)) fails.push(`cold stock cat CO=${r.steady.cold.co} vs decat=${r.steady.decat.co}`);
if (!(r.steady.hot.co < r.steady.cold.co * 0.1 && r.steady.hot.nox < r.steady.cold.nox * 0.1)) fails.push(`hot cat did not convert >90%: cold=${JSON.stringify(r.steady.cold)} hot=${JSON.stringify(r.steady.hot)}`);

if (!(r.thermal.heatedT > r.curve.t50)) fails.push(`brick did not heat past light-off: ${r.thermal.heatedT}`);
if (!(r.thermal.cooledT < r.thermal.heatedT - 50)) fails.push(`brick did not cool when off: heated=${r.thermal.heatedT} cooled=${r.thermal.cooledT}`);

if (!(r.wltp.lightOffS > 5 && r.wltp.lightOffS < 589)) fails.push(`WLTP lightOffS=${r.wltp.lightOffS} not in cold phase`);
if (!(r.wltp.cold.coGkm > r.wltp.hot.coGkm && r.wltp.cold.hcGkm > r.wltp.hot.hcGkm && r.wltp.cold.noxGkm > r.wltp.hot.noxGkm)) {
  fails.push(`WLTP cold phase not higher than hot phase: cold=${JSON.stringify(r.wltp.cold)} hot=${JSON.stringify(r.wltp.hot)}`);
}

if (!r.ui.uiCold.visible || !/COLD/.test(r.ui.uiCold.unit) || !/warning/.test(r.ui.uiCold.cls)) fails.push(`#statCat cold UI wrong: ${JSON.stringify(r.ui.uiCold)}`);
if (!/LIT/.test(r.ui.uiHot.unit) || /warning/.test(r.ui.uiHot.cls)) fails.push(`#statCat hot UI wrong: ${JSON.stringify(r.ui.uiHot)}`);
if (r.ui.uiEvHidden !== true) fails.push(`#statCat not hidden on EV: ${r.ui.uiEvHidden}`);
fails.push(...errors);

console.log(`light-off curve: 23C=${r.curve.lo23.toFixed(5)} 250C=${r.curve.lo250.toFixed(2)} 275C=${r.curve.lo275.toFixed(2)} 300C=${r.curve.lo300.toFixed(2)} 450C=${r.curve.lo450.toFixed(4)}`);
console.log(`thermal: 23C -> ${r.thermal.heatedT.toFixed(1)}C (120s) -> ${r.thermal.cooledT.toFixed(1)}C (300s off)`);
console.log(`WLTP: light-off @ ${r.wltp.lightOffS}s, cold CO=${r.wltp.cold.coGkm.toFixed(2)} HC=${r.wltp.cold.hcGkm.toFixed(2)} NOx=${r.wltp.cold.noxGkm.toFixed(2)} vs hot CO=${r.wltp.hot.coGkm.toFixed(2)} HC=${r.wltp.hot.hcGkm.toFixed(2)} NOx=${r.wltp.hot.noxGkm.toFixed(2)} g/km`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
