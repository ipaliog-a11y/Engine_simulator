// WHY THIS EXISTS: E12 Crankshaft torsional natural frequency, firing-order resonance & crank damper.
// What must hold:
//   · default crankDamper is 'stock', and all stock presets have dampedOk === true (no unexpected wear);
//   · longer stroke and more cylinders (I6 vs I4) lower crankTorsionalHz;
//   · rotary disables #edCrankDamper and has torsional.applicable === false;
//   · removing the damper ('none') on an engine with a critical resonance in range flags TORSIONAL RESONANCE
//     in diagnoseEngine() and adds crank/bearing wear in stepWear() at worstResRpm;
//   · fitting 'fluid' (FLUID / RACE DAMPER) suppresses the resonance wear and adds derived mass/cost;
//   · #dynoResult displays crank torsional Hz; no console or page errors.
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
  out.defDamper = engine.crankDamper;
  out.defTors = Object.assign({}, engine.torsional);

  // Check all presets at stock damper
  out.presetBad = [];
  for (const p of PRESETS) {
    const t = computeCrankTorsional(Object.assign({}, DEFAULT_ENGINE, p.engine));
    if (t && t.applicable && !t.dampedOk) {
      out.presetBad.push({ name: p.name, hz: t.crankTorsionalHz, rpm: t.worstResRpm, stress: t.severity });
    }
  }

  // Geometry trends: longer stroke lowers Hz; I6 lowers Hz vs I4 at same bore/stroke
  const tI4_short = computeCrankTorsional({ type: 'petrol4', layout: 'inline', cylinders: 4, bore_mm: 86, stroke_mm: 76, redline: 7500, crankDamper: 'stock' });
  const tI4_long  = computeCrankTorsional({ type: 'petrol4', layout: 'inline', cylinders: 4, bore_mm: 86, stroke_mm: 105, redline: 7500, crankDamper: 'stock' });
  const tI6_same  = computeCrankTorsional({ type: 'petrol4', layout: 'inline', cylinders: 6, bore_mm: 86, stroke_mm: 76, redline: 7500, crankDamper: 'stock' });
  out.hz = { i4Short: tI4_short.crankTorsionalHz, i4Long: tI4_long.crankTorsionalHz, i6Same: tI6_same.crankTorsionalHz };

  // Rotary disables damper
  const rot = PRESETS.find(x => x.name.includes('Rotary'));
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, rot.engine));
  syncDesignEnable();
  buildEngine();
  out.rot = { dis: document.getElementById('edCrankDamper').disabled, applicable: engine.torsional.applicable };

  // 3.0 Turbo I6: stock vs none (solid pulley) vs fluid damper
  const i6p = PRESETS.find(x => x.name.includes('3.0 Turbo I6'));
  const runCase = damper => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, i6p.engine, { crankDamper: damper }));
    syncDesignEnable();
    buildEngine();
    const resRpm = engine.torsional.worstResRpm || 5000;
    const prevWear = wearEnabled;
    wearEnabled = true;
    state.engineHealth = 1.0; state.blown = false; state.wearCause = '';
    state.firing = true; state.rpm = resRpm; state.oil = 100; state.coolant = 90; state.afr = engine.stoichAFR; state.map = 0.8;
    state.knockRisk = 0; state.cylPmax = 40; state.bmep = 5; state.powerHP = 50; state.latG = 0; state.sumpStarve = 0;
    for (let i = 0; i < 20; i++) stepWear(0.1);
    const health = state.engineHealth, cause = state.wearCause;
    wearEnabled = prevWear;
    document.getElementById('dynoResult').hidden = false;
    renderDynoResult(true);
    const diag = diagnoseEngine().findings.map(f => f.id);
    return {
      tors: Object.assign({}, engine.torsional),
      hp: engine.score.peakHP,
      tq: engine.score.peakTQ,
      mass: engineMass(),
      cost: engine.cost,
      health,
      cause,
      diag,
      dynoHtml: document.getElementById('dynoResult').innerHTML
    };
  };

  out.i6Stock = runCase('stock');
  out.i6None  = runCase('none');
  out.i6Fluid = runCase('fluid');

  return out;
});

if (r.defDamper !== 'stock') fails.push(`default crankDamper is ${r.defDamper}, expected 'stock'`);
if (r.presetBad.length) fails.push(`stock presets triggered torsional resonance: ${JSON.stringify(r.presetBad)}`);
if (!(r.hz.i4Long < r.hz.i4Short)) fails.push(`longer stroke did not lower crankTorsionalHz: ${r.hz.i4Short.toFixed(1)} -> ${r.hz.i4Long.toFixed(1)}`);
if (!(r.hz.i6Same < r.hz.i4Short)) fails.push(`I6 did not lower crankTorsionalHz vs I4: I4=${r.hz.i4Short.toFixed(1)}, I6=${r.hz.i6Same.toFixed(1)}`);
if (!r.rot.dis || r.rot.applicable) fails.push(`rotary should disable #edCrankDamper and have applicable=false: ${JSON.stringify(r.rot)}`);

if (!r.i6Stock.tors.dampedOk) fails.push('3.0 I6 at stock damper should be dampedOk');
if (r.i6None.tors.dampedOk) fails.push('3.0 I6 with solid pulley (none) should have dampedOk=false');
if (!r.i6None.diag.includes('torsional')) fails.push(`diagnoseEngine() missing torsional finding for none: ${JSON.stringify(r.i6None.diag)}`);
if (r.i6None.cause !== 'TORSIONAL RESONANCE' || !(r.i6None.health < r.i6Stock.health)) {
  fails.push(`none damper at resonance RPM did not add TORSIONAL RESONANCE wear: cause=${r.i6None.cause}, health=${r.i6None.health} vs stock=${r.i6Stock.health}`);
}
if (!r.i6Fluid.tors.dampedOk) fails.push('3.0 I6 with fluid damper should be dampedOk=true');
if (r.i6Fluid.diag.includes('torsional')) fails.push('fluid damper should clear torsional finding');
if (!(r.i6Fluid.health >= r.i6Stock.health - 1e-6)) fails.push(`fluid damper should suppress resonance wear: health=${r.i6Fluid.health}`);
if (r.i6Fluid.cost - r.i6Stock.cost !== 450) fails.push(`fluid damper cost delta $${r.i6Fluid.cost - r.i6Stock.cost}, expected $450`);
if (r.i6Fluid.mass - r.i6Stock.mass < 1 || r.i6Fluid.mass - r.i6Stock.mass > 2) fails.push(`fluid damper mass delta ${r.i6Fluid.mass - r.i6Stock.mass} kg, expected 1-2 kg`);
if (r.i6Fluid.hp !== r.i6Stock.hp || r.i6Fluid.tq !== r.i6Stock.tq) fails.push('crank damper should not alter steady-state dyno HP/TQ');
if (!r.i6Stock.dynoHtml.includes('crank torsional')) fails.push('dynoResult missing crank torsional Hz');

fails.push(...errors);
console.log(`I4(76mm)=${r.hz.i4Short.toFixed(0)}Hz | I4(105mm)=${r.hz.i4Long.toFixed(0)}Hz | I6(76mm)=${r.hz.i6Same.toFixed(0)}Hz | I6 none@res=${r.i6None.tors.worstResRpm}rpm health=${r.i6None.health.toFixed(4)} (${r.i6None.cause}) | fluid health=${r.i6Fluid.health.toFixed(4)}`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
