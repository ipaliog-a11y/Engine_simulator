// WHY THIS EXISTS (B9): ICE knock sensitivity (coolant wall temp, EGR dilution, bore-scaled burn duration),
// mechanical/inertial wear limits (piston speed > 25 m/s, rotary apex-seal speed, unified ROD_RATIO),
// turbo surge/overspeed & standstill intercooler heat-soak, nitrous fuel + cylinder-load accounting,
// and extreme AFR mixture misfire. What must hold:
//   · hotter coolant (115 °C vs 90 °C vs 65 °C) raises end-gas knock integral I; wallTempK(90) === 450 K;
//   · larger bore (100 mm vs 76 mm at fixed displacement/CR/MAP/RPM) lengthens SI burn duration and raises knock I;
//   · cooled EGR at full load reduces end-gas knock integral I vs no EGR;
//   · piston speed > PISTON_SPEED_LIMIT (25 m/s) causes PISTON SPEED wear in stepWear(), and rotary apex-seal
//     sliding speed > APEX_SPEED_LIMIT causes APEX SEAL wear while stock RX-8 at 9000 rpm stays clean;
//   · ROD_RATIO is unified at 3.4 with ROD_STROKE === ROD_RATIO / 2;
//   · compressor surge line flags low flow at high PR (isCompSurge) and standstill IC face velocity lowers icEffAt;
//   · active nitrous increases meteredFuelKgS, raises cylPmax and exhaustGasT, and keeps thermalEff realistic (< 44%);
//   · extreme lean/rich AFR (< 0.72 or > 1.20 lambda) rolls off sparkMixture torque and flags obdMisfire / P0300;
//   · stock presets (NA petrol, turbo petrol, diesel, rotary) stay healthy with finite positive output.
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

  // 1. Coolant temp knock sensitivity & wallTempK anchor
  load('VW EA888 2.0 TSI (Golf GTI)', { timingMode: 'fixed', ignitionAdv: 24, afrMode: 'fixed' });
  state.afr = engine.stoichAFR * 0.92; state.iat = 25; state.nitrousActive = false;
  const map1 = 1.8, rpm1 = 3500;
  state.coolant = 65; const kCool65 = cylTraceAt(rpm1, map1, 24).I;
  state.coolant = 90; const kCool90 = cylTraceAt(rpm1, map1, 24).I;
  state.coolant = 115; const kCool115 = cylTraceAt(rpm1, map1, 24).I;
  state.coolant = 90;
  out.coolant = { tw90: wallTempK(90), kCool65, kCool90, kCool115 };

  // 2. Bore-size burn duration & knock sensitivity (same ~2.0 L displacement & CR)
  load('2.0 Turbo I4', { bore_mm: 76, stroke_mm: 110.2, compression: 10.5, timingMode: 'fixed', ignitionAdv: 22, afrMode: 'fixed' });
  state.coolant = 90; state.iat = 25; state.afr = engine.stoichAFR * 0.92;
  const burnSmall = siBurnDeg(engine), kSmallBore = cylTraceAt(3500, 1.6, 22).I;
  load('2.0 Turbo I4', { bore_mm: 100, stroke_mm: 63.7, compression: 10.5, timingMode: 'fixed', ignitionAdv: 22, afrMode: 'fixed' });
  state.coolant = 90; state.iat = 25; state.afr = engine.stoichAFR * 0.92;
  const burnLarge = siBurnDeg(engine), kLargeBore = cylTraceAt(3500, 1.6, 22).I;
  out.bore = { burnSmall, burnLarge, kSmallBore, kLargeBore };

  // 3. Cooled EGR reduces end-gas knock integral
  load('2.0 Turbo I4', { compression: 10.5, egr: 'none', timingMode: 'fixed', ignitionAdv: 22, afrMode: 'fixed' });
  state.coolant = 90; state.iat = 25; state.afr = engine.stoichAFR * 0.95;
  const kNoEgr = cylTraceAt(3500, 1.6, 22).I;
  load('2.0 Turbo I4', { compression: 10.5, egr: 'cooled-full', timingMode: 'fixed', ignitionAdv: 22, afrMode: 'fixed' });
  state.coolant = 90; state.iat = 25; state.afr = engine.stoichAFR * 0.95;
  const egrVal = egrRate(3500, 1.6), kWithEgr = cylTraceAt(3500, 1.6, 22).I;
  out.egr = { egrVal, kNoEgr, kWithEgr };

  // 4. Inertial wear limits (piston speed > 25 m/s, rotary apex-seal speed) & unified ROD_RATIO
  const prevWear = wearEnabled;
  wearEnabled = true;
  load('2.0 Turbo I4', { stroke_mm: 100, redline: 9000, valveMat: 'titanium', spring: 'race' });
  state.firing = true; state.blown = false; state.engineHealth = 1;
  state.rpm = 8400; state.map = 0.8; state.throttle = 0.4; state.coolant = 90; state.oil = 95;
  state.knockRisk = 0; state.preIgn = 0; state.cylPmax = 40; state.turboOverspeed = false; state.turboSurge = false;
  state.afr = engine.stoichAFR;
  stepWear(1.0);
  const pistonWear = { mps: 2 * (engine.stroke_mm / 1000) * state.rpm / 60, health: state.engineHealth, cause: state.wearCause };

  load('Mazda 13B-MSP Renesis (RX-8)');
  state.firing = true; state.blown = false; state.engineHealth = 1;
  state.rpm = 9000; state.map = 0.9; state.coolant = 90; state.oil = 95; state.knockRisk = 0; state.preIgn = 0; state.cylPmax = 50;
  state.afr = engine.stoichAFR;
  stepWear(1.0);
  const rx8Stock = { vApex: 2 * Math.PI * (engine.bore_mm / 1000) * (state.rpm / 3) / 60, cause: state.wearCause };
  state.engineHealth = 1; state.rpm = 11200;
  stepWear(1.0);
  const rx8Over = { vApex: 2 * Math.PI * (engine.bore_mm / 1000) * (state.rpm / 3) / 60, health: state.engineHealth, cause: state.wearCause };
  wearEnabled = prevWear;
  out.mech = { rodRatio: ROD_RATIO, rodStroke: ROD_STROKE, pistonWear, rx8Stock, rx8Over };

  // 5. Turbo surge line & standstill intercooler heat-soak
  load('VW EA888 2.0 TSI (Golf GTI)');
  state.iat = 25;
  state.icFaceV = null; const epsMoving = icEffAt(0.15), iatMoving = effIAT(2.0, 5000);
  state.icFaceV = IC_FACE_V_IDLE; const epsIdle = icEffAt(0.15), iatIdle = effIAT(2.0, 5000);
  state.icFaceV = null;
  out.turbo = {
    surgeLowFlow: isCompSurge(0.10, 2.2),
    surgeNormalFlow: isCompSurge(0.60, 2.2),
    surgeOffBoost: isCompSurge(0.05, 1.05),
    epsMoving, epsIdle, iatMoving, iatIdle
  };

  // 6. Nitrous fuel enrichment, cylinder pressure, EGT & realistic thermal efficiency
  load('2.0 Turbo I4', { intake: 'na', boost_bar: 0, nitrous: 'large' });
  state.firing = true; state.blown = false; state.rpm = 5500; state.throttle = 1; state.map = 1.0;
  state.coolant = 90; state.oil = 95; state.iat = 25; state.nitrousCharge = 1.0; state.burnFrac = 1;
  state.nitrousActive = false; updateEnginePhysics();
  const nOff = { fuel: state.fuelFlowLph, pMax: state.cylPmax, eff: state.thermalEff, egt: egtAt(5500, 1.0) };
  state.nitrousActive = true; updateEnginePhysics();
  const nOn = { fuel: state.fuelFlowLph, pMax: state.cylPmax, eff: state.thermalEff, egt: egtAt(5500, 1.0) };
  state.nitrousActive = false;
  out.nitrous = { nOff, nOn };

  // 7. Extreme AFR mixture misfire & OBD P0300
  load('VW EA888 2.0 TSI (Golf GTI)', { afrMode: 'fixed' });
  state.firing = true; state.blown = false; state.rpm = 3000; state.map = 0.8; state.fuelCut = false;
  state.afr = engine.stoichAFR * 1.00; const misStoich = obdMisfire(), tqStoich = sparkMixture(1.0);
  state.afr = engine.stoichAFR * 0.65; const misRich = obdMisfire(), tqRich = sparkMixture(0.65), p300Rich = !!obdConditions().P0300;
  state.afr = engine.stoichAFR * 1.28; const misLean = obdMisfire(), tqLean = sparkMixture(1.28), p300Lean = !!obdConditions().P0300;
  out.afr = { misStoich, tqStoich, misRich, tqRich, p300Rich, misLean, tqLean, p300Lean };

  // 8. Stock presets stay healthy
  const samples = ['Mazda BP-Z3 1.8 (MX-5 NB)', 'VW EA888 2.0 TSI (Golf GTI)', 'VW EA288 2.0 TDI (Golf 150)', 'Mazda 13B-MSP Renesis (RX-8)'];
  out.presets = samples.map(name => {
    load(name);
    return { name, hp: engine.score.peakHP, pMax: engine.peakPmax, lim: cylPmaxLimit() };
  });

  return out;
});

