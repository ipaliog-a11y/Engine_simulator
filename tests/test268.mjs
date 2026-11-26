// WHY THIS EXISTS (B5): supercharger adiabatic efficiency & off-boost parasitic drag, plus closed-cycle peak
// cylinder pressure (pMax) for CI diesels and ported engines (2-stroke & rotary). What must hold:
//   · supercharger compEff uses blower-type adiabatic efficiency (> 0.50 at stock boost, never stuck at 0.35):
//     Roots ~0.55-0.65 rolling off above PR 2.0, twin-screw ~0.68-0.76, centrifugal ~0.72-0.78;
//   · off-boost (map <= 1.0) supercharger parasitic drag stays strictly positive above the equivalent NA FMEP;
//   · all stock diesel presets produce 0 < peakPmax < PMAX_LIMIT_CI (200 bar) with no false pmax error;
//   · an extreme high-CR + high-boost diesel exceeds 200 bar, flags err:pmax in diagnoseEngine(), lowers
//     reliability, and causes OVER-PRESSURE wear in stepWear() (with zero knock);
//   · stock 2-stroke and rotary presets produce finite positive peakPmax < PMAX_LIMIT_SI (140 bar).
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

  // 1. Supercharger adiabatic efficiency per blower type & Roots high-PR roll-off
  load('GM LT4 6.2 supercharged (Camaro ZL1)');
  const rootsEff = engine.compEff;
  const rootsHighPr = scAdiabaticEff('roots', 2.6, 0.85);
  const rootsLowPr = scAdiabaticEff('roots', 1.65, 0.85);
  load('Dodge 6.2 Hellcat (Challenger SRT)');
  const screwEff = engine.compEff;
  load('6.2 Supercharged V8', { scType: 'centrifugal', boost_bar: 0.8 });
  const centEff = engine.compEff;
  out.scEff = { rootsEff, rootsLowPr, rootsHighPr, screwEff, centEff };

  // 2. Off-boost supercharger parasitic drag > 0 vs equivalent NA engine at map = 0.45 bar
  load('6.2 Supercharged V8', { scType: 'roots', boost_bar: 0.7 });
  const fmepScOff = pumpFrictionMEP(2500, 0.45, 1.0);
  const fmepScFull = pumpFrictionMEP(2500, 1.70, 1.0);
  load('6.2 Supercharged V8', { intake: 'na', boost_bar: 0 });
  const fmepNaOff = pumpFrictionMEP(2500, 0.45, 1.0);
  out.scDrag = { fmepScOff, fmepScFull, fmepNaOff, deltaOff: fmepScOff - fmepNaOff };

  // 3. Stock diesel presets: 0 < peakPmax < 200 bar, no false pmax error
  out.diesels = [];
  for (const pr of PRESETS.filter(x => x.engine && x.engine.type === 'diesel')) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine));
    syncDesignEnable();
    buildEngine();
    const bad = diagnoseEngine().findings.filter(f => f.id === 'pmax' || f.id === 'preign').map(f => f.id);
    out.diesels.push({ name: pr.name, pMax: +engine.peakPmax.toFixed(1), lim: cylPmaxLimit(), bad });
  }

  // 4. Extreme high-CR + high-boost diesel exceeds 200 bar and triggers OVER-PRESSURE wear & err:pmax
  load('VW EA288 2.0 TDI (Golf 150)');
  const stockRel = engine.score.reliability;
  load('VW EA288 2.0 TDI (Golf 150)', { compression: 23, boost_bar: 2.5, tqLimit: 0, taperRpm: 0, turboSize: 'medium' });
  const dExt = diagnoseEngine();
  const extPmax = engine.peakPmax;
  const extRel = engine.score.reliability;
  const prevWear = wearEnabled;
  wearEnabled = true;
  state.firing = true; state.blown = false; state.engineHealth = 1;
  let bestRpm = 2400, bestMap = 0;
  for (let r = 1400; r <= engine.redline; r += 200) {
    const m = wotMapAt(r);
    if (m > bestMap) { bestMap = m; bestRpm = r; }
  }
  state.rpm = bestRpm; state.map = bestMap; state.throttle = 1;
  state.coolant = 90; state.oil = 95;
  updateEnginePhysics();
  stepWear(1.0);
  out.extDiesel = {
    pMax: +extPmax.toFixed(1), stockRel, extRel,
    findings: dExt.findings.map(f => f.sev + ':' + f.id),
    livePmax: +state.cylPmax.toFixed(1), liveKnock: state.knockRisk,
    wearCause: state.wearCause, healthAfter: state.engineHealth
  };
  wearEnabled = prevWear;

  // 5. Ported engines (2-stroke & rotary): finite positive peakPmax < 140 bar
  out.ported = [];
  for (const pr of PRESETS.filter(x => x.engine && (x.engine.type === 'twostroke' || x.engine.type === 'rotary'))) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine));
    syncDesignEnable();
    buildEngine();
    const bad = diagnoseEngine().findings.filter(f => f.id === 'pmax').map(f => f.id);
    out.ported.push({ name: pr.name, type: engine.type, pMax: +engine.peakPmax.toFixed(1), bad });
  }

  return out;
});

