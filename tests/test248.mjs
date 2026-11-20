// WHY THIS EXISTS (guided build, walk-through): SHAPE IT walks through the matched car's design one decision at a time,
// editing the real form (plans/guided-build.md, build 1). What must hold:
//   · each powertrain's start car (NA, turbo, diesel, rotary, two-stroke, EV, hybrid) shows its steps in the plan's order;
//   · an NA engine skips BOOST, and choosing a turbo in the walk-through adds it;
//   · a slider in a step sets the card's own form field;
//   · SKIP TO FINISH on an untouched car leaves the factory engine and form exactly as they loaded;
//   · no sideways scroll at phone width.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href + '?title=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];
await page.click('#titleScreen .title-menu button[data-go="guided"]');

// the first factory car of each powertrain
const cars = await page.evaluate(() => {
  const eng = p => (FACTORY_ENGINES.find(x => x.name === p.engine) || {}).engine || {};
  const kind = e => e.type === 'electric' ? 'ev' : e.hyMode ? 'hybrid' : e.type === 'diesel' ? 'diesel' : e.type === 'rotary' ? 'rotary' :
    e.type === 'twostroke' ? 'twostroke' : (e.intake || 'na') === 'na' ? 'na' : 'boosted';
  const out = {};
  FACTORY_CARS.forEach((p, i) => { const k = kind(eng(p)); if (!(k in out)) out[k] = i; });
  return out;
});
const E = ['body', 'mass', 'gears', 'tyres'];
const want = {
  na: ['cyl', 'bore', 'fuel', 'cr', 'head', 'redline', 'breath', ...E],
  boosted: ['cyl', 'bore', 'fuel', 'cr', 'boost', 'head', 'redline', 'breath', ...E],
  diesel: ['cyl', 'bore', 'cr', 'boost', 'head', 'redline', 'breath', ...E],
  rotary: ['cyl', 'bore', 'fuel', 'cr', 'boost?', 'redline', 'breath', ...E],
  twostroke: ['cyl', 'bore', 'fuel', 'cr', 'boost?', 'redline', 'breath', ...E],
  ev: ['motor', 'msize', 'wind', 'amps', 'pack', 'more', 'body', 'mass', 'fd', 'tyres'],
  hybrid: ['cyl', 'bore', 'fuel', 'cr', 'boost?', 'head', 'redline', 'breath', 'hybrid', 'msize', 'amps', 'pack', ...E],
};
const walk = async () => { // click NEXT through every step, reading each step's key
  const keys = [];
  for (let n = 0; n < 30; n++) {
    const s = await page.evaluate(() => { const g = document.getElementById('gwStep'); return g ? g.dataset.k : null; });
    if (!s) break; keys.push(s);
    const hs = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.getElementById('gbBody').scrollWidth > document.getElementById('gbBody').clientWidth);
    if (hs) fails.push('step ' + s + ' scrolls sideways at phone width');
    if (await page.evaluate(() => document.getElementById('gwNext').textContent) === 'FINISH') break;
    await page.click('#gwNext');
  }
  return keys;
};
for (const k of Object.keys(want)) if (!(k in cars)) fails.push('no factory car for ' + k);
for (const [k, i] of Object.entries(cars)) {
  await page.evaluate(i => { if (document.getElementById('guided').hidden) openGuided(); gbShapeCar(i); }, i);
  const got = await walk();
  const w = want[k].filter(x => !x.endsWith('?') || got.includes(x.slice(0, -1))).map(x => x.replace('?', ''));
  const name = await page.evaluate(i => FACTORY_CARS[i].name, i);
  console.log(`${k.padEnd(9)} ${name}: ${got.join(' ')}`);
  if (got.join() !== w.join()) fails.push(`${k} (${name}) steps ${got.join(' ')}, want ${w.join(' ')}`);
}

// NA: no BOOST until the walk-through chooses a turbo; a slider sets the card's field
await page.evaluate(i => gbShapeCar(i), cars.na);
await page.click('#gwNext'); // bore
const bore = await page.evaluate(() => {
  const r = document.querySelector('#gbBody input[type=range][data-f="edBore"]');
  r.value = 900; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
  return { form: +document.getElementById('edBore').value, box: +document.getElementById('gw-edBore').value };
});
console.log(`bore slider at 90%: form ${bore.form} mm, step box ${bore.box} mm`);
if (Math.abs(bore.form - 105) > 0.5 || bore.box !== bore.form) fails.push('the bore slider did not set the form: ' + JSON.stringify(bore));
await page.click('#gwNext'); await page.click('#gwNext'); // fuel, compression and air
const turbo = await page.evaluate(() => {
  const before = gwSteps().includes('boost');
  const s = document.getElementById('gw-edIntake'); s.value = 'turbo'; s.dispatchEvent(new Event('change', { bubbles: true }));
  return { before, after: gwSteps().includes('boost'), form: document.getElementById('edIntake').value, boostOn: !document.getElementById('edBoost').disabled };
});
console.log('NA → turbo in the walk-through: ' + JSON.stringify(turbo));
if (turbo.before || !turbo.after || turbo.form !== 'turbo' || !turbo.boostOn) fails.push('choosing a turbo did not add BOOST: ' + JSON.stringify(turbo));

// skip every step: the factory engine and the form stay as they loaded
const snap = () => page.evaluate(() => JSON.stringify({ e: [engine.displacement_L, engine.score && engine.score.peakHP, engine.cost], v: vehicle.cost,
  f: [...document.querySelectorAll('#designPanel input, #designPanel select, #vehiclePanelTab input, #vehiclePanelTab select')].map(c => c.id + '=' + c.value) }));
await page.evaluate(i => gbShapeCar(i), cars.boosted);
const s0 = await snap(), e0 = await page.evaluate(() => { window.__e0 = engine; return 1; });
await page.click('#gwSkip');
const s1 = await snap(), same = await page.evaluate(() => window.__e0 === engine && document.getElementById('guided').hidden && vizMode === 'vehicle');
console.log(`SKIP TO FINISH: form ${s0 === s1 ? 'unchanged' : 'CHANGED'}, engine ${same ? 'the same' : 'REBUILT'}`);
if (s0 !== s1 || !same) fails.push('SKIP TO FINISH changed the factory car');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
