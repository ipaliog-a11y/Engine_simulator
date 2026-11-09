// The intercooler as a part (build 255).
//
// WHY THIS EXISTS. The two factory cores were a quoted effectiveness, a pipe length and a volume. The PARTS page now
// designs a core by its face, depth, fins and pipe, and the charge path reads its own volume and an effectiveness
// scaled from its surfaces. What must hold:
//   · a factory core written down as a part is that core, exactly, on three turbo engines (the fingerprint is identical);
//   · a wider core cools better and drops more pressure; more fins cool better; a longer pipe holds more charge;
//   · the preview moves nothing; SAVE & FIT fits the core as previewed, as its class, and it travels with a build;
//   · an old build's boolean intercooler still loads as its factory core; an NA engine is told a core changes nothing.
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
  o.fac = [];
  for (const car of ['Golf GTI (Mk7', 'Focus RS', 'Swift Sport']) {
    load(car);
    for (const k of ['small', 'large']) {
      const a = icReport(k), p = partFromFactory(k, 'intercooler'), b = icReport(p);
      o.fac.push({ car: vehicle.body.name, k, hp: a.peakHP, cls: icClass(p), d: maxDiff(a, b), de: Math.abs(a.eff - b.eff), dv: Math.abs(a.vol - b.vol) });
    }
  }
  load('Golf GTI (Mk7');
  const base = partFromFactory('large', 'intercooler'), R = x => icReport(Object.assign({}, base, x));
  o.w = [400, 600, 800].map(w => { const q = R({ w }); return { eff: q.eff, dp: q.dp.core }; });
  o.fpi = [10, 14, 20].map(fpi => R({ fpi }).eff);
  o.pipe = [1, 3, 5].map(pipe_m => R({ pipe_m }).vol);
  const before = { score: json(engine.score), pull: json(wotPull()) };
  partsUI.kind = 'intercooler'; setTab('parts'); previewPart('intercooler');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull());
  o.guide = document.getElementById('pxGuide').innerText;
  const q = Object.assign({}, base, { name: 'TEST IC', w: 300, h: 120 });
  const pre = icReport(q);
  partsUI.edit.intercooler = Object.assign({}, q); partToEditor('intercooler', partsUI.edit.intercooler);
  document.getElementById('pxSaveFit').click();
  o.fit = { part: !!engine.icPart, cls: engine.intercooler, pull: json(wotPull().pts) === json(pre.pts),
    form: document.getElementById('edIntercooler').value === 'part:' + (engine.icPart && engine.icPart.id) };
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Focus RS');
  applyBuild(saved);
  o.travel = { lib: partLib.length, name: engine.icPart && engine.icPart.name, cls: engine.intercooler };
  applyEngineToForm(Object.assign({}, engine, { intercooler: false, icPart: undefined })); buildEngine();
  o.legacy = engine.intercooler;
  load('BMW M3 (E46'); partsUI.edit.intercooler = null; setTab('parts');
  o.na = document.getElementById('pxGuide').innerText;
  return o;
});
await browser.close();

console.log('== the factory cores as parts: peak power, class, largest torque / effectiveness / volume difference ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(30)} ${c.k.padEnd(6)} ${String(c.hp).padStart(4)} hp  ${c.cls.padEnd(6)} ${c.d.toExponential(1)} ${c.de.toExponential(1)} ${c.dv.toExponential(1)}`);
  if (c.d > 1e-9 || c.de > 1e-9 || c.dv > 1e-9) fails.push(`${c.car} ${c.k}: the part is not the factory core`);
  if (c.cls !== c.k) fails.push(`${c.car} ${c.k}: the part's class is ${c.cls}`);
}
const f = x => x.toFixed(3);
console.log(`== width 400/600/800: eff ${r.w.map(x => f(x.eff)).join(' / ')}, core drop ${r.w.map(x => (x.dp / 1000).toFixed(1)).join(' / ')} kPa ==`);
console.log(`== fins 10/14/20: eff ${r.fpi.map(f).join(' / ')}; pipe 1/3/5 m: ${r.pipe.map(x => x.toFixed(2)).join(' / ')} L ==`);
const up = a => a[0] < a[1] && a[1] < a[2];
if (!up(r.w.map(x => x.eff))) fails.push('a wider core does not cool better');
if (!up(r.w.map(x => x.dp))) fails.push('a wider (longer-path) core does not drop more pressure');
if (!up(r.fpi)) fails.push('more fins do not cool better');
if (!up(r.pipe)) fails.push('a longer pipe does not hold more charge');
console.log(`== preview moves nothing: ${r.still}; fitted: ${JSON.stringify(r.fit)}; travels: ${JSON.stringify(r.travel)}; legacy false -> ${r.legacy} ==`);
if (!r.still) fails.push('previewing changed the build');
if (!r.fit.part || r.fit.cls !== 'small' || !r.fit.pull || !r.fit.form) fails.push('SAVE & FIT does not fit the core as previewed, as its class');
if (r.travel.lib !== 1 || r.travel.name !== 'TEST IC' || r.travel.cls !== 'small') fails.push('a saved build does not carry its intercooler');
if (r.legacy !== 'none') fails.push('an old build without an intercooler loads with one');
console.log(`== page: ${r.guide.split('\n')[1]} ==\n== NA: ${r.na.split('\n')[1]} ==`);
if (!/Pressure drop/.test(r.guide)) fails.push('the intercooler designer\'s readout is not shown');
if (!/only matters with forced induction/.test(r.na)) fails.push('an NA engine is not told a core changes nothing');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed intercooler feeds the charge path its own volume and surfaces, and a factory core as a part is that core.');
process.exit(fails.length || errors.length ? 1 : 0);
