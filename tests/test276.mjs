// WHY THIS EXISTS (B13): 2-stroke tuned expansion-chamber stuffing wave, unthrottled quality-governed
// diesel operation on the LIVE bench, exhaust silencer back-pressure, and derived oil-pressure model.
// What must hold:
//   · 2-stroke expansion chamber (twoStrokePipeGain): positive resonant stuffing wave on sport/race
//     exhausts, zero on stock cast/box exhaust and on 4-stroke engines; shorter custom pipe tunes higher;
//   · unthrottled CI diesel on LIVE bench: mapTarget() >= 1.0 and state.map >= 1.0 at light pedal,
//     no vacuum pumping loss in pumpingMEP(), and load is governed by fuel quantity (leaner AFR & lower
//     torque at light pedal vs full pedal);
//   · silencer back-pressure (silencerDp): baffled > chambered > absorptive > straight (0), wired into
//     backPressureBar() and exhaustReport() (straight pipe makes more peak HP than baffled);
//   · derived oil pressure (oilPressureBar & state.oilP): rises with RPM up to relief valve ceiling,
//     drops with hot oil viscosity loss, is 0 on 2-strokes (premix), and causes LOW OIL PRESSURE wear
//     in stepWear() under severe thermal thinning.
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

  // 1. 2-stroke expansion chamber
  load('500cc 2-Stroke Twin', { exhaust: 'race' });
  const tsRacePeak = engine.scavPeakRpm;
  const tsRaceGain = twoStrokePipeGain(tsRacePeak);
  const tsRaceHp = wotPull().peakHP;
  load('500cc 2-Stroke Twin', { exhaust: 'stock' });
  const tsStockGain = twoStrokePipeGain(6000);
  const tsStockHp = wotPull().peakHP;
  // Shorter custom pipe tunes higher than longer custom pipe
  load('500cc 2-Stroke Twin', { exhaust: 'race' });
  const shortRep = exhaustReport(normPart({ kind: 'exhaust', build: 'equal', primD_mm: 38, primL_mm: 550, pipes: 2, sysD_mm: 40, sysL_m: 1.5, silencer: 'straight' }));
  const longRep = exhaustReport(normPart({ kind: 'exhaust', build: 'equal', primD_mm: 38, primL_mm: 1000, pipes: 2, sysD_mm: 40, sysL_m: 1.5, silencer: 'straight' }));
  out.twoStroke = { tsRacePeak, tsRaceGain, tsRaceHp, tsStockGain, tsStockHp, shortTune: shortRep.scavPeakRpm, longTune: longRep.scavPeakRpm };

  // 4-stroke gets 0 from twoStrokePipeGain
  load('Honda B18C spec R (Integra Type R DC2)');
  out.fourStrokePipeGain = twoStrokePipeGain(6000);

  // 2. Unthrottled quality-governed diesel on LIVE bench
  load('2.0 Turbo Diesel I4');
  state.firing = true; state.rpm = 1800; state.throttle = 0.08; state.load = 0.5;
  const ciMapTargetLow = mapTarget();
  for (let i = 0; i < 30; i++) stepEngineOnce(0.02);
  const ciMapAfterStep = state.map;
  const pmepVac = pumpingMEP(2000, 0.5);
  const pmepAtm = pumpingMEP(2000, 1.0);
  state.rpm = 2000; state.map = 1.0; state.boostActual = 0;
  state.throttle = 0.15; updateEnginePhysics();
  const ciAfrLow = state.afr, ciTqLow = state.torque;
  state.throttle = 1.0; updateEnginePhysics();
  const ciAfrHigh = state.afr, ciTqHigh = state.torque;
  out.diesel = { ciMapTargetLow, ciMapAfterStep, pmepVac, pmepAtm, ciAfrLow, ciAfrHigh, ciTqLow, ciTqHigh };

  // 3. Exhaust silencer back-pressure
  const dpBaf = silencerDp(0.08, 'baffled', 0.4);
  const dpChm = silencerDp(0.08, 'chambered', 0.4);
  const dpAbs = silencerDp(0.08, 'absorptive', 0.4);
  const dpStr = silencerDp(0.08, 'straight', 0.4);
  load('Honda B18C spec R (Integra Type R DC2)', { exhaust: 'sport', silencer: 'straight' });
  const bpStr = backPressureBar(8000, 1050), hpStr = wotPull().peakHP;
  const repStr = exhaustReport(partFromFactory('sport', 'exhaust')).silBpKPa;
  load('Honda B18C spec R (Integra Type R DC2)', { exhaust: 'sport', silencer: 'absorptive' });
  const bpAbs = backPressureBar(8000, 1050);
  load('Honda B18C spec R (Integra Type R DC2)', { exhaust: 'sport', silencer: 'chambered' });
  const bpChm = backPressureBar(8000, 1050);
  load('Honda B18C spec R (Integra Type R DC2)', { exhaust: 'sport', silencer: 'baffled' });
  const bpBaf = backPressureBar(8000, 1050), hpBaf = wotPull().peakHP;
  const repBaf = exhaustReport(partFromFactory('sport', 'exhaust')).silBpKPa;
  out.silencer = { dpBaf, dpChm, dpAbs, dpStr, bpStr, bpAbs, bpChm, bpBaf, hpStr, hpBaf, repStr, repBaf };

  // 4. Oil pressure model & low-oil-pressure wear
  load('2.0 Turbo Hot-Hatch I4');
  const pIdle100 = oilPressureBar(1000, 100);
  const pMid100 = oilPressureBar(2000, 100);
  const pHigh100 = oilPressureBar(5000, 100);
  const pCold = oilPressureBar(1500, 20);
  const pHot = oilPressureBar(2000, 155);
  state.rpm = 2000; state.oil = 100; updateEnginePhysics();
  const liveOilP = state.oilP;

  // Low oil pressure wear on hot thinned oil at low RPM under load (below OIL_WEAR_C = 151 °C)
  const prevWear = wearEnabled;
  wearEnabled = true;
  state.engineHealth = 1.0; state.blown = false; state.wearCause = '';
  state.firing = true; state.rpm = 1000; state.oil = 148; state.coolant = 90; state.knockRisk = 0; state.cylPmax = 40; state.bmep = 5; state.powerHP = 25;
  for (let i = 0; i < 40; i++) stepWear(0.1);
  const hotWearHealth = state.engineHealth, hotWearCause = state.wearCause, hotOilP = state.oilP;

  // 2-stroke has 0 oil pressure and no LOW OIL PRESSURE wear
  load('500cc 2-Stroke Twin');
  const tsOilP = oilPressureBar(5000, 100);
  state.engineHealth = 1.0; state.blown = false; state.wearCause = '';
  state.firing = true; state.rpm = 5000; state.oil = 100; state.coolant = 90; state.knockRisk = 0; state.cylPmax = 40; state.bmep = 5; state.powerHP = 30;
  stepWear(0.5);
  const tsWearCause = state.wearCause;
  wearEnabled = prevWear;

  out.oil = { pIdle100, pMid100, pHigh100, pCold, pHot, liveOilP, hotWearHealth, hotWearCause, hotOilP, tsOilP, tsWearCause };
  return out;
});

