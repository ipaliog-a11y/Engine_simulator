// WHY THIS EXISTS (guided build, finish screen): FINISH on SHAPE IT shows the build against the factory car it started
// from (plans/guided-build.md, build 3). What must hold:
//   · the figures are the scorecard's (engine.score), perf's and the car's after a full BUILD, not new estimates;
//   · the factory column is the car as loaded, and the chosen goal's row is highlighted;
//   · the limit line is the lit card's own verdict (ENGINE: knock or valve float; VEHICLE: tyre rating or grip);
//   · BACK TO STEPS returns to the steps; START OVER restores the factory car's form; DRIVE IT opens VEHICLE;
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
const form = () => page.evaluate(() => [...document.querySelectorAll('#designPanel input,#designPanel select,#vehiclePanelTab input,#vehiclePanelTab select')].map(e => e.id + '=' + e.value).join('|'));
// the table as shown, and the figures a full BUILD gives now
const table = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.gf-tab tbody tr')].map(r => [r.dataset.k, [...r.cells].slice(1, 3).map(c => c.textContent)])));
const built = () => page.evaluate(() => { buildEngine(); const f = gfFigures(), a = guided.base;
  const out = {}; for (const [k, , u, dp] of GF_ROWS) { const g = v => v == null ? '—' : (u === '$' ? '$' : '') + dcFmt(v, dp) + (u === '$' ? '' : u); out[k] = [g(a[k]), g(f[k])]; }
  const ri = icdCompute(), rc = vcdCompute();
  const lim = ri && (icdKnockOver(ri) || icdFloatShort(ri)) ? ICD.cfg.limits(ri).verdict : vcdTyresShort(rc) || vcdGripBound(rc) ? VCD.cfg.limits(rc).verdict : '';
  return { out, lim, line: document.getElementById('gfLimit').textContent, goal: document.querySelector('.gf-tab tr.on').dataset.k }; });
const check = async label => {
  const t = await table(), b = await built();
  console.log(label + ':\n  ' + Object.entries(t).map(([k, v]) => k + ' ' + v.join(' -> ')).join('\n  ') + '\n  limit: ' + b.line);
  for (const k in b.out) if (JSON.stringify(t[k]) !== JSON.stringify(b.out[k])) fails.push(label + ': ' + k + ' shows ' + t[k] + ', BUILD gives ' + b.out[k]);
  if (b.lim && b.line !== b.lim) fails.push(label + ': limit line is not the lit card\'s verdict: ' + b.lim);
  if (b.goal !== 't100') fails.push(label + ': highlighted row ' + b.goal + ', not 0–100 for QUICKEST');
  return t;
};
const i = await page.evaluate(() => FACTORY_CARS.findIndex(p => { const e = (FACTORY_ENGINES.find(x => x.name === p.engine) || {}).engine || {};
  return e.type !== 'electric' && !e.hyMode && (e.intake || 'na') === 'na' && !['rotary', 'diesel', 'twostroke'].includes(e.type); }));
await page.evaluate(i => { guided.goal = 'quick'; gbShapeCar(i); }, i);
const f0 = await form();

// skip every step: both columns are the factory car
await page.click('#gwSkip');
const t0 = await check('skipped');
for (const k in t0) if (t0[k][0] !== t0[k][1]) fails.push('skipped: ' + k + ' differs from the factory car');

// back to the steps, raise the redline to its top and take weight out: the figures follow a full BUILD
await page.click('#gfSteps');
if (!(await page.evaluate(() => guided.step === 4))) fails.push('BACK TO STEPS did not return to the steps');
await page.evaluate(() => { for (const [id, v] of [['edRedline', 'max'], ['vhWeight', null]]) { const c = document.getElementById(id); if (!c || c.disabled) continue;
  if (v === 'max') c.value = c.max; else c.selectedIndex = Math.min(c.options.length - 1, c.selectedIndex + 2); gwSend(c, true); } gwFinish(); });
const t1 = await check('changed');
if (t1.hp && t1.hp[0] === t1.hp[1] && t1.mass[0] === t1.mass[1]) fails.push('changed: nothing moved');

// START OVER: the factory car's form; DRIVE IT: the VEHICLE tab
await page.evaluate(() => gwFinish());
await page.click('#gfOver');
if ((await form()) !== f0) fails.push('START OVER did not restore the factory car');
if (!(await page.evaluate(() => guided.step === 4 && guided.ws === 0))) fails.push('START OVER did not reopen the first step');
await page.evaluate(() => gwFinish());
await page.click('#gfDrive');
if (!(await page.evaluate(() => document.getElementById('guided').hidden && document.querySelector('#vehiclePanelTab').offsetParent !== null))) fails.push('DRIVE IT did not open the VEHICLE tab');
await browser.close();
fails.push(...errors);
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');
process.exit(fails.length ? 1 : 0);
