// WHY THIS EXISTS (E13): Piston ring blow-by, crankcase pressure, oil consumption & ring sealing options.
// What must hold:
//   · Healthy stock engine has blow-by ~0.5–1.0% of intake air flow at rated speed/WOT,
//     negative crankcase pressure under idle vacuum, mild positive pressure at WOT, and
//     blowbyTrappedFactor === 1.0 (healthy/stock power & torque unchanged);
//   · Worn engine (engineHealth < 1) has higher blow-by, higher crankcase pressure, higher oil
//     consumption, reduced trapped-mass / torque, and a diagnoseEngine() blowby finding;
//   · Ring options: gapless rings cut blow-by & oil use vs stock; low-tension rings cut
//     mechFrictionMEP vs stock at higher blow-by;
//   · LIVE telemetry #statBlowby is visible on combustion engines and hidden on electric; no page errors.
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
  const load = (name, over) => {
    const pr = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, over || {}));
    syncDesignEnable();
    buildEngine();
  };
  const out = {};

  // 1. Healthy stock 1.6L NA I4
  load('1.6 Sport NA I4');
  const rpm = 6000, mapWot = 1.0;
  const calHealthy = calcAtRpm(rpm, mapWot);
  const bbHealthy = blowbyAt(rpm, mapWot, calHealthy.bmep, 1.0, engine);
  const airHealthy = blowbyIntakeKgS(rpm, mapWot, calHealthy.ve, engine);
  const trapHealthy = blowbyTrappedFactor(rpm, mapWot, calHealthy.ve, calHealthy.bmep);
  const bbIdle = blowbyAt(900, 0.35, 1.5, 1.0, engine);
  state.rpm = 6000; state.throttle = 1.0; state.firing = true;
  updateEnginePhysics();
  updateUI();
  const statVis = document.getElementById('statBlowby').style.display !== 'none';
  const statText = document.querySelector('#statBlowby .value').textContent;
  out.healthy = {
    pct: (bbHealthy.kgS / airHealthy) * 100,
    lpm: bbHealthy.lpm,
    ccWot: bbHealthy.crankcaseKpa,
    ccIdle: bbIdle.crankcaseKpa,
    oilMlh: bbHealthy.oilMlh,
    trapHealthy,
    tqHealthy: calHealthy.torque,
    statVis,
    statText
  };

  // 2. Worn engine (engineHealth = 0.4)
  state.engineHealth = 0.4;
  const calWorn = calcAtRpm(rpm, mapWot);
  const bbWorn = blowbyAt(rpm, mapWot, calWorn.bmep, 0.4, engine);
  const trapWorn = blowbyTrappedFactor(rpm, mapWot, calWorn.ve, calWorn.bmep);
  state.rpm = 6000; state.throttle = 1.0; state.firing = true;
  updateEnginePhysics();
  const diagWorn = diagnoseEngine().findings.some(f => f.id === 'blowby');
  out.worn = {
    lpm: bbWorn.lpm,
    ccWot: bbWorn.crankcaseKpa,
    oilMlh: bbWorn.oilMlh,
    trapWorn,
    tqWorn: calWorn.torque,
    diagWorn
  };

  // 3. Ring sealing options (gapless vs stock vs lowtension)
  load('1.6 Sport NA I4', { rings: 'stock' });
  const stockFmep = mechFrictionMEP(3000, 0.8);
  const stockBb = blowbyAt(6000, 1.0, 10, 1.0, engine);
  load('1.6 Sport NA I4', { rings: 'gapless' });
  const gaplessBb = blowbyAt(6000, 1.0, 10, 1.0, engine);
  load('1.6 Sport NA I4', { rings: 'lowtension' });
  const lowtFmep = mechFrictionMEP(3000, 0.8);
  const lowtBb = blowbyAt(6000, 1.0, 10, 1.0, engine);
  out.rings = {
    stockLpm: stockBb.lpm, gaplessLpm: gaplessBb.lpm, lowtLpm: lowtBb.lpm,
    stockOil: stockBb.oilMlh, gaplessOil: gaplessBb.oilMlh,
    stockFmep, lowtFmep
  };

  // 4. Electric motor hides #statBlowby
  const elPr = PRESETS.find(x => x.engine.type === 'electric');
  if (elPr) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, elPr.engine));
    syncDesignEnable();
    buildEngine();
    updateUI();
    out.elecHidden = document.getElementById('statBlowby').style.display === 'none';
  } else {
    out.elecHidden = true;
  }

  return out;
});

if (!(r.healthy.pct >= 0.4 && r.healthy.pct <= 1.2)) fails.push(`healthy blow-by ${r.healthy.pct.toFixed(2)}% outside 0.4–1.2%`);
if (r.healthy.trapHealthy !== 1) fails.push(`healthy trap factor ${r.healthy.trapHealthy} !== 1`);
if (!(r.healthy.ccIdle < 0)) fails.push(`idle crankcase pressure ${r.healthy.ccIdle} should be < 0 kPa (PCV vacuum)`);
if (!(r.healthy.ccWot > 0 && r.healthy.ccWot < 2)) fails.push(`WOT healthy crankcase pressure ${r.healthy.ccWot} outside (0, 2) kPa`);
if (!r.healthy.statVis) fails.push('#statBlowby should be visible on combustion engine');

if (!(r.worn.lpm > r.healthy.lpm * 2.5)) fails.push(`worn blow-by ${r.worn.lpm} not >2.5x healthy ${r.healthy.lpm}`);
if (!(r.worn.ccWot > r.healthy.ccWot * 4)) fails.push(`worn crankcase ${r.worn.ccWot} not >4x healthy ${r.healthy.ccWot}`);
if (!(r.worn.oilMlh > r.healthy.oilMlh * 4)) fails.push(`worn oil use ${r.worn.oilMlh} not >4x healthy ${r.healthy.oilMlh}`);
if (!(r.worn.trapWorn < 1.0)) fails.push(`worn trap factor ${r.worn.trapWorn} should be < 1.0`);
if (!(r.worn.tqWorn < r.healthy.tqHealthy)) fails.push(`worn torque ${r.worn.tqWorn} should be < healthy ${r.healthy.tqHealthy}`);
if (!r.worn.diagWorn) fails.push('diagnoseEngine() did not flag worn blowby');

if (!(r.rings.gaplessLpm < r.rings.stockLpm * 0.4)) fails.push('gapless rings did not cut blow-by');
if (!(r.rings.gaplessOil < r.rings.stockOil * 0.8)) fails.push('gapless rings did not cut oil use');
if (!(r.rings.lowtLpm > r.rings.stockLpm * 1.2)) fails.push('lowtension rings did not raise blow-by');
if (!(r.rings.lowtFmep < r.rings.stockFmep)) fails.push('lowtension rings did not reduce FMEP');
if (!r.elecHidden) fails.push('#statBlowby should be hidden on electric');

if (errors.length) fails.push(...errors);
console.log('E13 blow-by & ring sealing:', JSON.stringify(r, null, 2));
await browser.close();
if (fails.length) { console.error('FAILS:', fails); process.exit(1); }
console.log('PASS');
