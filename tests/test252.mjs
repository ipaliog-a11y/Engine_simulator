// WHY THIS EXISTS (guided build, goal hints): each step of SHAPE IT shows, under each field, what the next value down
// and up do to the goal chosen in the three questions (plans/guided-build.md, build 2). What must hold:
//   · the hint's direction (toward/away from QUICKEST) matches the sign of icdCompute's change in peak power;
//   · after the hints run, the form, `engine`, `vehicle` and `perf` are exactly as before;
//   · an engine step's hints finish in under 1 s;
//   · a vehicle step's hints finish, and fields that enable others (fuel, intake) get none;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href + '?title=1', { waitUntil: 'networkidle' });
await page.click('#titleScreen .title-menu button[data-go="guided"]');
const done = () => page.waitForFunction(() => document.getElementById('gbBody').dataset.hints === 'done', null, { timeout: 60000 });
const snap = () => page.evaluate(() => {
  window._t251 = window._t251 || {};
  return { form: [...document.querySelectorAll('#designPanel input,#designPanel select,#vehiclePanelTab input,#vehiclePanelTab select')].map(e => e.id + '=' + e.value).join('|'),
    eng: engine === window._t251.e, veh: vehicle === window._t251.v, perf: perf === window._t251.p, hp: engine.score && engine.score.peakHP };
});
const goStep = k => page.evaluate(k => { guided.ws = gwSteps().indexOf(k); renderGuided(); }, k);
// the first naturally aspirated petrol car, goal QUICKEST
const i = await page.evaluate(() => FACTORY_CARS.findIndex(p => { const e = (FACTORY_ENGINES.find(x => x.name === p.engine) || {}).engine || {};
  return e.type !== 'electric' && !e.hyMode && (e.intake || 'na') === 'na' && !['rotary', 'diesel', 'twostroke'].includes(e.type); }));
await page.evaluate(i => { guided.goal = 'quick'; gbShapeCar(i); }, i);
await done();
await page.evaluate(() => { window._t251 = { e: engine, v: vehicle, p: perf }; });
const before = await snap();

// an engine step: bore and stroke
await goStep('bore'); await done();
const bore = await page.evaluate(() => {
  const c = document.getElementById('edBore'), keep = c.value, base = icdCompute().hp, n = gwNear(c, 1);
  c.value = n.v; const hi = icdCompute().hp; c.value = keep;
  return { ms: guided.hintMs, text: document.querySelector('.gw-hint[data-h="edBore"]').textContent, d: hi - base, v: n.t };
});
console.log('bore step: ' + Math.round(bore.ms) + ' ms\n  ' + bore.text.replace(/\n/g, '\n  '));
if (!(bore.ms < 1000)) fails.push('engine step hints took ' + Math.round(bore.ms) + ' ms (limit 1000)');
const up = bore.text.split('\n').find(l => l.startsWith('Higher (' + bore.v + ')')) || '';
const want = Math.round(bore.d) > 0 ? 'toward QUICKEST' : Math.round(bore.d) < 0 ? 'away from QUICKEST' : null;
if (!up) fails.push('no "Higher" line for the bore');
else if (want ? !up.includes(want) : /toward|away/.test(up)) fails.push('bore hint "' + up + '" does not match icdCompute (' + bore.d.toFixed(1) + ' hp)');

// fuel and compression: the coupled fields (fuel, intake) get no hint
for (const k of ['fuel', 'cr']) {
  await goStep(k); await done();
  const h = await page.evaluate(() => [...document.querySelectorAll('.gw-hint')].map(p => p.dataset.h));
  console.log(k + ' step hints: ' + h.join(', '));
  if (h.includes('edFuel') || h.includes('edIntake')) fails.push(k + ': a coupled field has a hint');
  if (k === 'cr' && !h.includes('edCR')) fails.push('no hint for compression');
}

// a vehicle step: mass (rebuilds the car at each neighbour)
await goStep('mass'); await done();
const mass = await page.evaluate(() => ({ ms: guided.hintMs, text: document.querySelector('.gw-hint[data-h="vhWeight"]').textContent }));
console.log('mass step: ' + Math.round(mass.ms) + ' ms\n  ' + mass.text.replace(/\n/g, '\n  '));
if (!/s, (toward|away from) QUICKEST|no change/.test(mass.text)) fails.push('mass hint names no 0–100 change: ' + mass.text);

const after = await snap();
if (after.form !== before.form) fails.push('the form changed after the hints');
for (const k of ['eng', 'veh', 'perf']) if (!after[k]) fails.push(k + ' was replaced by a hint');
if (after.hp !== before.hp) fails.push('engine peak power changed: ' + before.hp + ' -> ' + after.hp);
await browser.close();
fails.push(...errors);
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');
process.exit(fails.length ? 1 : 0);
