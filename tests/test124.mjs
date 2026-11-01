// The air filter: its restriction, and the part designer's air filters (build 210).
//
// WHY THIS EXISTS. Until build 210 the air filter was a fitted VE loss in proportion to rpm (stock -4% at the redline,
// open stacks +2%). Now it is the filter's own pressure drop at the flow it passes: the media by Darcy's law on its
// measured air permeability, the housing by its velocity head. The factory filters are sized to each engine's full flow
// at restrictions from measurements, and the PARTS page designs one. What must hold:
//   · the factory filters at the engine's peak power: stock (a clean OEM element in its airbox) within the 2-4 kPa
//     restriction gauges read on new filters at full throttle, restrictive (clogged) toward ORNL's 6-7 kPa, the open
//     element ~1 kPa, open stacks nothing; on an NA six, a turbo four and a turbodiesel;
//   · the physics: the drop grows with the flow (less at part load), paper passes less than oiled cotton and a
//     nanofibre layer less than plain paper, a wider inlet loses less and makes more power;
//   · a factory filter written down as a part is the factory filter, exactly; the preview is the fitted build and
//     moves nothing;
//   · the library: the filter fits as its class, travels with a build beside an exhaust and an intake;
//   · the page: offered, its readout, nothing for an electric drive, Greek.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { try { localStorage.removeItem('pes.parts'); } catch (e) {} });
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
  const maxDiff = (a, b) => a.pts.reduce((m, x, i) => Math.max(m, Math.abs(x.tq - b.pts[i].tq) / a.peakTQ), 0);
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  // 1. the factory filters' restriction at peak power, and as parts
  o.fac = [];
  for (const car of ['BMW M3 (E46', 'Golf GTI (Mk7', 'Hilux']) {
    load(car);
    for (const k of ['none', 'perf', 'stock', 'restrictive']) {
      const f = filterReport(k), p = partFromFactory(k, 'filter');
      o.fac.push({ car: vehicle.body.name, k, kPa: f.dp / 1000, hp: f.peakHP, d: maxDiff(f, filterReport(p)) });
    }
  }
  // 2. the physics, on the M3
  load('BMW M3 (E46');
  const base = partFromFactory('stock', 'filter'), R = x => filterReport(Object.assign({}, base, x));
  o.media = ['nano', 'paper', 'cotton'].map(m => R({ media: m }).dpMedia);
  o.inlet = [55, 77, 110].map(d => { const x = R({ inletD_mm: d }); return { dp: x.dp, hp: x.peakHP }; });
  o.part = withPart('filter', base, () => ({ full: filterDp(airFlowM3s(7000, 1, 0.95)), half: filterDp(airFlowM3s(7000, 0.5, 0.95)) }));
  // 3. the preview moves nothing, and is the build
  const before = { score: json(engine.score), pull: json(wotPull()), lap: json(simulateLap('mixed')) };
  partsUI.kind = 'filter'; setTab('parts');
  document.getElementById('pfSize').click(); previewPart('filter');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull()) && before.lap === json(simulateLap('mixed'));
  const q = Object.assign({}, base, { name: 'TEST FILTER', media: 'cotton', inletD_mm: 90 });
  const pre = filterReport(q);
  partsUI.edit.filter = Object.assign({}, q); partToEditor('filter', partsUI.edit.filter);
  document.getElementById('pfSaveFit').click();
  o.fit = { part: !!engine.filterPart, cls: engine.airFilter, form: document.getElementById('edAirFilter').value === 'part:' + (engine.filterPart && engine.filterPart.id),
    pull: json(wotPull().pts) === json(pre.pts), choices: [...document.querySelectorAll('#edAirFilter optgroup option')].map(x => x.textContent) };
  // 4. it travels with an exhaust and an intake
  const ex = Object.assign(partFromFactory('race'), { name: 'TEST HEADER' }), inp = Object.assign(partFromFactory('short', 'intake'), { name: 'TEST RUNNERS' });
  partLib.push(normPart(ex), normPart(Object.assign(inp, { kind: 'intake' }))); persistParts(); fitPart(ex.id); fitPart(inp.id);
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Golf GTI (Mk7');
  applyBuild(saved);
  o.travel = { lib: partLib.length, names: [engine.exhaustPart, engine.intakePart, engine.filterPart].map(p => p && p.name) };
  partAction('del', engine.filterPart.id);
  o.del = { part: !!engine.filterPart, cls: engine.airFilter, others: !!engine.exhaustPart && !!engine.intakePart };
  // 5. the page
  partsUI.edit.filter = null; partsUI.kind = 'filter'; setTab('parts');
  o.page = { box: !document.getElementById('partsFilter').hidden, guide: document.getElementById('pfGuide').innerText };
  load('Model 3'); setTab('parts'); o.ev = !document.getElementById('partsNoEngine').hidden && document.getElementById('partsFilter').hidden;
  load('BMW M3 (E46'); applyLang('el'); partsUI.edit.filter = null; setTab('parts');
  o.el = { head: document.querySelector('#partsFilter .design-section').textContent, guide: document.getElementById('pfGuide').innerText.slice(0, 50) };
  applyLang('en');
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
console.log('== the factory filters at peak power: restriction, power; as a part (largest torque difference) ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(30)} ${c.k.padEnd(11)} ${f(c.kPa)} kPa  ${c.hp} hp  ${f(c.d * 100, 4)}%`);
  if (c.d > 1e-6) fails.push(`${c.car} ${c.k}: the part is not the factory filter`);
  const band = { none: [0, 0.001], perf: [0.5, 1.5], stock: [2, 4], restrictive: [4.5, 7] }[c.k];
  if (c.kPa < band[0] || c.kPa > band[1]) fails.push(`${c.car} ${c.k}: ${f(c.kPa)} kPa at peak power, outside ${band.join('-')}`);
}
for (const car of [...new Set(r.fac.map(c => c.car))]) {
  const hp = k => r.fac.find(c => c.car === car && c.k === k).hp;
  if (!(hp('none') >= hp('perf') && hp('perf') >= hp('stock') && hp('stock') > hp('restrictive'))) fails.push(`${car}: the power does not fall as the filter restricts more`);
}
console.log(`== media drop, nanofibre / paper / cotton: ${r.media.map(x => f(x)).join(' / ')} Pa; inlet 55/77/110 mm: ${r.inlet.map(x => f(x.dp / 1000) + ' kPa ' + x.hp + ' hp').join(', ')}; at half the manifold pressure ${f(r.part.half)} Pa against ${f(r.part.full)} ==`);
if (!(r.media[0] > r.media[1] && r.media[1] > r.media[2])) fails.push('the media do not restrict in their measured order');
if (!(r.inlet[0].dp > r.inlet[1].dp && r.inlet[1].dp > r.inlet[2].dp && r.inlet[0].hp < r.inlet[2].hp)) fails.push('a wider inlet does not lose less and make more');
if (!(r.part.half < r.part.full * 0.6)) fails.push('the drop does not fall with the flow');
console.log(`== the preview moves nothing: ${r.still}; fitted: ${JSON.stringify(r.fit)} ==`);
if (!r.still) fails.push('opening the filter designer and previewing changed the build or the lap');
if (!r.fit.part || r.fit.cls !== 'stock' || !r.fit.form || !r.fit.pull || !r.fit.choices.includes('TEST FILTER')) fails.push('SAVE & FIT does not fit the filter as previewed, as its class');
console.log(`== a build carries all three parts: ${JSON.stringify(r.travel)}; deleting the filter: ${JSON.stringify(r.del)} ==`);
if (r.travel.lib !== 3 || r.travel.names.join() !== 'TEST HEADER,TEST RUNNERS,TEST FILTER') fails.push('a build does not carry its exhaust, intake and filter into an empty library');
if (r.del.part || r.del.cls !== 'stock' || !r.del.others) fails.push('deleting the fitted filter does not put the factory filter back, or takes the other parts');
console.log(`== page: ${r.page.box}; ${r.page.guide.split('\n')[1]}; electric: ${r.ev}; Greek: ${r.el.head} · ${r.el.guide} ==`);
if (!r.page.box || !/Restriction at peak power/.test(r.page.guide)) fails.push('the air filter designer is not shown');
if (!r.ev) fails.push('an electric drive is offered an air filter');
if (!/φίλτρ/i.test(r.el.head) || /With this filter/.test(r.el.guide)) fails.push('the air filter designer is not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the air filter restricts by its media and its housing at the flow it passes, the factory filters at measured restrictions, and the designer\'s filters preview, fit and travel exactly.');
process.exit(fails.length || errors.length ? 1 : 0);
