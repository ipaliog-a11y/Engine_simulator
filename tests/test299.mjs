// WHY THIS EXISTS (build 480). The exhaust's back pressure gained the losses it lacked: the burnt gas's own mass and
// volume, the system's bends and tailpipe exit, and the pulse, traced per engine (exhaustPulsation). What must hold:
//   · an engine with a fill table carries Phi for its primary (one cylinder) and its system pipe, both > 1;
//   · the system pipe's Phi is below the primary's (merged pulses are smoother) and falls with speed;
//   · a ported engine (no trace) has no Phi and still gets a back pressure;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const load = n => { const pr = PRESETS.find(p => p.name.startsWith(n)); applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); syncDesignEnable(); buildEngine(); };
  load('1.6 Sport NA I4');
  const tb = engine.fillTable, lo = tb.find(t => t.rpm >= 2000), hi = tb.filter(t => t.rpm <= engine.redline).pop();
  const na = { phiPlo: lo.phiP, phiSlo: lo.phiS, phiPhi: hi.phiP, phiShi: hi.phiS };
  load('1.3 Rotary NA');
  const n = engine.redline * 0.9, T = exhaustGasT(1.0, n);
  return { na, rotaryHasPhi: !!(engine.fillTable && engine.fillTable[0] && engine.fillTable[0].phiP), rotaryBp: backPressureBar(n, T) };
});
const fails = [], f = x => x.toFixed(2);
console.log(`1.6 NA Phi primary ${f(r.na.phiPlo)} -> ${f(r.na.phiPhi)}, system ${f(r.na.phiSlo)} -> ${f(r.na.phiShi)} (2000 rpm -> redline)`);
console.log(`rotary: traced ${r.rotaryHasPhi}, back pressure ${r.rotaryBp.toFixed(3)} bar`);
if (!(r.na.phiShi > 1 && r.na.phiPhi > 1)) fails.push('Phi should exceed 1 on a pulsing exhaust');
if (!(r.na.phiShi < r.na.phiPhi && r.na.phiSlo < r.na.phiPlo)) fails.push('merged pulses should be smoother than one cylinder');
if (!(r.na.phiShi < r.na.phiSlo)) fails.push('the system pipe\'s Phi should fall with speed');
if (r.rotaryHasPhi || !(r.rotaryBp > 0)) fails.push('a ported engine should have no trace and still a back pressure');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL\n' + fails.map(x => '  - ' + x).join('\n')); process.exit(1); }
console.log('\nPASS');
