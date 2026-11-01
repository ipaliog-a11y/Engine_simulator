// The part designer: exhausts (build 205).
//
// WHY THIS EXISTS. The three factory exhausts were always three sets of dimensions read by the breathing model and the
// sound; the PARTS page lets a player set those dimensions and save the result as a part, fitted on the ENGINE tab.
// The page previews a part on the engine without building it (withExhaust). What must hold:
//   · a factory exhaust written down as a part (partFromFactory) is the factory exhaust: the same pull within 0.1%
//     (the part's numbers are rounded to 0.1 mm), on an NA six, a turbo four, a V8 and a cast manifold;
//   · the preview is the build: a part previewed gives exactly the pull the engine makes with it fitted;
//   · the preview moves nothing: the engine's score, its pull and a lap are bit-identical after the page has been
//     opened and parts previewed;
//   · the dimensions act through the physics: a wider pipe lowers the back-pressure; an equal-length header scavenges
//     more than a cast manifold; the primaries cut for a speed put the scavenging there; on a turbo engine the
//     primary length is not used;
//   · the library: save, fit (the engine carries the part, its cost is its construction's), a build carries the part
//     into a browser that never saw it, a changed library part with the same id comes back as a copy, deleting the
//     fitted part puts the factory exhaust back;
//   · the sound reads the part's silencer;
//   · the page: four part types, one of them later (build 206 made the intake ready, test121; build 210 the air filter, test124); the exhaust editor; nothing for an electric drive; Greek.
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
  const maxDiff = (a, b) => a.pts.reduce((m, x, i) => Math.max(m, Math.abs(x.tq / b.pts[i].tq - 1)), 0);
  // 1. a factory exhaust as a part is the factory exhaust
  o.conv = [];
  for (const [car, keys] of [['BMW M3 (E46', ['stock', 'sport', 'race']], ['Golf GTI (Mk7', ['stock', 'race']], ['Corvette', ['sport']], ['Toyota Aygo', ['stock']]]) {
    load(car);
    for (const k of keys) { const f = exhaustReport(k), p = exhaustReport(partFromFactory(k)); o.conv.push({ car: vehicle.body.name, k, d: maxDiff(f, p), hp: [f.peakHP, p.peakHP] }); }
  }
  // 2-3. the preview is the build, and moves nothing
  load('BMW M3 (E46');
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  const before = { score: json(engine.score), pull: json(wotPull()), lap: json(simulateLap('mixed')) };
  setTab('parts');
  const base = partFromFactory('race');
  const q = Object.assign({}, base, { name: 'TEST 5500', primL_mm: primaryFor(5500), sysD_mm: 60 });
  const pre = exhaustReport(q);
  document.getElementById('ptCut').click(); document.getElementById('ptSize').click(); previewPart('exhaust');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull()) && before.lap === json(simulateLap('mixed'));
  // 4. the physics
  const R = x => exhaustReport(Object.assign({}, base, x));
  o.pipe = [45, 60, 90].map(d => R({ sysD_mm: d }).bpKPa);
  o.hdr = ['cast', 'equal'].map(b => { let g = -9; withExhaust(Object.assign({}, base, { build: b }), e => { g = e.scavPeakGain; }); return g; });
  o.cut = [5500, 7000].map(rpm => [rpm, R({ primL_mm: primaryFor(rpm) }).scavPeakRpm]);
  load('Golf GTI (Mk7');
  const gb = partFromFactory('sport');
  o.turboL = [300, 900].map(L => json(exhaustReport(Object.assign({}, gb, { primL_mm: L })).pts));
  // 5. the library
  load('BMW M3 (E46'); setTab('parts');
  partsUI.kind = 'exhaust'; partsUI.edit.exhaust = Object.assign({}, q); partToEditor('exhaust', partsUI.edit.exhaust);
  document.getElementById('ptSaveFit').click();
  const id = engine.exhaustPart && engine.exhaustPart.id;
  o.fit = { id: !!id, form: document.getElementById('edExhaust').value === 'part:' + id, pull: json(wotPull().pts) === json(pre.pts),
    cost: engine.cost, costRace: (() => { let c; withExhaust('race', () => { c = computeCost(); }); return c; })(), cls: engine.exhaust,
    summary: document.getElementById('designSummary').innerText.includes('TEST 5500'), lib: partLib.length,
    option: [...document.querySelectorAll('#edExhaust optgroup option')].map(x => x.textContent) };
  const saved = serializeBuild('t', '');
  o.saved = !!(saved.engine.exhaustPart && saved.engine.exhaustPart.primL_mm === q.primL_mm);
  // a browser that never saw the part
  partLib = []; persistParts(); fillPartSelects(); load('Golf GTI (Mk7');
  applyBuild(saved);
  o.imported = { lib: partLib.length, fitted: !!engine.exhaustPart && engine.exhaustPart.name === 'TEST 5500', pull: json(wotPull().pts) === json(pre.pts) };
  // the library's part changed since: the build's comes back as a copy, and the build is what it was
  partLib[0] = Object.assign({}, partLib[0], { sysD_mm: 80 }); persistParts();
  applyBuild(saved);
  o.copy = { lib: partLib.length, sysD: engine.exhaustPart.sysD_mm, ids: new Set(partLib.map(p => p.id)).size };
  // 6. the sound reads the silencer
  const sil = s => { const e = Object.assign({}, engine, { exhaustPart: Object.assign({}, engine.exhaustPart, { silencer: s }) }); return exhaustSound(e).gain; };
  o.sound = ['chambered', 'absorptive', 'straight'].map(sil);
  // deleting the fitted part
  partAction('del', engine.exhaustPart.id);
  o.del = { part: !!engine.exhaustPart, exh: engine.exhaust, lib: partLib.length };
  // 7. the page
  partsUI.kind = 'exhaust'; setTab('parts');
  o.page = { types: [...document.querySelectorAll('#partTypes button')].map(b => [b.dataset.kind, b.disabled]), editor: !document.getElementById('partsExhaust').hidden,
    lit: (() => { const c = document.getElementById('partCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })() };
  load('Model 3'); setTab('parts');
  o.ev = { note: !document.getElementById('partsNoEngine').hidden, editor: !document.getElementById('partsExhaust').hidden };
  load('BMW M3 (E46'); applyLang('el'); setTab('parts');
  o.el = { tab: document.getElementById('tabParts').textContent, h: document.querySelector('#partsPanel h3').textContent, guide: document.getElementById('partGuide').innerText.slice(0, 60) };
  applyLang('en');
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
console.log('== a factory exhaust, written down as a part: the largest torque difference over the pull ==');
for (const c of r.conv) { console.log(`  ${c.car.padEnd(28)} ${c.k.padEnd(6)} ${f(c.d * 100, 3)}%  (${c.hp.join(' / ')} hp)`); if (!(c.d < 0.001)) fails.push(`${c.car} ${c.k}: the part is not the factory exhaust (${f(c.d * 100, 3)}%)`); }
console.log(`== the preview moves nothing: ${r.still}; the preview is the fitted build: ${r.fit.pull} ==`);
if (!r.still) fails.push('opening the PARTS page and previewing changed the build or the lap');
if (!r.fit.pull) fails.push('the preview is not the pull the engine makes with the part fitted');
console.log(`== physics: back-pressure at 45/60/90 mm ${r.pipe.map(x => f(x, 1)).join(' / ')} kPa; scavenging gain cast ${f(r.hdr[0], 3)} vs equal-length ${f(r.hdr[1], 3)}; cut for ${r.cut.map(c => c[0] + ' -> ' + c[1]).join(', ')} rpm ==`);
if (!(r.pipe[0] > r.pipe[1] && r.pipe[1] > r.pipe[2])) fails.push('a wider pipe does not lower the back-pressure');
if (!(r.hdr[1] > r.hdr[0])) fails.push('an equal-length header does not scavenge more than a cast manifold');
for (const [rpm, at] of r.cut) if (Math.abs(at / rpm - 1) > 0.05) fails.push(`primaries cut for ${rpm} rpm scavenge best at ${at} rpm`);
if (r.turboL[0] !== r.turboL[1]) fails.push('on a turbo engine the primary length changes the pull (packaging sets it)');
console.log(`== library: fitted ${r.fit.id}, form ${r.fit.form}, class ${r.fit.cls}, cost ${r.fit.cost} (race header ${r.fit.costRace}), summary ${r.fit.summary}, in the choices: ${r.fit.option.join(', ')} ==`);
if (!r.fit.id || !r.fit.form || r.fit.cls !== 'race' || r.fit.cost !== r.fit.costRace || !r.fit.summary || !r.fit.option.includes('TEST 5500')) fails.push('SAVE & FIT does not fit the part on the engine as its construction');
console.log(`== a build carries its part: saved ${r.saved}; into an empty library ${JSON.stringify(r.imported)}; against a changed one ${JSON.stringify(r.copy)} ==`);
if (!r.saved) fails.push('a saved build does not carry its part');
if (r.imported.lib !== 1 || !r.imported.fitted || !r.imported.pull) fails.push('loading a build in a browser without its part does not bring the part');
if (r.copy.lib !== 2 || r.copy.ids !== 2 || Math.abs(r.copy.sysD - 60) > 1e-9) fails.push('a build whose part has since changed in the library does not come back as it was saved');
console.log(`== the silencer's sound gain: chambered / straight-through / none ${r.sound.map(x => f(x)).join(' / ')}; deleting the fitted part: ${JSON.stringify(r.del)} ==`);
if (!(r.sound[0] < r.sound[1] && r.sound[1] < r.sound[2])) fails.push('the sound does not read the part\'s silencer');
if (r.del.part || r.del.exh !== 'race' || r.del.lib !== 1) fails.push('deleting the fitted part does not put its factory exhaust back');
console.log(`== page: ${r.page.types.map(([k, d]) => k + (d ? ' (later)' : '')).join(', ')}; editor ${r.page.editor}; ${r.page.lit} pixels drawn; electric: note ${r.ev.note}, editor ${r.ev.editor}; Greek: ${r.el.tab} · ${r.el.h} · ${r.el.guide} ==`);
if (r.page.types.length !== 4 || r.page.types.map(t => t[0]).join() !== 'exhaust,intake,filter,cat' || r.page.types.slice(0, 3).some(t => t[1]) || !r.page.types[3][1]) fails.push('the part types are not the exhaust, the intake, the air filter and one for later');
if (!r.page.editor || r.page.lit < 3000) fails.push('the exhaust editor and its chart are not shown');
if (!r.ev.note || r.ev.editor) fails.push('an electric drive is offered an exhaust');
if (!/ΕΞΑΡΤΗΜΑΤΑ/.test(r.el.tab) || !/ΣΧΕΔΙΑΣΤΗΣ/.test(r.el.h) || /With this exhaust/.test(r.el.guide)) fails.push('the PARTS page is not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: an exhaust designed on the PARTS page is the breathing model\'s own dimensions, previews exactly what it builds, changes nothing until fitted, and travels with the build.');
process.exit(fails.length || errors.length ? 1 : 0);
