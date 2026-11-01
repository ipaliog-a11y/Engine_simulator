// The part designer: intake manifolds (build 206).
//
// WHY THIS EXISTS. The four factory intake manifolds (RUNNER: LONG, MEDIUM, SHORT, VARIABLE) were always runner
// lengths, read by the integrated intake stroke (intakeFill, buildFillTable) with a bore the factory matches to the
// ports. The PARTS page's INTAKE MANIFOLD sets the length, the bore and a variable one's short length. What must hold:
//   · a factory manifold written down as a part is the factory manifold: the same pull within 0.1%, on an NA six,
//     a turbo four and a V8;
//   · the preview is the build, exactly, and the preview moves nothing (score, pull and a lap bit-identical);
//   · the dimensions act through the physics: a shorter runner fills best higher; a narrower bore makes more torque
//     low and less power high, and its gas runs faster; CUT puts the fill's peak where it is asked, within 5%, where
//     a runner can; a variable manifold opens its short runners above where the long ones fill best;
//   · an engine without intake valves (a two-stroke) is told the runners change nothing;
//   · the library: fit (class, the ENGINE tab's choice), a build carries the part into an empty library, deleting
//     the fitted part puts the factory manifold back; an exhaust and an intake fitted together both travel;
//   · the page, in Greek.
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
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  // 1. a factory manifold as a part is the factory manifold
  o.conv = [];
  for (const [car, keys] of [['BMW M3 (E46', ['long', 'medium', 'short', 'variable']], ['Golf GTI (Mk7', ['medium']], ['Corvette', ['long']]]) {
    load(car);
    for (const k of keys) { const f = intakeReport(k), p = intakeReport(partFromFactory(k, 'intake')); o.conv.push({ car: vehicle.body.name, k, d: maxDiff(f, p) }); }
  }
  // 2. the preview is the build and moves nothing
  load('BMW M3 (E46');
  const before = { score: json(engine.score), pull: json(wotPull()), lap: json(simulateLap('mixed')) };
  partsUI.kind = 'intake'; setTab('parts');
  const base = partFromFactory('medium', 'intake');
  const q = Object.assign({}, base, { name: 'TEST RUNNERS', runnerL_mm: 420, runnerD_mm: 38 });
  const pre = intakeReport(q);
  document.getElementById('piCut').click(); document.getElementById('piMatch').click(); previewPart('intake');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull()) && before.lap === json(simulateLap('mixed'));
  // 3. the physics
  const R = x => intakeReport(Object.assign({}, base, x));
  o.len = [450, 300, 150].map(L => R({ runnerL_mm: L }).ramPeakRpm);
  const nar = R({ runnerD_mm: 34 }), wide = R({ runnerD_mm: 50 });
  o.bore = { lowNar: nar.pts.find(p => p.rpm === 3000).tq, lowWide: wide.pts.find(p => p.rpm === 3000).tq, hpNar: nar.peakHP, hpWide: wide.peakHP,
    vNar: runnerGasV(engine, 6000, 34), vWide: runnerGasV(engine, 6000, 50) };
  o.cut = [5500, 6500, 7500].map(rpm => { const L = runnerFor(rpm, base.runnerD_mm); return [rpm, L, R({ runnerL_mm: L }).ramPeakRpm]; });
  const v = R({ variable: true, runnerL_mm: 645, shortL_mm: 190 }), vLong = R({ runnerL_mm: 645 });
  o.variable = { cross: v.cross, longPeak: vLong.ramPeakRpm, hp: v.peakHP, hpLong: vLong.peakHP };
  // 4. the library, with an exhaust fitted beside it
  partsUI.edit.intake = Object.assign({}, q); partToEditor('intake', partsUI.edit.intake);
  document.getElementById('piSaveFit').click();
  const ex = Object.assign(partFromFactory('race'), { name: 'TEST HEADER' });
  partLib.push(normPart(ex)); persistParts(); fitPart(ex.id);
  o.fit = { intake: !!engine.intakePart, cls: engine.runner, form: document.getElementById('edRunner').value === 'part:' + (engine.intakePart && engine.intakePart.id),
    exhaust: !!engine.exhaustPart,
    choices: [...document.querySelectorAll('#edRunner optgroup option')].map(x => x.textContent) };
  // the fitted pair against the preview of the intake on that same engine
  o.fit.preview = json(intakeReport(engine.intakePart).pts) === json(wotPull().pts);
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Golf GTI (Mk7');
  applyBuild(saved);
  o.imported = { lib: partLib.length, intake: engine.intakePart && engine.intakePart.name, exhaust: engine.exhaustPart && engine.exhaustPart.name, cls: engine.runner };
  partAction('del', engine.intakePart.id);
  o.del = { part: !!engine.intakePart, runner: engine.runner, exhaust: !!engine.exhaustPart };
  // 5. a two-stroke
  const ts = FACTORY_ENGINES.find(p => p.engine.type === 'twostroke');
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE, ts.engine), tune: Object.assign({}, STD_TUNE) });
  partsUI.edit.intake = null; partsUI.kind = 'intake'; setTab('parts');
  o.twostroke = document.getElementById('piGuide').innerText;
  // 6. the page in Greek
  load('BMW M3 (E46'); applyLang('el'); partsUI.edit.intake = null; setTab('parts');
  o.el = { head: document.querySelector('#partsIntake .design-section').textContent, guide: document.getElementById('piGuide').innerText.slice(0, 60), btn: document.getElementById('piCut').textContent };
  applyLang('en');
  o.preview = pre.peakHP;
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
console.log('== a factory manifold, written down as a part: the largest torque difference over the pull ==');
for (const c of r.conv) { console.log(`  ${c.car.padEnd(36)} ${c.k.padEnd(9)} ${f(c.d * 100, 4)}%`); if (!(c.d < 0.001)) fails.push(`${c.car} ${c.k}: the part is not the factory manifold`); }
console.log(`== the preview moves nothing: ${r.still}; the fitted intake is its preview: ${r.fit.preview} ==`);
if (!r.still) fails.push('opening the intake designer and previewing changed the build or the lap');
if (!r.fit.preview) fails.push('the preview is not the pull the engine makes with the intake fitted');
console.log(`== runners 450 / 300 / 150 mm fill best at ${r.len.join(' / ')} rpm ==`);
if (!(r.len[0] < r.len[1] && r.len[1] < r.len[2])) fails.push('a shorter runner does not fill best higher');
console.log(`== bore 34 vs 50 mm: ${f(r.bore.lowNar, 0)} vs ${f(r.bore.lowWide, 0)} Nm at 3000 rpm, ${r.bore.hpNar} vs ${r.bore.hpWide} hp; gas ${f(r.bore.vNar, 0)} vs ${f(r.bore.vWide, 0)} m/s at 6000 ==`);
if (!(r.bore.lowNar > r.bore.lowWide)) fails.push('a narrower runner does not make more torque low');
if (!(r.bore.hpNar < r.bore.hpWide)) fails.push('a narrower runner does not cost power high');
if (!(r.bore.vNar > r.bore.vWide)) fails.push('the gas does not run faster in a narrower runner');
console.log(`== CUT for ${r.cut.map(c => c[0] + ' -> ' + c[1] + ' mm, fills best at ' + c[2]).join('; ')} ==`);
for (const [want, L, got] of r.cut) if (Math.abs(got / want - 1) > 0.05) fails.push(`runners cut for ${want} rpm (${L} mm) fill best at ${got} rpm`);
console.log(`== variable 645/190 mm (cut for 5500 and 7500): the flap opens at ${r.variable.cross} rpm, the long runner alone fills best at ${r.variable.longPeak}; ${r.variable.hp} hp against ${r.variable.hpLong} with the long runner alone ==`);
if (!(r.variable.cross > r.variable.longPeak)) fails.push('the variable manifold does not open its short runners above where the long ones fill best');
if (!(r.variable.hp > r.variable.hpLong)) fails.push('the variable manifold makes no more power than its long runners alone');
console.log(`== library: ${JSON.stringify(r.fit)}; into an empty library ${JSON.stringify(r.imported)}; deleting ${JSON.stringify(r.del)} ==`);
if (!r.fit.intake || r.fit.cls !== 'long' || !r.fit.form || !r.fit.exhaust || !r.fit.choices.includes('TEST RUNNERS')) fails.push('SAVE & FIT does not fit the intake beside the exhaust, as its nearest factory class');
if (r.imported.lib !== 2 || r.imported.intake !== 'TEST RUNNERS' || r.imported.exhaust !== 'TEST HEADER') fails.push('a build does not carry both its parts into an empty library');
if (r.del.part || r.del.runner !== 'long' || !r.del.exhaust) fails.push('deleting the fitted intake does not put the factory manifold back, or takes the exhaust with it');
console.log(`== a two-stroke: ${r.twostroke.split('\n')[1]} ==`);
if (!/runners change nothing/.test(r.twostroke)) fails.push('a port-timed engine is not told its runners change nothing');
console.log(`== Greek: ${r.el.head} · ${r.el.btn} · ${r.el.guide} ==`);
if (!/εισαγωγ/i.test(r.el.head) || /With this intake/.test(r.el.guide) || r.el.btn === 'CUT') fails.push('the intake designer is not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: an intake designed on the PARTS page is the fill model\'s own runners, previews exactly what it builds, changes nothing until fitted, and travels with the build beside its exhaust.');
process.exit(fails.length || errors.length ? 1 : 0);
