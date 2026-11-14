// The turbocharger as a part (build 288); its shaft's inertia from both wheels, a pair two of them (build 290).
//
// WHY THIS EXISTS. The shaft model always read three things from a turbo the player could only pick as a frame: the
// compressor wheel, the turbine wheel (TURB_WHEEL, 0.90 of the compressor) and the housing's A/R (a TIGHT / STOCK /
// LOOSE step). The PARTS page now designs them. What must hold:
//   · a factory turbo written down as a part is that turbo, exactly: on a single (Golf GTI Mk7), a sequential pair with
//     its own compressor wheel (Supra A80), a twin (GT-R R35), a VGT diesel, and as each frame sold;
//   · the physics: a bigger compressor chokes later; a bigger turbine wheel or a looser housing opens the throat; a looser one
//     brings full boost later (a bigger turbine wheel is only checked for its throat); on a VGT the housing's A/R does nothing;
//   · the preview moves nothing; SAVE & FIT fits the turbo as previewed; it travels with a build;
//   · an engine without a turbo is told the part changes nothing;
//   · (build 290) a bigger turbine wheel makes the shaft heavier; a twin's choke flow is two wheels' and each of its
//     shafts is one turbo's, both wheels' inertia, the same as a single turbo of that frame.
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
  // 1. the factory turbos as parts
  o.fac = [];
  const one = (label, key) => { const a = turboReport(key), p = partFromFactory(key, 'turbo'), b = turboReport(p);
    o.fac.push({ car: label, k: key, hp: a.peakHP, d: maxDiff(a, b), fa: a.fullRpm, fb: b.fullRpm, part: p }); };
  for (const car of ['Golf GTI (Mk7', 'Supra RZ (A80', 'GT-R (R35']) { load(car); one(vehicle.body.name, engine.turboSize); }
  load('Golf GTI (Mk7'); for (const k of ['small', 'large']) one('Golf GTI, frame', k);
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === '2.0 Turbo Diesel I4').engine)); buildEngine();
  o.vgt = engine.vgt; one('2.0 Turbo Diesel I4', engine.turboSize);
  { const base = partFromFactory(engine.turboSize, 'turbo'); o.vgtAr = [0.4, 1.2].map(ar => turboReport(Object.assign({}, base, { ar })).peakTQ); }
  // 2. the physics, on the Golf
  load('Golf GTI (Mk7');
  const base = partFromFactory(engine.turboSize, 'turbo'), R = x => turboReport(Object.assign({}, base, x));
  o.base = base;
  o.comp = [50, 60, 70].map(c => R({ compD_mm: c, turbD_mm: 0.9 * c }).cap);
  o.ar = [0.45, 0.65, 0.9].map(ar => { const q = R({ ar }); return { t: q.throat, f: q.fullRpm }; });
  o.tw = [40, 48, 56].map(t => { const q = R({ turbD_mm: t }); return { t: q.throat, f: q.fullRpm }; });
  o.twk = [40, 48, 56].map(t => R({ turbD_mm: t }).fullRpm);
  o.tj = [40, 48, 56].map(t => R({ turbD_mm: t }).J);
  load('GT-R (R35');
  o.twin = { cfg: engine.turboConfig, units: engine.turbUnits, cap: engine.turboCap, one: compChokeFlow(engine.compExd),
    J: engine.shaftJ, J1: wheelInertia(engine.compExd, engine.turbK * engine.compExd) };
  // 3. the preview moves nothing, and is the build (on an engine with no ECU torque limit: a preview of a torque-limited
  // engine, any part's, differs from the build by up to 4 Nm on the plateau, on main as well)
  load('Supra RZ (A80'); o.tqLimit = engine.tqLimit;
  const before = { score: json(engine.score), pull: json(wotPull()), lap: json(simulateLap('mixed')) };
  partsUI.kind = 'turbo'; setTab('parts'); previewPart('turbo');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull()) && before.lap === json(simulateLap('mixed'));
  const q = Object.assign({}, partFromFactory(engine.turboSize, 'turbo'), { name: 'TEST TURBO', compD_mm: 60, turbD_mm: 52, ar: 0.7 });
  const pre = turboReport(q);
  partsUI.edit.turbo = Object.assign({}, q); partToEditor('turbo', partsUI.edit.turbo);
  document.getElementById('pbSaveFit').click();
  o.fit = { part: !!engine.turboPart, form: document.getElementById('edTurboSize').value === 'part:' + (engine.turboPart && engine.turboPart.id),
    pull: json(wotPull().pts) === json(pre.pts), exd: engine.compExd, k: engine.turbK, ar: engine.turbineAR };
  // 4. it travels with a build
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Golf GTI (Mk7');
  applyBuild(saved);
  o.travel = { lib: partLib.length, name: engine.turboPart && engine.turboPart.name, exd: engine.compExd };
  // 5. the page, and an engine with no turbo
  o.guide = document.getElementById('pbGuide').innerText;
  load('BMW M3 (E46'); partsUI.edit.turbo = null; setTab('parts'); o.na = document.getElementById('pbGuide').innerText;
  return o;
});
await browser.close();

