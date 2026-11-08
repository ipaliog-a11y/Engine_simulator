// Dyno diagnosis: specs, scorecard and as-tuned pull → suggestions (build 248).
//
// WHY THIS EXISTS. The DYNO tab showed peaks and a grade, but not what to change when the engine was not running
// smoothly. diagnoseEngine() reads the same limits WHAT HOLDS IT BACK and the scorecard already use, and the result
// sheet shows them. What must hold:
//   · diagnoseEngine() returns findings with sev / id / title / detail / suggest after a build;
//   · a factory mild engine is smooth (no err, no float/knock/lope);
//   · valve float before the redline and knock past the ECU each produce an err finding with a suggestion;
//   · a lean/cold as-tuned pull that sits under best-power is named as a tune finding;
//   · the DYNO result sheet renders #dynoDiag; an electric drive also gets a diagnosis block;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], fails = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const load = name => page.evaluate(name => {
  const p = PRESETS.find(q => q.name === name);
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine));
  buildEngine();
  return { name: engine.name, hp: engine.score.peakHP, float: engine.floatRpm, redline: engine.redline };
}, name);

// 1. API shape on a mild factory engine
const mild = await load('1.6 Sport NA I4');
const d0 = await page.evaluate(() => {
  const d = diagnoseEngine();
  return { ok: d.ok, smooth: d.smooth, n: d.findings.length, ids: d.findings.map(f => f.id),
    shape: d.findings.every(f => f.sev && f.id && f.title && f.detail && f.suggest),
    grade: d.grade };
});
console.log(`== mild ${mild.name}: smooth=${d0.smooth} ok=${d0.ok} findings=[${d0.ids}] grade ${d0.grade} ==`);
if (!d0.shape && d0.n) fails.push('a finding is missing sev/id/title/detail/suggest');
if (d0.ids.some(id => id === 'float' || id === 'knock' || id === 'lope' || id === 'blown'))
  fails.push('a mild factory engine should not report float/knock/lope/blown: ' + d0.ids.join(','));

// 2. valve float: redline above the valvetrain
const float = await page.evaluate(() => {
  document.getElementById('edRedline').value = 9500;
  document.getElementById('edSpring').value = 'stock';
  document.getElementById('edCam').value = 'race';
  buildEngine();
  const d = diagnoseEngine();
  return { float: engine.floatRpm, redline: engine.redline, ids: d.findings.map(f => f.id),
    floatFinding: d.findings.find(f => f.id === 'float'), ok: d.ok, smooth: d.smooth };
});
console.log(`== float: floatRpm ${float.float} / redline ${float.redline}; ids=[${float.ids}] ==`);
if (!(float.float > 0 && float.float < float.redline)) fails.push('the float setup did not put float under the redline');
if (!float.floatFinding || float.ok || float.smooth) fails.push('valve float did not produce an err diagnosis');
if (float.floatFinding && !/spring|valve|redline|cam/i.test(float.floatFinding.suggest))
  fails.push('float suggestion does not name a fix: ' + float.floatFinding.suggest);

// 3. knock past the ECU: high CR, low octane, fixed timing, boost
const knock = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4').engine));
  document.getElementById('edCR').value = 14;
  document.getElementById('edOctane').value = 87;
  document.getElementById('edTiming').value = 'fixed';
  document.getElementById('edIgnAdv').value = 32;
  buildEngine();
  const d = diagnoseEngine();
  return { safety: engine.score.safety, ids: d.findings.map(f => f.id),
    knockFinding: d.findings.find(f => f.id === 'knock'), ok: d.ok };
});
console.log(`== knock: safety ${knock.safety}; ids=[${knock.ids}] ==`);
if (!knock.knockFinding || knock.ok) fails.push('knock past the ECU did not produce an err diagnosis');
if (knock.knockFinding && !/octane|compression|boost|timing|intercooler/i.test(knock.knockFinding.suggest))
  fails.push('knock suggestion does not name a fix: ' + knock.knockFinding.suggest);

// 4. as-tuned pull under best-power
const tune = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '1.6 Sport NA I4').engine));
  buildEngine();
  state.afr = engine.stoichAFR * 1.18;   // lean of best-power
  state.iat = 55;
  dynoCache = null;
  const d = diagnoseEngine();
  return { ids: d.findings.map(f => f.id), tune: d.findings.find(f => f.id === 'tune') };
});
console.log(`== tune gap: ids=[${tune.ids}] ==`);
if (!tune.tune) fails.push('a lean/hot as-tuned pull did not produce a tune finding');

// 5. the DYNO sheet shows the diagnosis; electric too
const ui = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '1.6 Sport NA I4').engine));
  buildEngine();
  setTab('dyno');
  renderDynoResult(true);
  const ice = { has: !!document.getElementById('dynoDiag'), text: (document.getElementById('dynoDiag') || {}).innerText || '' };
  document.getElementById('edType').value = 'electric';
  document.getElementById('edType').dispatchEvent(new Event('change'));
  if (typeof syncDesignEnable === 'function') syncDesignEnable();
  buildEngine();
  setTab('dyno');
  renderDynoResult(true);
  const ev = { has: !!document.getElementById('dynoDiag'), type: engine.type };
  return { ice, ev };
});
console.log(`== UI: ice diag ${ui.ice.has} ("${(ui.ice.text || '').slice(0, 60)}…"); ev type=${ui.ev.type} diag=${ui.ev.has} ==`);
if (!ui.ice.has || !/DIAGNOSIS/i.test(ui.ice.text)) fails.push('the dyno result sheet has no diagnosis block');
if (ui.ev.type !== 'electric' || !ui.ev.has) fails.push('an electric drive has no diagnosis on the dyno sheet');

if (errors.length) fails.push(...errors.slice(0, 5));
console.log(fails.length ? `FAIL (${fails.length}):\n- ` + fails.join('\n- ') : 'OK');
await browser.close();
process.exit(fails.length ? 1 : 0);
