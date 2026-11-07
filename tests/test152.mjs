// A hybrid's 12 V side runs off its pack through a DC-DC converter, not an alternator (build 246).
//
// WHY THIS EXISTS. Until build 246 the combustion physics charged every engine for an alternator: a constant belt drag
// (0.035 bar of friction for the 120 A one) and the torque to make the 12 V current. A hybrid has no alternator. The
// Prius, the Ioniq, the Qashqai e-POWER, the 330e and the 918 all run their 12 V side off the traction pack through a
// DC-DC converter, and the hybrid's own code already took the 12 V load from the pack. So its engine paid twice. Owner's
// report. What must hold:
//   · a hybrid's engine has no alternator: no belt drag, no charging torque, and the summary and report say DC-DC;
//   · the same engine without its hybrid system keeps its alternator, drag and charging torque as before;
//   · a hybrid's engine makes a little more power than the same engine with an alternator, never less;
//   · the ENGINE tab hides ALTERNATOR for a hybrid and shows it for an engine without one, and COOLING & ELECTRICS says
//     where the 12 V comes from;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const errors = [], fails = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });

const rows = await page.evaluate(async () => {
  const out = [];
  for (const pr of HYB_ENGINE_PRESETS) {
    const load = e => { applyBuild({ engine: e, tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: pr.name }); setTab('design'); };
    load(Object.assign({}, pr.engine));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hy = { drag: engine.altDragMEP, torque: electricalDragTorque(3000), maxA: engine.altMaxA, hp: engine.score.peakHP,
      summary: document.getElementById('designSummary').textContent, report: JSON.stringify(typeof reportRows === 'function' ? reportRows(engine) : ''),
      altShown: getComputedStyle(document.getElementById('edAlternator').closest('.field')).display !== 'none',
      card: document.querySelector('#icdRb-cool .evd-sum').textContent };
    load(Object.assign({}, pr.engine, { hyMode: 'none' }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ice = { drag: engine.altDragMEP, torque: electricalDragTorque(3000), maxA: engine.altMaxA, hp: engine.score.peakHP,
      altShown: getComputedStyle(document.getElementById('edAlternator').closest('.field')).display !== 'none' };
    out.push({ name: pr.name, hy, ice });
  }
  return out;
});
for (const r of rows) {
  console.log(`== ${r.name}: hybrid ${r.hy.hp} hp (drag ${r.hy.drag} bar, ${r.hy.torque.toFixed(2)} Nm at 3000) | ` +
    `without its hybrid ${r.ice.hp} hp (drag ${r.ice.drag} bar, ${r.ice.torque.toFixed(2)} Nm, ${r.ice.maxA} A) | card "${r.hy.card}" ==`);
  if (r.hy.drag !== 0 || r.hy.torque !== 0 || r.hy.maxA !== 0) fails.push(`${r.name}: the hybrid still pays for an alternator`);
  if (!(r.ice.drag > 0 && r.ice.torque > 0 && r.ice.maxA > 0)) fails.push(`${r.name}: without its hybrid the engine lost its alternator`);
  if (!/DC-DC/.test(r.hy.summary)) fails.push(`${r.name}: the design summary does not say DC-DC`);
  if (!/DC-DC/.test(r.hy.card)) fails.push(`${r.name}: COOLING & ELECTRICS does not say where the 12 V comes from`);
  if (r.hy.altShown) fails.push(`${r.name}: ALTERNATOR is shown for a hybrid`);
  if (!r.ice.altShown) fails.push(`${r.name}: ALTERNATOR is hidden without a hybrid system`);
  if (r.hy.hp < r.ice.hp) fails.push(`${r.name}: the engine makes less with no alternator (${r.hy.hp} < ${r.ice.hp} hp)`);
}
await browser.close();

if (errors.length) fails.push(...errors.slice(0, 5));
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: a hybrid\'s 12 V comes from its pack through a DC-DC converter, and only a hybrid\'s');