console.log('== the factory turbos as parts: peak power, largest torque difference, 95% boost from ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(36)} ${c.k.padEnd(6)} ${String(c.hp).padStart(4)} hp  ${(c.d * 100).toExponential(1)}%  ${Math.round(c.fa)} / ${Math.round(c.fb)} rpm  (${c.part.compD_mm.toFixed(1)} / ${c.part.turbD_mm.toFixed(1)} mm, A/R ${c.part.ar.toFixed(3)})`);
  if (c.d > 1e-6) fails.push(`${c.car} ${c.k}: the part is not the factory turbo`);
  if (c.fa !== c.fb) fails.push(`${c.car} ${c.k}: full boost moved`);
}
if (!r.vgt) fails.push('the diesel archetype is not a VGT any more: pick another');
console.log(`== VGT, A/R 0.4 / 1.2: peak torque ${r.vgtAr.join(' / ')} Nm ==`);
if (r.vgtAr[0] !== r.vgtAr[1]) fails.push("a VGT's housing A/R changed the engine");
console.log(`== compressor 50/60/70 mm: chokes at ${r.comp.map(x => x.toFixed(0)).join(' / ')} lb/min ==`);
if (!(r.comp[0] < r.comp[1] && r.comp[1] < r.comp[2])) fails.push('a bigger compressor does not choke later');
const show = a => a.map(x => `${x.t.toFixed(1)} cm² from ${Math.round(x.f)}`).join(' / ');
console.log(`== A/R 0.45/0.65/0.9: ${show(r.ar)} ==\n== turbine 40/48/56 mm: ${show(r.tw)} ==`);
// a bigger turbine wheel is only checked for its throat: in the steady solve its faster tip takes more work from the gas
// and it comes on sooner; its inertia (build 290) slows only the transient, which this test does not step
console.log(`== turbine 40/48/56 mm: shaft inertia ${r.tj.map(j => (j * 1e5).toFixed(2)).join(' / ')} x1e-5 kg m² ==`);
if (!(r.tj[0] < r.tj[1] && r.tj[1] < r.tj[2])) fails.push('a bigger turbine wheel does not make the shaft heavier');
const t = r.twin;
console.log(`== GT-R ${t.cfg}: ${t.units} turbos, choke ${t.cap.toFixed(1)} lb/min (one wheel ${t.one.toFixed(1)}), shaft J ${(t.J * 1e5).toFixed(3)} (one cartridge ${(t.J1 * 1e5).toFixed(3)}) ==`);
if (t.cfg !== 'twin' || t.units !== 2) fails.push('the GT-R is not a twin any more: pick another');
if (Math.abs(t.cap - 2 * t.one) > 1e-9) fails.push("a twin's choke flow is not two wheels'");
if (Math.abs(t.J - t.J1) > 1e-15) fails.push("a twin's shaft is not one turbo's, both wheels");
for (const [what, a] of [['a looser housing', r.ar], ['a bigger turbine wheel', r.tw]])
  if (!(a[0].t < a[1].t && a[1].t < a[2].t)) fails.push(`${what} does not open the throat`);
if (!(r.ar[0].f <= r.ar[1].f && r.ar[1].f <= r.ar[2].f && r.ar[0].f < r.ar[2].f)) fails.push('a looser housing does not bring full boost later');
console.log(`== the preview moves nothing: ${r.still}; fitted: ${JSON.stringify(r.fit)}; travels: ${JSON.stringify(r.travel)} ==`);
if (r.tqLimit) fails.push('the Supra has an ECU torque limit now: fit-check another engine');
if (!r.still) fails.push('opening the turbo designer and previewing changed the build or the lap');
if (!r.fit.part || !r.fit.form || !r.fit.pull || Math.abs(r.fit.exd - 0.06) > 1e-12 || Math.abs(r.fit.k - 52 / 60) > 1e-12 || r.fit.ar !== 0.7)
  fails.push('SAVE & FIT does not fit the turbo as previewed');
if (r.travel.lib !== 1 || r.travel.name !== 'TEST TURBO' || Math.abs(r.travel.exd - 0.06) > 1e-12) fails.push('a saved build does not carry its turbo');
console.log(`== page: ${r.guide.split('\n')[1]} ==\n== NA: ${r.na.split('\n')[1]} ==`);
if (!/chokes at/.test(r.guide)) fails.push("the turbo designer's readout is not shown");
if (!/has no turbo/.test(r.na)) fails.push('an engine with no turbo is not told so');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed turbo feeds the shaft model its own wheels and housing, a factory turbo as a part is that turbo, and the preview, fit and save are exact.');
process.exit(fails.length || errors.length ? 1 : 0);
