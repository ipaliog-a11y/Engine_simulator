// WHY THIS EXISTS: E2 Water / methanol injection on the AIR & BOOST card.
// What must hold:
//   · default is 'none' (disabled on NA), leaving effIAT and power unchanged;
//   · enabling 'water' or 'wm50' under boost drops effIAT by evaporative cooling (water 2257 kJ/kg,
//     methanol 1100 kJ/kg, cp_air 1.005 kJ/(kg·K)), adds tank mass and build cost;
//   · cooler charge (and methanol octane on wm50) increases knock margin / ECU advance and power under boost;
//   · live WOT operation under boost consumes wmCharge, an empty tank stops cooling, and #btnRefillWM refills it;
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
  // 1. NA engine: waterMeth is 'none' and #edWaterMeth is disabled
  out.naDef = engine.waterMeth;
  out.naDis = document.getElementById('edWaterMeth').disabled;
  out.naCool = wmCoolingC(1.0);

  // 2. Knock-limited turbo build (high boost on 91 RON) so timing/power headroom is visible
  const p = PRESETS.find(x => x.name.includes('2.0 Turbo Hot-Hatch'));
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine));
  document.getElementById('edBoost').value = '1.6';
  document.getElementById('edOctane').value = '91';
  document.getElementById('edCR').value = '10.5';
  buildEngine();
  const rpm = 5500;
  const map0 = steadyMapAt(rpm, 1);
  out.defWM = engine.waterMeth;
  out.iat0 = effIAT(map0, rpm);
  out.adv0 = activeAdvance(rpm, map0);
  out.k0 = knockAt(rpm, map0, out.adv0);
  out.hp0 = calcAtRpm(rpm, map0).powerHP;
  out.mass0 = engineMass();
  out.cost0 = engine.cost;
  out.refillDis0 = document.getElementById('btnRefillWM').disabled;

  // 3. Fit 100% water injection
  const sel = document.getElementById('edWaterMeth');
  sel.value = 'water';
  sel.dispatchEvent(new Event('change'));
  buildEngine();
  const mapW = steadyMapAt(rpm, 1);
  out.iatW = effIAT(mapW, rpm);
  out.advW = activeAdvance(rpm, mapW);
  out.kW = knockAt(rpm, mapW, out.adv0);   // knock at baseline timing (shows knock margin gain)
  out.hpW = calcAtRpm(rpm, mapW).powerHP;
  out.massW = engineMass();
  out.costW = engine.cost;
  out.refillDisW = document.getElementById('btnRefillWM').disabled;

  // 4. Fit 50/50 water-methanol injection
  sel.value = 'wm50';
  sel.dispatchEvent(new Event('change'));
  buildEngine();
  const mapM = steadyMapAt(rpm, 1);
  out.iatM = effIAT(mapM, rpm);
  out.advM = activeAdvance(rpm, mapM);
  out.octM = wmOctaneBonus(mapM);
  out.hpM = calcAtRpm(rpm, mapM).powerHP;

  // 5. Fluid consumption at WOT under boost, empty behaviour, and refill
  state.rpm = 5500; state.throttle = 1.0; state.load = 1.0;
  state.map = mapM; state.boostActual = mapM - 1; state.firing = true; state.ignOn = true;
  const ch0 = state.wmCharge;
  for (let i = 0; i < 100; i++) stepEngine(0.05);   // 5 seconds WOT
  out.ch0 = ch0;
  out.chAfter = state.wmCharge;

  state.wmCharge = 0;
  out.iatEmpty = effIAT(mapM, rpm);
  document.getElementById('btnRefillWM').click();
  out.chRefill = state.wmCharge;
  return out;
});

const near = (a, b, tol) => Math.abs(a - b) <= tol;
if (r.naDef !== 'none') fails.push(`default waterMeth is ${r.naDef}, expected 'none'`);
if (!r.naDis) fails.push('#edWaterMeth should be disabled on NA');
if (r.naCool !== 0) fails.push(`NA wmCoolingC is ${r.naCool}, expected 0`);
if (!r.refillDis0) fails.push('#btnRefillWM should be disabled when WMI is none');

if (!near(r.iat0 - r.iatW, 21.56, 0.5)) fails.push(`water IAT drop ${(r.iat0 - r.iatW).toFixed(2)} °C, expected ~21.56 °C`);
if (!(r.kW < r.k0)) fails.push(`water knock at baseline timing ${r.kW.toFixed(1)} not lower than ${r.k0.toFixed(1)}`);
if (!(r.advW > r.adv0 || r.hpW > r.hp0)) fails.push(`water did not increase advance (${r.adv0.toFixed(1)}→${r.advW.toFixed(1)}°) or HP (${r.hp0.toFixed(1)}→${r.hpW.toFixed(1)})`);
if (r.massW - r.mass0 !== 8) fails.push(`water mass delta ${r.massW - r.mass0} kg, expected 8`);
if (r.costW - r.cost0 !== 850) fails.push(`water cost delta $${r.costW - r.cost0}, expected $850`);
if (r.refillDisW) fails.push('#btnRefillWM should be enabled when WMI is fitted');

if (!near(r.iat0 - r.iatM, 20.04, 0.5)) fails.push(`wm50 IAT drop ${(r.iat0 - r.iatM).toFixed(2)} °C, expected ~20.04 °C`);
if (!(r.octM > 1.0)) fails.push(`wm50 octane bonus ${r.octM.toFixed(2)}, expected > 1.0`);
if (!(r.hpM > r.hp0)) fails.push(`wm50 HP ${r.hpM.toFixed(1)} not > baseline ${r.hp0.toFixed(1)}`);

if (!(r.chAfter < r.ch0)) fails.push(`wmCharge did not deplete (${r.ch0} → ${r.chAfter})`);
if (!near(r.iatEmpty, r.iat0, 0.2)) fails.push(`empty tank IAT ${r.iatEmpty.toFixed(2)} °C ≠ dry ${r.iat0.toFixed(2)} °C`);
if (r.chRefill !== 1.0) fails.push(`after #btnRefillWM click, wmCharge is ${r.chRefill}, expected 1.0`);
fails.push(...errors);

console.log(`water: IAT ${r.iat0.toFixed(1)}→${r.iatW.toFixed(1)}°C, adv ${r.adv0.toFixed(1)}→${r.advW.toFixed(1)}°, HP ${r.hp0.toFixed(1)}→${r.hpW.toFixed(1)}`);
console.log(`wm50:  IAT ${r.iat0.toFixed(1)}→${r.iatM.toFixed(1)}°C, adv ${r.adv0.toFixed(1)}→${r.advM.toFixed(1)}°, +${r.octM.toFixed(1)} RON, HP ${r.hp0.toFixed(1)}→${r.hpM.toFixed(1)}, tank ${(r.chAfter * 100).toFixed(2)}% after 5s`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
