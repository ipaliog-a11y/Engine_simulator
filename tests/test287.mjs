// WHY THIS EXISTS: E11 Engine balance & NVH and optional balance shaft on the BLOCK card.
// What must hold:
//   · default balShaft is false, leaving default/preset power and torque unchanged;
//   · I6, F6, V12, and V8 have zero primary/secondary shaking force and couple (smoothness 100),
//     higher than I4 (secondary shaking force) and I3 / V6-90 (rocking couple);
//   · #edBalShaft is disabled on inherently balanced layouts (I6, F6, V12, rotary) and enabled on I4/I3/V6;
//   · fitting the optional balance shaft on I4 cancels f2_N (smoothness -> 100) and adds derived
//     bearing/drive friction (FMEP), mass (+4.5 kg), and cost (+$550);
//   · smoothness appears in #designSummary and #dynoResult;
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
  out.defBal = engine.balShaft;
  out.defHp = engine.score.peakHP;
  out.defTq = engine.score.peakTQ;
  out.defDis = document.getElementById('edBalShaft').disabled;

  const loadPreset = name => {
    const p = PRESETS.find(x => x.name.includes(name));
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine));
    buildEngine();
    return {
      bal: Object.assign({}, engine.balance),
      dis: document.getElementById('edBalShaft').disabled,
      hp: engine.score.peakHP,
      tq: engine.score.peakTQ,
      mass: engineMass(),
      cost: engine.cost
    };
  };

  out.i6 = loadPreset('3.0 Turbo I6');
  out.f6 = loadPreset('Porsche 4.0 flat-six');
  out.v12 = loadPreset('6.5 V12 NA');
  out.v8 = loadPreset('5.0 V8 NA');
  out.i3 = loadPreset('1.0 Kei Turbo I3');
  out.v6 = loadPreset('Buick LC2');
  out.rot = loadPreset('1.3 Rotary NA');

  // Default I4 baseline
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE));
  buildEngine();
  out.i4_0 = {
    bal: Object.assign({}, engine.balance),
    dis: document.getElementById('edBalShaft').disabled,
    hp: engine.score.peakHP,
    tq: engine.score.peakTQ,
    mass: engineMass(),
    cost: engine.cost,
    fmep: mechFrictionMEP(5000, 1.0, 1)
  };

  // Fit optional balance shaft on I4
  const sel = document.getElementById('edBalShaft');
  sel.value = 'yes';
  sel.dispatchEvent(new Event('change'));
  buildEngine();
  document.getElementById('dynoResult').hidden = false;
  renderDynoResult(true);
  out.i4_1 = {
    bal: Object.assign({}, engine.balance),
    hp: engine.score.peakHP,
    tq: engine.score.peakTQ,
    mass: engineMass(),
    cost: engine.cost,
    fmep: mechFrictionMEP(5000, 1.0, 1),
    sumHtml: document.getElementById('designSummary').innerHTML,
    dynoHtml: document.getElementById('dynoResult').innerHTML
  };

  return out;
});

if (r.defBal !== false) fails.push(`default balShaft is ${r.defBal}, expected false`);
if (r.defDis) fails.push('#edBalShaft should be enabled on default I4');

for (const [k, v] of [['I6', r.i6], ['F6', r.f6], ['V12', r.v12], ['V8', r.v8]]) {
  if (v.bal.f1_N !== 0 || v.bal.f2_N !== 0) fails.push(`${k} has non-zero shaking force: f1=${v.bal.f1_N}, f2=${v.bal.f2_N}`);
  if (v.bal.m1_Nm !== 0 || v.bal.m2_Nm !== 0) fails.push(`${k} has non-zero rocking couple: m1=${v.bal.m1_Nm}, m2=${v.bal.m2_Nm}`);
  if (v.bal.smoothness !== 100) fails.push(`${k} smoothness is ${v.bal.smoothness}, expected 100`);
  if (!v.dis) fails.push(`#edBalShaft should be disabled on balanced ${k}`);
}
if (!r.rot.dis) fails.push('#edBalShaft should be disabled on rotary');

if (!(r.i4_0.bal.f2_N > 1000)) fails.push(`I4 secondary shaking force ${r.i4_0.bal.f2_N} N unexpectedly small`);
if (!(r.i4_0.bal.smoothness < 100)) fails.push(`I4 smoothness ${r.i4_0.bal.smoothness} should be < 100`);
if (!(r.i3.bal.totalMoment_Nm > 0 && r.i3.bal.smoothness < 100)) fails.push(`I3 should have rocking couple (${r.i3.bal.totalMoment_Nm} Nm) and smoothness < 100`);
if (!(r.v6.bal.totalMoment_Nm > 0 && r.v6.bal.smoothness < 100)) fails.push(`V6-90 should have rocking couple (${r.v6.bal.totalMoment_Nm} Nm) and smoothness < 100`);
if (r.i3.dis || r.v6.dis) fails.push('#edBalShaft should be enabled on I3 and V6-90');

if (r.i4_1.bal.f2_N !== 0) fails.push(`I4 with balance shaft still has f2_N=${r.i4_1.bal.f2_N}`);
if (r.i4_1.bal.smoothness !== 100) fails.push(`I4 with balance shaft smoothness=${r.i4_1.bal.smoothness}, expected 100`);
if (!(r.i4_1.fmep > r.i4_0.fmep)) fails.push(`balance shaft did not add friction: ${r.i4_0.fmep.toFixed(4)} -> ${r.i4_1.fmep.toFixed(4)}`);
if (r.i4_1.mass - r.i4_0.mass !== 5 && r.i4_1.mass - r.i4_0.mass !== 4) fails.push(`I4 balance shaft mass delta ${r.i4_1.mass - r.i4_0.mass} kg, expected ~4.5`);
if (r.i4_1.cost - r.i4_0.cost !== 550) fails.push(`I4 balance shaft cost delta $${r.i4_1.cost - r.i4_0.cost}, expected $550`);
if (!(r.i4_1.hp <= r.i4_0.hp)) fails.push(`balance shaft should not increase peak HP: ${r.i4_0.hp} -> ${r.i4_1.hp}`);
if (!r.i4_1.sumHtml.includes('100/100') || !r.i4_1.sumHtml.includes('BALANCE SHAFT')) fails.push('designSummary missing smoothness or BALANCE SHAFT');
if (!r.i4_1.dynoHtml.includes('100/100')) fails.push('dynoResult missing smoothness');

fails.push(...errors);
console.log(`I6/F6/V12/V8: 100/100 | I4: ${r.i4_0.bal.smoothness}/100 (${Math.round(r.i4_0.bal.f2_N)} N) -> w/ balShaft: ${r.i4_1.bal.smoothness}/100 (FMEP ${r.i4_0.fmep.toFixed(3)}->${r.i4_1.fmep.toFixed(3)} bar) | I3: ${r.i3.bal.smoothness}/100 | V6-90: ${r.v6.bal.smoothness}/100`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
