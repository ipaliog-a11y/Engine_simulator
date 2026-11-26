// WHY THIS EXISTS (build 441): high-CR + turbo petrol limits (peak cylinder pressure, compression pre-ignition,
// high-CR crevice loss, ECU knock boost-cut diagnostics, and per-type CR input bounds). What must hold:
//   · edCR min/max syncs to ENGINE_TYPE (petrol4 8..18, diesel 15..24) and petrol4 builds up to 18:1 without clamping at 14;
//   · Ferrari 812 NA stays below PMAX_LIMIT_SI (140 bar), while 812 + turbo exceeds 140 bar, flags pmax in diagnoseEngine(),
//     reduces reliability, and causes OVER-PRESSURE wear in stepWear() even on knock-proof E85;
//   · extreme CR + low octane reaches compression pre-ignition (peakPreIgn >= 1.0), flags preign, and causes PRE-IGNITION wear;
//   · an AUTO-timing build whose ECU cuts boost for knock surfaces knockboost in diagnoseEngine() and ICD warnings;
//   · creviceEta(10) === 1 and falls monotonically with higher CR;
//   · stock presets (812 NA, 992 Turbo S, Audi RS3, VW 2.0 TDI) produce no false pmax or preign errors.
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

  // 1. UI bounds sync & petrol4 crMax = 18
  load('Ferrari F140 V12 (812 Superfast)', { compression: 16.5 });
  out.crSync = {
    petrolMin: document.getElementById('edCR').min,
    petrolMax: document.getElementById('edCR').max,
    builtCR: engine.compression
  };
  load('VW EA288 2.0 TDI (Golf 150)');
  out.dieselMax = document.getElementById('edCR').max;

  // 2. Peak cylinder pressure: 812 NA vs 812 + turbo on E85 (zero knock, pure over-pressure)
  load('Ferrari F140 V12 (812 Superfast)');
  out.na812 = {
    pMax: engine.peakPmax,
    pLim: cylPmaxLimit(),
    findings: diagnoseEngine().findings.map(f => f.id)
  };
  load('Ferrari F140 V12 (812 Superfast)', {
    intake: 'turbo', boost_bar: 1.0, turboSize: 'large', turboConfig: 'twin', intercooler: 'large',
    compression: 15, fuel: 'e85'
  });
  const dE85 = diagnoseEngine();
  const rel15 = engine.score.reliability;
  const pMax15 = engine.peakPmax;
  // Verify live OVER-PRESSURE wear with zero knock
  const prevWear = wearEnabled;
  wearEnabled = true;
  state.firing = true; state.blown = false; state.engineHealth = 1;
  state.rpm = 6000; state.map = wotMapAt(6000); state.throttle = 1;
  state.coolant = 90; state.oil = 95;
  updateEnginePhysics();
  stepWear(1.0);
  out.turbo812E85 = {
    pMax: pMax15, rel: rel15, findings: dE85.findings.map(f => f.sev + ':' + f.id),
    livePmax: state.cylPmax, liveKnock: state.knockRisk, wearCause: state.wearCause, healthAfter: state.engineHealth
  };
  wearEnabled = prevWear;

  // 3. Pre-ignition on extreme CR + low octane + boost (fixed timing so boost isn't cut away)
  load('Ferrari F140 V12 (812 Superfast)', {
    intake: 'turbo', boost_bar: 1.4, turboSize: 'large', turboConfig: 'twin', intercooler: 'none',
    compression: 18, octane: 87, injector: 'port', timingMode: 'fixed', ignitionAdv: 15
  });
  const dPre = diagnoseEngine();
  wearEnabled = true;
  state.firing = true; state.blown = false; state.engineHealth = 1;
  state.rpm = 2000; state.map = 2.0; state.throttle = 1;
  state.coolant = 90; state.oil = 95;
  updateEnginePhysics();
  stepWear(1.0);
  out.preIgn = {
    peakPreIgn: engine.peakPreIgn,
    findings: dPre.findings.map(f => f.sev + ':' + f.id),
    livePreIgn: state.preIgn,
    wearCause: state.wearCause,
    healthAfter: state.engineHealth
  };
  wearEnabled = prevWear;

  // 4. ECU knock boost cut surfaced in diagnoseEngine() and ICD
  load('Ford 1.0 EcoBoost (Fiesta 125)', {
    compression: 14, boost_bar: 1.5, octane: 87, injector: 'port', tqLimit: 0, timingMode: 'auto', afrMode: 'auto'
  });
  const icd = icdCompute();
  out.boostCut = {
    cut: knockBoostCutInfo(),
    findings: diagnoseEngine().findings.map(f => f.sev + ':' + f.id),
    icdWarnCR: (ICD.cfg && ICD.cfg.warnings ? ICD.cfg.warnings(icd).edCR : '') || ''
  };

  // 5. Crevice efficiency factor
  out.crevice = { c10: creviceEta(10), c14: creviceEta(14), c18: creviceEta(18) };

  // 6. Stock presets sanity: no false pmax/preign errors
  out.stock = [];
  for (const nm of ['Ferrari F140 V12 (812 Superfast)', 'Porsche 3.7 twin-turbo flat-six (911 Turbo S 992)', 'Audi 2.5 TFSI (RS3 8V)', 'VW EA288 2.0 TDI (Golf 150)']) {
    load(nm);
    const bad = diagnoseEngine().findings.filter(f => f.id === 'pmax' || f.id === 'preign').map(f => f.id);
    out.stock.push({ nm, pMax: +engine.peakPmax.toFixed(1), preIgn: +engine.peakPreIgn.toFixed(3), bad });
  }
  return out;
});

