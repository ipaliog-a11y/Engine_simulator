// The cylinder head as a part (build 283).
//
// WHY THIS EXISTS. The valvetrain model always read three things from the head that the player could not set: the
// intake valve's size (a packing ratio of the bore), the port's throat (THROAT_RATIO) and the springs (the maker's,
// sized for the factory cam and the redline, times a step). The PARTS page now designs them. What must hold:
//   · a factory head written down as a part is that head, exactly, with each spring step, on an NA six, a turbo four,
//     a supercharged V8 whose springs the maker sized up, and a hybrid four;
//   · the physics: a bigger valve chokes later (lower Mach index) and floats sooner (heavier); a stiffer spring floats
//     later; a smaller throat lowers the flow coefficient's plateau; a designed spring does not re-size for the redline;
//   · the preview moves nothing and is the fitted build; the part fits on the ENGINE tab and travels with a build;
//   · a port-timed engine is told a head of valves changes nothing.
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
  // 1. the factory heads as parts
  o.fac = [];
  for (const car of ['BMW M3 (E46', 'Golf GTI (Mk7', 'SRT Hellcat', 'Ioniq']) {
    load(car);
    for (const k of ['stock', 'perf', 'race']) {
      const a = headReport(k), p = partFromFactory(k, 'head'), b = headReport(p);
      o.fac.push({ car: vehicle.body.name, k, hp: a.peakHP, d: maxDiff(a, b), fa: a.floatRpm, fb: b.floatRpm });
    }
  }
  // 2. the physics, on the M3
  load('BMW M3 (E46');
  const base = partFromFactory('stock', 'head'), R = x => headReport(Object.assign({}, base, x));
  o.valve = [31, 34, 37].map(d => { const q = R({ valveD_mm: d }); return { z: q.z, f: q.floatRpm, big: q.dOverB > q.packD }; });
  o.seat = [220, 290, 400].map(s => R({ seat_N: s }).floatRpm);
  o.rate = [15, 25, 45].map(k => R({ rate_Nmm: k }).floatRpm);
  o.throat = [0.78, 0.85].map(t => R({ throat: t, valveD_mm: 30 }).Ci);
  // a designed spring is hardware: it does not re-size when the maker's would (springs rated 1500 rpm higher)
  const fixed = withPart('head', base, e => { e.springRpm = e.redline + 1500; deriveValvetrain(); return e.floatRpm; });
  o.hard = { fixed, asBuilt: R({}).floatRpm };
  // 3. the preview moves nothing, and is the build
  const before = { score: json(engine.score), pull: json(wotPull()), lap: json(simulateLap('mixed')) };
  partsUI.kind = 'head'; setTab('parts'); previewPart('head');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull()) && before.lap === json(simulateLap('mixed'));
  const q = Object.assign({}, base, { name: 'TEST HEAD', valveD_mm: 35, throat: 0.88, seat_N: 420, rate_Nmm: 38 });
  const pre = headReport(q);
  partsUI.edit.head = Object.assign({}, q); partToEditor('head', partsUI.edit.head);
  document.getElementById('phSaveFit').click();
  o.fit = { part: !!engine.headPart, form: document.getElementById('edSpring').value === 'part:' + (engine.headPart && engine.headPart.id),
    pull: json(wotPull().pts) === json(pre.pts), valve: engine.ivDia_mm, seat: engine.springSeat_N };
  // 4. it travels with a build
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Golf GTI (Mk7');
  applyBuild(saved);
  o.travel = { lib: partLib.length, name: engine.headPart && engine.headPart.name, valve: engine.ivDia_mm };
  // 5. the page, and a port-timed engine
  o.guide = document.getElementById('phGuide').innerText;
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === '1.3 Rotary NA (Renesis)').engine)); buildEngine();
  partsUI.edit.head = null; setTab('parts'); o.rotary = document.getElementById('phGuide').innerText;
  return o;
});
await browser.close();

console.log('== the factory heads as parts: peak power, largest torque difference, float ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(36)} ${c.k.padEnd(5)} ${String(c.hp).padStart(4)} hp  ${(c.d * 100).toExponential(1)}%  float ${Math.round(c.fa)} / ${Math.round(c.fb)}`);
  if (c.d > 1e-6) fails.push(`${c.car} ${c.k}: the part is not the factory head`);
  if (Math.abs(c.fa - c.fb) > 0.5) fails.push(`${c.car} ${c.k}: the part's springs are not the factory's`);
}
const rd = a => a.map(x => Math.round(x)).join(' / ');
console.log(`== valve 31/34/37 mm: Mach index ${r.valve.map(v => v.z.toFixed(3)).join(' / ')}, float ${rd(r.valve.map(v => v.f))}, past the packing ${r.valve.map(v => v.big).join('/')} ==`);
console.log(`== seat 220/290/400 N: float ${rd(r.seat)}; rate 15/25/45 N/mm: float ${rd(r.rate)}; throat 0.78/0.85 on a 30 mm valve: Ci ${r.throat.map(x => x.toFixed(3)).join(' / ')} ==`);
console.log(`== springs rated +1500 rpm: the part's float ${Math.round(r.hard.fixed)} (as built ${Math.round(r.hard.asBuilt)}) ==`);
if (!(r.valve[0].z > r.valve[1].z && r.valve[1].z > r.valve[2].z)) fails.push('a bigger valve does not lower the Mach index');
if (!(r.valve[0].f > r.valve[1].f && r.valve[1].f > r.valve[2].f)) fails.push('a bigger valve does not float sooner');
if (r.valve[0].big || !r.valve[2].big) fails.push('the packing warning is wrong');
if (!(r.seat[0] < r.seat[1] && r.seat[1] < r.seat[2]) || !(r.rate[0] < r.rate[1] && r.rate[1] < r.rate[2])) fails.push('a stiffer spring does not float later');
if (!(r.throat[0] < r.throat[1] - 0.03)) fails.push('a smaller throat does not lower the flow coefficient');
if (Math.abs(r.hard.fixed - r.hard.asBuilt) > 1e-6) fails.push('a designed spring re-sized for the redline');
console.log(`== the preview moves nothing: ${r.still}; fitted: ${JSON.stringify(r.fit)}; travels: ${JSON.stringify(r.travel)} ==`);
if (!r.still) fails.push('opening the head designer and previewing changed the build or the lap');
if (!r.fit.part || !r.fit.form || !r.fit.pull || r.fit.valve !== 35 || r.fit.seat !== 420) fails.push('SAVE & FIT does not fit the head as previewed');
if (r.travel.lib !== 1 || r.travel.name !== 'TEST HEAD' || r.travel.valve !== 35) fails.push('a saved build does not carry its head');
console.log(`== page: ${r.guide.split('\n')[1]} ==\n== rotary: ${r.rotary.split('\n')[1]} ==`);
if (!/Inlet Mach index/.test(r.guide)) fails.push('the head designer\'s readout is not shown');
if (!/no poppet valves/.test(r.rotary)) fails.push('a rotary is not told a head changes nothing');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed head feeds the valvetrain its own valve, port and springs, a factory head as a part is that head, and the preview, fit and save are exact.');
process.exit(fails.length || errors.length ? 1 : 0);
