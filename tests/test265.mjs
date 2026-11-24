// WHY THIS EXISTS (B2): ICE NaN guards, live-state isolation, slider/part clamps, and cache/reset fixes. What must hold:
//   · small 1-cyl engine + heavy 180 A alternator never produces negative calcAtRpm torque/power or NaN scoreEngine();
//   · live bench state (high IAT, lean AFR, nitrousActive) never contaminates buildKnockLimit() or peakCylLoads();
//   · edCompWheel = 1 clamps to 30 mm while 0 remains auto;
//   · hidden preset overrides edSpringRpm and edRadHp survive fresh preset load and invalidate when editing bore/redline/boost;
//   · o2Loop.int is anti-windup clamped and resets on open-loop transition and obdReset();
//   · drawCompMap cache key uses buildRev and invalidates between two turbo engines with identical boost_bar;
//   · LIVE RESET restores engine.stoichAFR (E85), refills nitrous, clears #btnNitrous.on, and resets EV state.soc/state.mT;
//   · invalid #b= share hash surfaces flash('Invalid or corrupted share link').
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

  // 1. Small 1-cyl + 180 A alternator: non-negative torque/power and finite score
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, {
    type: 'petrol4', cylinders: 1, bore_mm: 60, stroke_mm: 50, compression: 8, redline: 5000,
    intake: 'na', alternator: '180', timingMode: 'fixed', ignitionAdv: 5
  }));
  syncDesignEnable();
  buildEngine();
  let minTq = Infinity, minHP = Infinity;
  for (let rpm = 1000; rpm <= engine.redline; rpm += 500) {
    const p = calcAtRpm(rpm);
    if (p.torque < minTq) minTq = p.torque;
    if (p.powerHP < minHP) minHP = p.powerHP;
  }
  out.smallAlt = {
    minTq, minHP,
    overall: engine.score.overall,
    drive: engine.score.drive,
    overallFinite: Number.isFinite(engine.score.overall),
    driveFinite: Number.isFinite(engine.score.drive)
  };

  // 2. Live-state isolation in buildKnockLimit() and peakCylLoads()
  const boostSpec = {
    compression: 13.5, boost_bar: 1.4, octane: 91, injector: 'port',
    tqLimit: 0, timingMode: 'auto', afrMode: 'auto', nitrous: '50'
  };
  state.iat = 25; state.afr = 14.7; state.nitrousActive = false;
  load('Ford 1.0 EcoBoost (Fiesta 125)', boostSpec);
  const clean = {
    pMax: engine.peakPmax,
    preIgn: engine.peakPreIgn,
    lim: engine.knockLimTable ? engine.knockLimTable.map(x => +x.bar.toFixed(4)) : null
  };
  state.iat = 75; state.afr = 18.0; state.nitrousActive = true; state.throttle = 1;
  load('Ford 1.0 EcoBoost (Fiesta 125)', boostSpec);
  const dirty = {
    pMax: engine.peakPmax,
    preIgn: engine.peakPreIgn,
    lim: engine.knockLimTable ? engine.knockLimTable.map(x => +x.bar.toFixed(4)) : null
  };
  state.iat = 25; state.afr = 14.7; state.nitrousActive = false;
  out.isolation = { clean, dirty };

  // 3. edCompWheel = 1 clamps to 30, 0 stays 0
  load('Ford 1.0 EcoBoost (Fiesta 125)', { compExd_mm: 1 });
  const comp1 = engine.compExd_mm;
  load('Ford 1.0 EcoBoost (Fiesta 125)', { compExd_mm: 0 });
  const comp0 = engine.compExd_mm;
  out.compWheel = { comp1, comp0 };

  // 4. Hidden preset overrides edSpringRpm / edRadHp invalidate on edit
  load('Ferrari F140 V12 (812 Superfast)');
  const presetSpring = engine.springRpm, presetRad = engine.radHp;
  document.getElementById('edRedline').value = String(engine.redline + 200);
  buildEngine();
  out.hiddenReset = { presetSpring, presetRad, afterSpring: engine.springRpm, afterRad: engine.radHp };

  // 5. o2Loop anti-windup and reset
  load('Ford 1.0 EcoBoost (Fiesta 125)', { injector: 'direct', afrMode: 'auto' });
  obdReset();
  o2Loop.int = 999; o2Loop.trim = 0.2; o2Loop.side = 1;
  obdReset();
  const afterObdReset = { int: o2Loop.int, trim: o2Loop.trim, side: o2Loop.side };
  obd.runS = 20; state.coolant = 90; state.rpm = 2000; state.map = 0.4; state.fuelCut = false;
  for (let i = 0; i < 200; i++) { o2Loop.hist.length = 0; o2Loop.seen = 1.4; o2LoopStep(0.05); }
  const intClamped = o2Loop.int;
  state.coolant = 40; // leave closed loop
  o2LoopStep(0.05);
  const afterOpenLoop = { int: o2Loop.int, trim: o2Loop.trim, side: o2Loop.side };
  out.o2 = { afterObdReset, intClamped, afterOpenLoop };

  // 6. drawCompMap cache invalidation across two turbo builds with identical boost_bar
  load('Ford 1.0 EcoBoost (Fiesta 125)', { boost_bar: 1.2, turboSize: 'small', compExd_mm: 0 });
  drawCompMap(v => v, v => v, 1, () => '8px monospace', v => v, 10, 10, 56, 58, 1.5);
  const key1 = drawCompMap.key;
  load('Audi 2.5 TFSI (RS3 8V)', { boost_bar: 1.2, turboSize: 'large', compExd_mm: 0 });
  drawCompMap(v => v, v => v, 1, () => '8px monospace', v => v, 10, 10, 56, 58, 1.5);
  const key2 = drawCompMap.key;
  out.compMap = { key1, key2 };

  // 7. btnReset: E85 stoich AFR + nitrous refill + EV state reset
  load('Ford 1.0 EcoBoost (Fiesta 125)', { fuel: 'e85', nitrous: '50' });
  state.afr = 12.5; state.nitrousCharge = 0.2; state.nitrousActive = true;
  document.getElementById('btnNitrous').classList.add('on');
  document.getElementById('btnReset').click();
  const afterIceReset = {
    afr: state.afr,
    stoich: engine.stoichAFR,
    nCharge: state.nitrousCharge,
    nActive: state.nitrousActive,
    nBtnOn: document.getElementById('btnNitrous').classList.contains('on')
  };
  const evPreset = PRESETS.find(x => x.engine && x.engine.type === 'electric');
  if (evPreset) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, evPreset.engine));
    syncDesignEnable();
    buildEngine();
    state.soc = 0.15; state.mT = { w: 170, c: 120, r: 150 };
    document.getElementById('btnReset').click();
    out.evReset = { soc: state.soc, w: state.mT.w, tCool: engine.motor.cool.tCool };
  }
  out.iceReset = afterIceReset;

  // 8. Invalid #b= share hash flashes error
  const prevHash = location.hash;
  location.hash = '#b=!!!not-valid-base64!!!';
  const loaded = loadFromHash();
  const statusText = document.getElementById('status').textContent;
  location.hash = prevHash;
  out.badHash = { loaded, statusText };

  return out;
});

