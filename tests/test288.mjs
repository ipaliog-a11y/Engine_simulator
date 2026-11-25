// WHY THIS EXISTS (E14): Turbocharger as an independently breakable cartridge.
// What must hold:
//   · Normal boosted operation below the 520 m/s tip-speed limit and surge line keeps turboHealth === 1,
//     turboBlown === false, and boost/power unchanged;
//   · Sustained overspeed (turboOverspeed) or surge (turboSurge) degrades turboHealth and fails the turbo
//     cartridge (turboBlown === true) independently of the engine block (blown === false, engineHealth intact);
//   · When turboBlown is true, stepBoost/boostAvail collapse boost to 0 (atmospheric), OBD flags P0299,
//     diagnoseEngine() reports TURBO FAILED, and the LIVE UI (#statTurbo, #status) reflects TURBO FAILED;
//   · Rebuild (buildEngine) and RESET (#btnReset) restore turboHealth === 1, turboBlown === false, and boost;
//   · Non-turbo engines hide #statTurbo; no page errors.
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
  const prevWear = wearEnabled;
  wearEnabled = true;

  // 1. Normal boosted operation keeps turbo healthy and boost unchanged
  load('VW EA888 2.0 TSI (Golf GTI Mk7)');
  state.firing = true; state.blown = false; state.rpm = 4500; state.throttle = 1.0;
  state.coolant = 90; state.oil = 95; state.iat = 25; state.knockRisk = 0; state.preIgn = 0;
  state.afr = engine.stoichAFR * 0.88;
  const healthyBoostAvail = boostAvail(4500);
  const healthyPower = calcAtRpm(4500).powerHP;
  for (let i = 0; i < 40; i++) { stepBoost(0.1); stepWear(0.1); }
  out.normal = {
    turboHealth: state.turboHealth,
    turboBlown: state.turboBlown,
    turboWearCause: state.turboWearCause,
    boostActual: state.boostActual,
    healthyBoostAvail,
    healthyPower
  };

  // 2. Surge degrades turboHealth without blowing the engine block
  state.turboOverspeed = false; state.turboSurge = true;
  stepWear(5.0);
  out.surge = {
    turboHealth: state.turboHealth,
    turboWearCause: state.turboWearCause,
    turboBlown: state.turboBlown,
    engineHealth: state.engineHealth,
    blown: state.blown
  };

  // 3. Sustained overspeed fails the turbo cartridge while engine block survives
  state.turboSurge = false;
  for (let i = 0; i < 50 && !state.turboBlown; i++) {
    state.turboOverspeed = true;
    stepWear(1.0);
  }
  state.rpm = 4500; state.throttle = 1.0; state.fuelCut = false;
  stepBoost(0.2);
  state.map = mapTarget();
  updateEnginePhysics();
  updateUI();
  const diag = diagnoseEngine();
  out.failed = {
    turboHealth: state.turboHealth,
    turboBlown: state.turboBlown,
    turboWearCause: state.turboWearCause,
    engineHealth: state.engineHealth,
    blown: state.blown,
    boostActual: state.boostActual,
    shaftE: state.shaftE,
    boostAvailAfter: boostAvail(4500),
    failedPower: calcAtRpm(4500).powerHP,
    mapAfter: state.map,
    p0299: !!obdConditions().P0299,
    diagHasTurboFailed: diag.findings.some(f => f.id === 'turboBlown' && f.title === 'TURBO FAILED'),
    statTurboText: document.getElementById('statTurbo').querySelector('.value').textContent,
    statTurboDanger: document.getElementById('statTurbo').classList.contains('danger'),
    statusText: document.getElementById('status').textContent
  };

  // 4. RESET button restores turbo health and boost
  document.getElementById('btnReset').click();
  out.afterReset = {
    turboHealth: state.turboHealth,
    turboBlown: state.turboBlown,
    turboWearCause: state.turboWearCause,
    boostAvailRestored: boostAvail(4500),
    p0299Cleared: !obdConditions().P0299
  };

  // 5. buildEngine() restores turbo after failure
  state.turboHealth = 0; state.turboBlown = true; state.turboWearCause = 'TURBO OVERSPEED';
  buildEngine();
  out.afterBuild = {
    turboHealth: state.turboHealth,
    turboBlown: state.turboBlown,
    turboWearCause: state.turboWearCause,
    boostAvailRestored: boostAvail(4500)
  };

  // 6. NA engine hides #statTurbo
  load('Mazda B6-ZE (MX-5 NA)');
  updateUI();
  out.naTurboHidden = document.getElementById('statTurbo').style.display === 'none';

  wearEnabled = prevWear;
  return out;
});

if (!(r.normal.turboHealth === 1 && !r.normal.turboBlown && r.normal.turboWearCause === '' && r.normal.boostActual > 0.5))
  fails.push('Normal boosted operation did not stay healthy: ' + JSON.stringify(r.normal));
if (!(r.surge.turboHealth < 1 && r.surge.turboWearCause === 'TURBO SURGE' && !r.surge.turboBlown && !r.surge.blown && r.surge.engineHealth > 0.95))
  fails.push('Surge wear check failed: ' + JSON.stringify(r.surge));
if (!(r.failed.turboBlown && r.failed.turboHealth === 0 && !r.failed.blown && r.failed.engineHealth > 0.9))
  fails.push('Turbo failure was not independent of engine block: ' + JSON.stringify(r.failed));
if (!(r.failed.boostActual === 0 && r.failed.shaftE === 0 && r.failed.boostAvailAfter === 0 && r.failed.mapAfter <= 1.01 && r.failed.failedPower < r.normal.healthyPower * 0.75))
  fails.push('Boost/power did not collapse on turbo failure: ' + JSON.stringify(r.failed));
if (!(r.failed.p0299 && r.failed.diagHasTurboFailed && r.failed.statTurboText === 'FAILED' && r.failed.statTurboDanger && r.failed.statusText.includes('TURBO FAILED')))
  fails.push('OBD/UI/Diag did not report TURBO FAILED: ' + JSON.stringify(r.failed));
if (!(r.afterReset.turboHealth === 1 && !r.afterReset.turboBlown && r.afterReset.turboWearCause === '' && r.afterReset.boostAvailRestored === r.normal.healthyBoostAvail && r.afterReset.p0299Cleared))
  fails.push('RESET did not restore turbo: ' + JSON.stringify(r.afterReset));
if (!(r.afterBuild.turboHealth === 1 && !r.afterBuild.turboBlown && r.afterBuild.turboWearCause === '' && r.afterBuild.boostAvailRestored === r.normal.healthyBoostAvail))
  fails.push('buildEngine() did not restore turbo: ' + JSON.stringify(r.afterBuild));
if (!r.naTurboHidden)
  fails.push('#statTurbo should be hidden on NA engine');
if (errors.length) fails.push(...errors);

console.log('E14 turbo failure check:', JSON.stringify(r));
if (fails.length) { console.error('FAIL:\n' + fails.join('\n')); await browser.close(); process.exit(1); }
console.log('PASS');
await browser.close();