// Assertions
const ts = r.twoStroke;
if (!(ts.tsRacePeak > 3000 && ts.tsRaceGain > 0.15)) fails.push('2-stroke race expansion chamber gain/peak too low: ' + JSON.stringify(ts));
if (ts.tsStockGain !== 0) fails.push('2-stroke stock exhaust should have 0 pipe gain, got ' + ts.tsStockGain);
if (!(ts.tsRaceHp > ts.tsStockHp)) fails.push('2-stroke race pipe should beat stock exhaust HP: ' + ts.tsRaceHp + ' vs ' + ts.tsStockHp);
if (!(ts.shortTune > ts.longTune)) fails.push('shorter 2-stroke pipe should tune higher: ' + ts.shortTune + ' vs ' + ts.longTune);
if (r.fourStrokePipeGain !== 0) fails.push('4-stroke should get 0 from twoStrokePipeGain, got ' + r.fourStrokePipeGain);

const d = r.diesel;
if (!(d.ciMapTargetLow >= 1.0)) fails.push('CI diesel mapTarget should be >= 1.0 at low pedal, got ' + d.ciMapTargetLow);
if (!(d.ciMapAfterStep >= 1.0)) fails.push('CI diesel state.map should stay >= 1.0 after stepping, got ' + d.ciMapAfterStep);
if (Math.abs(d.pmepVac - d.pmepAtm) > 1e-9) fails.push('CI diesel pumpingMEP should have no vacuum penalty: ' + d.pmepVac + ' vs ' + d.pmepAtm);
if (!(d.ciAfrLow > d.ciAfrHigh * 1.5)) fails.push('CI diesel light pedal AFR should be much leaner: ' + d.ciAfrLow + ' vs ' + d.ciAfrHigh);
if (!(d.ciTqLow < d.ciTqHigh)) fails.push('CI diesel light pedal torque should be lower: ' + d.ciTqLow + ' vs ' + d.ciTqHigh);