if (!(r.smallAlt.minTq >= 0 && r.smallAlt.minHP >= 0)) fails.push('small engine negative dyno torque/power: ' + JSON.stringify(r.smallAlt));
if (!r.smallAlt.overallFinite || !r.smallAlt.driveFinite) fails.push('small engine NaN score: ' + JSON.stringify(r.smallAlt));
if (Math.abs(r.isolation.clean.pMax - r.isolation.dirty.pMax) > 1e-6 ||
    Math.abs(r.isolation.clean.preIgn - r.isolation.dirty.preIgn) > 1e-6 ||
    JSON.stringify(r.isolation.clean.lim) !== JSON.stringify(r.isolation.dirty.lim)) {
  fails.push('live bench state leaked into buildKnockLimit/peakCylLoads: ' + JSON.stringify(r.isolation));
}
if (r.compWheel.comp1 !== 30 || r.compWheel.comp0 !== 0) fails.push('edCompWheel clamp failed: ' + JSON.stringify(r.compWheel));
if (!(r.hiddenReset.presetRad > 0 || r.hiddenReset.presetSpring > 0) || r.hiddenReset.afterSpring !== 0 || r.hiddenReset.afterRad !== 0) {
  fails.push('hidden preset overrides did not invalidate on edit: ' + JSON.stringify(r.hiddenReset));
}
if (r.o2.afterObdReset.int !== 0 || r.o2.afterObdReset.trim !== 0) fails.push('obdReset did not clear o2Loop: ' + JSON.stringify(r.o2));
if (!(Math.abs(r.o2.intClamped) < 1)) fails.push('o2Loop.int anti-windup failed: ' + JSON.stringify(r.o2));
if (r.o2.afterOpenLoop.int !== 0 || r.o2.afterOpenLoop.trim !== 0) fails.push('open-loop transition did not reset o2Loop: ' + JSON.stringify(r.o2));
if (r.compMap.key1 === r.compMap.key2 || String(r.compMap.key1).includes('[object Object]')) {
  fails.push('drawCompMap cache key failed: ' + JSON.stringify(r.compMap));
}
if (Math.abs(r.iceReset.afr - r.iceReset.stoich) > 1e-6 || r.iceReset.nCharge !== 1 || r.iceReset.nActive || r.iceReset.nBtnOn) {
  fails.push('ICE btnReset failed: ' + JSON.stringify(r.iceReset));
}
if (r.evReset && (Math.abs(r.evReset.soc - 0.9) > 1e-6 || Math.abs(r.evReset.w - r.evReset.tCool) > 1e-6)) {
  fails.push('EV btnReset failed: ' + JSON.stringify(r.evReset));
}
if (r.badHash.loaded !== false || !/invalid or corrupted share link/i.test(r.badHash.statusText)) {
  fails.push('invalid #b= hash did not flash error: ' + JSON.stringify(r.badHash));
}
if (errors.length) fails.push(...errors);

await browser.close();
if (fails.length) {
  console.log('FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS');