if (r.coolant.tw90 !== 450) fails.push('wallTempK(90) expected 450 K, got ' + r.coolant.tw90);
if (!(r.coolant.kCool115 > r.coolant.kCool90 && r.coolant.kCool90 > r.coolant.kCool65))
  fails.push('Coolant knock monotonicity failed: ' + JSON.stringify(r.coolant));
if (!(r.bore.burnLarge > r.bore.burnSmall && r.bore.kLargeBore > r.bore.kSmallBore))
  fails.push('Bore-size burn/knock scaling failed: ' + JSON.stringify(r.bore));
if (!(r.egr.egrVal > 0.15 && r.egr.kWithEgr < r.egr.kNoEgr * 0.85))
  fails.push('Cooled EGR failed to reduce end-gas knock: ' + JSON.stringify(r.egr));
if (r.mech.rodRatio !== 3.4 || r.mech.rodStroke !== 1.7)
  fails.push('ROD_RATIO not unified at 3.4: ' + JSON.stringify(r.mech));
if (r.mech.pistonWear.cause !== 'PISTON SPEED' || !(r.mech.pistonWear.health < 1))
  fails.push('Piston speed > 25 m/s did not cause PISTON SPEED wear: ' + JSON.stringify(r.mech.pistonWear));
if (r.mech.rx8Stock.cause === 'APEX SEAL')
  fails.push('Stock RX-8 at 9000 rpm falsely triggered APEX SEAL wear: ' + JSON.stringify(r.mech.rx8Stock));