const s = r.silencer;
if (!(s.dpBaf > s.dpChm && s.dpChm > s.dpAbs && s.dpAbs > s.dpStr && s.dpStr === 0)) fails.push('silencerDp ordering broken: ' + JSON.stringify(s));
if (!(s.bpBaf > s.bpChm && s.bpChm > s.bpAbs && s.bpAbs > s.bpStr)) fails.push('backPressureBar silencer ordering broken: ' + JSON.stringify(s));
if (!(s.hpStr > s.hpBaf)) fails.push('straight pipe should make more peak HP than baffled: ' + s.hpStr + ' vs ' + s.hpBaf);
if (!(s.repStr === 0 && s.repBaf > 0)) fails.push('exhaustReport silBpKPa broken: ' + s.repStr + ' / ' + s.repBaf);

const o = r.oil;
if (!(o.pIdle100 > 1.0 && o.pIdle100 < o.pMid100 && o.pMid100 < o.pHigh100 && o.pHigh100 <= 5.21)) fails.push('oilPressureBar RPM curve broken: ' + JSON.stringify(o));
if (!(o.pCold >= 4.79 && o.pHot < o.pMid100)) fails.push('oilPressureBar viscosity/temp behavior broken: ' + JSON.stringify(o));
if (!(Math.abs(o.liveOilP - o.pMid100) < 1e-6)) fails.push('state.oilP not updated in updateEnginePhysics: ' + o.liveOilP + ' vs ' + o.pMid100);
if (!(o.hotOilP < 1.3 && o.hotWearHealth < 0.99 && o.hotWearCause.includes('LOW OIL PRESSURE'))) fails.push('low oil pressure wear not triggered: ' + JSON.stringify(o));
if (o.tsOilP !== 0 || o.tsWearCause.includes('LOW OIL PRESSURE')) fails.push('2-stroke oil pressure should be 0 with no low-oil wear: ' + o.tsOilP + ' / ' + o.tsWearCause);

if (errors.length) fails.push(...errors);
console.log('test276 (B13):', fails.length ? 'FAIL' : 'PASS', JSON.stringify({ ts, d, s: { bpStr: +s.bpStr.toFixed(3), bpBaf: +s.bpBaf.toFixed(3), hpStr: +s.hpStr.toFixed(1), hpBaf: +s.hpBaf.toFixed(1) }, o: { pIdle100: +o.pIdle100.toFixed(2), pHigh100: +o.pHigh100.toFixed(2), pHot: +o.pHot.toFixed(2), hotWearCause: o.hotWearCause } }));
if (fails.length) { console.error(fails.join('\n')); await browser.close(); process.exit(1); }
await browser.close();