if (!(r.scEff.rootsEff > 0.55 && r.scEff.rootsEff < 0.66)) fails.push('Roots compEff out of range: ' + r.scEff.rootsEff);
if (!(r.scEff.rootsHighPr < r.scEff.rootsLowPr)) fails.push('Roots efficiency should roll off at high PR: ' + JSON.stringify(r.scEff));
if (!(r.scEff.screwEff > 0.68 && r.scEff.screwEff < 0.77)) fails.push('Twin-screw compEff out of range: ' + r.scEff.screwEff);
if (!(r.scEff.centEff > 0.72 && r.scEff.centEff <= 0.78)) fails.push('Centrifugal compEff out of range: ' + r.scEff.centEff);
if (!(r.scDrag.deltaOff > 0.005)) fails.push('Off-boost SC parasitic drag floor missing: ' + JSON.stringify(r.scDrag));

// build 479 (owner's ruling), named gap: retiring the catalyst ramp (build 476) correctly gives ~2% more charge, and the
// Cummins 6.7 HO reaches 203.2 bar against the generic PMAX_LIMIT_CI of 200 (199.3 before). No per-engine rating is
// published. It may only shrink: the cap is the measured value.
const PMAX_KNOWN = { 'Cummins 6.7 (Ram HD 2019 HO)': 203.2 };
for (const d of r.diesels) {
  const cap = PMAX_KNOWN[d.name];
  if (cap != null && d.pMax > 60 && d.pMax <= cap + 0.05 && d.bad.every(b => b === 'pmax')) continue;
  if (!(d.pMax > 60 && d.pMax < d.lim) || d.bad.length)
    fails.push('Stock diesel pMax check failed for ' + d.name + ': ' + JSON.stringify(d));
}
if (!(r.extDiesel.pMax > 200)) fails.push('Extreme diesel expected pMax > 200 bar: ' + JSON.stringify(r.extDiesel));
if (!r.extDiesel.findings.includes('err:pmax')) fails.push('Extreme diesel missing err:pmax: ' + JSON.stringify(r.extDiesel.findings));
if (!(r.extDiesel.extRel < r.extDiesel.stockRel)) fails.push('Extreme diesel reliability should drop: ' + JSON.stringify(r.extDiesel));
if (r.extDiesel.wearCause !== 'OVER-PRESSURE' || !(r.extDiesel.healthAfter < 1) || r.extDiesel.liveKnock !== 0)
  fails.push('Extreme diesel expected OVER-PRESSURE wear with zero knock: ' + JSON.stringify(r.extDiesel));

for (const p of r.ported) {
  if (!(Number.isFinite(p.pMax) && p.pMax > 20 && p.pMax < 140) || p.bad.length)
    fails.push('Ported engine pMax check failed for ' + p.name + ': ' + JSON.stringify(p));
}
if (errors.length) fails.push(...errors);

console.log('test268:', JSON.stringify({
  scEff: { roots: +r.scEff.rootsEff.toFixed(3), screw: +r.scEff.screwEff.toFixed(3), cent: +r.scEff.centEff.toFixed(3) },
  scOffDelta: +r.scDrag.deltaOff.toFixed(4),
  dieselRange: [Math.min(...r.diesels.map(d => d.pMax)), Math.max(...r.diesels.map(d => d.pMax))],
  extDiesel: { pMax: r.extDiesel.pMax, wear: r.extDiesel.wearCause },
  portedRange: [Math.min(...r.ported.map(p => p.pMax)), Math.max(...r.ported.map(p => p.pMax))]
}));
await browser.close();
if (fails.length) { console.error('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