if (r.crSync.petrolMin !== '8' || r.crSync.petrolMax !== '18') fails.push('edCR bounds for petrol4 expected 8..18, got ' + JSON.stringify(r.crSync));
if (Math.abs(r.crSync.builtCR - 16.5) > 1e-6) fails.push('petrol4 CR 16.5 was clamped to ' + r.crSync.builtCR);
if (r.dieselMax !== '24') fails.push('edCR max for diesel expected 24, got ' + r.dieselMax);

if (r.na812.pMax >= r.na812.pLim || r.na812.findings.includes('pmax')) fails.push('812 NA should stay under pMax limit: ' + JSON.stringify(r.na812));
if (r.turbo812E85.pMax <= 140) fails.push('812 + turbo 15:1 E85 expected pMax > 140, got ' + r.turbo812E85.pMax);
if (!r.turbo812E85.findings.includes('err:pmax')) fails.push('812 + turbo 15:1 E85 missing err:pmax: ' + JSON.stringify(r.turbo812E85.findings));
if (r.turbo812E85.wearCause !== 'OVER-PRESSURE' || !(r.turbo812E85.healthAfter < 1)) fails.push('expected OVER-PRESSURE wear on E85: ' + JSON.stringify(r.turbo812E85));

if (!(r.preIgn.peakPreIgn >= 1.0)) fails.push('expected peakPreIgn >= 1.0, got ' + r.preIgn.peakPreIgn);
if (!r.preIgn.findings.includes('err:preign')) fails.push('missing err:preign: ' + JSON.stringify(r.preIgn.findings));
if (!(r.preIgn.livePreIgn >= 1.0) || !(r.preIgn.healthAfter < 1)) fails.push('expected live pre-ignition wear: ' + JSON.stringify(r.preIgn));

if (!r.boostCut.cut || !(r.boostCut.cut.maxCut > 0.05)) fails.push('expected knock boost cut > 0.05 bar: ' + JSON.stringify(r.boostCut));
if (!r.boostCut.findings.includes('info:knockboost')) fails.push('missing info:knockboost: ' + JSON.stringify(r.boostCut.findings));

if (Math.abs(r.crevice.c10 - 1) > 1e-9 || !(r.crevice.c18 < r.crevice.c14 && r.crevice.c14 < r.crevice.c10)) fails.push('creviceEta ordering failed: ' + JSON.stringify(r.crevice));

// build 479 (owner's ruling), named gap: retiring the catalyst ramp (build 476) correctly gives ~2% more charge, and the
// RS3 reaches 142.9 bar against the generic PMAX_LIMIT_SI of 140 (139.8 before). No per-engine rating is published.
// It may only shrink: the cap is the measured value.
const PMAX_KNOWN = { 'Audi 2.5 TFSI (RS3 8V)': 142.9 };
for (const s of r.stock) {
  const cap = PMAX_KNOWN[s.nm];
  if (cap != null && s.bad.length === 1 && s.bad[0] === 'pmax' && s.pMax <= cap + 0.05) continue;
  if (s.bad.length) fails.push('false error on stock preset ' + s.nm + ': ' + JSON.stringify(s));
}
if (errors.length) fails.push(...errors);

console.log('test263:', JSON.stringify({
  crSync: r.crSync,
  na812Pmax: +r.na812.pMax.toFixed(1),
  turbo812E85: { pMax: +r.turbo812E85.pMax.toFixed(1), wear: r.turbo812E85.wearCause },
  preIgn: { peak: +r.preIgn.peakPreIgn.toFixed(2), findings: r.preIgn.findings },
  boostCut: { cut: r.boostCut.cut && +r.boostCut.cut.maxCut.toFixed(2), findings: r.boostCut.findings },
  crevice: r.crevice
}));
await browser.close();
if (fails.length) { console.error('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