if (r.mech.rx8Over.cause !== 'APEX SEAL' || !(r.mech.rx8Over.health < 1))
  fails.push('Over-revved rotary did not cause APEX SEAL wear: ' + JSON.stringify(r.mech.rx8Over));
if (!r.turbo.surgeLowFlow || r.turbo.surgeNormalFlow || r.turbo.surgeOffBoost)
  fails.push('Compressor surge line check failed: ' + JSON.stringify(r.turbo));
if (!(r.turbo.epsIdle < r.turbo.epsMoving && r.turbo.iatIdle > r.turbo.iatMoving))
  fails.push('Standstill intercooler heat-soak failed: ' + JSON.stringify(r.turbo));
if (!(r.nitrous.nOn.fuel > r.nitrous.nOff.fuel * 1.15 && r.nitrous.nOn.pMax > r.nitrous.nOff.pMax + 5 && r.nitrous.nOn.egt > r.nitrous.nOff.egt + 50 && r.nitrous.nOn.eff < 44))
  fails.push('Nitrous fuel/load/EGT/eff accounting failed: ' + JSON.stringify(r.nitrous));
if (!(r.afr.misStoich === 0 && r.afr.misRich > 0.02 && r.afr.p300Rich && r.afr.tqRich < r.afr.tqStoich * 0.6 && r.afr.misLean > 0.02 && r.afr.p300Lean && r.afr.tqLean < r.afr.tqStoich * 0.6))
  fails.push('Extreme AFR misfire/OBD check failed: ' + JSON.stringify(r.afr));
for (const p of r.presets) {
  if (!(Number.isFinite(p.hp) && p.hp > 50 && Number.isFinite(p.pMax) && p.pMax > 20 && p.pMax < p.lim))
    fails.push('Stock preset unhealthy: ' + JSON.stringify(p));
}
if (errors.length) fails.push(...errors);

console.log('B9 ICE knock/limits/nitrous check:', JSON.stringify(r));
if (fails.length) { console.error('FAIL:\n' + fails.join('\n')); await browser.close(); process.exit(1); }
console.log('PASS');
await browser.close();
