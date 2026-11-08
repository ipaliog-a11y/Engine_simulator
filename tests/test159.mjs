// The camshaft as a part (build 249).
//
// WHY THIS EXISTS. The four factory cams were always only valve events read by the breathing model: duration, lift,
// lobe separation, lobe profile and a phaser's range. The PARTS page now designs a cam with its own numbers, and the
// rest of the build (the fitted grade, idle, sprite, cost) takes the factory cam nearest in duration and separation.
// What must hold:
//   · a factory cam written down as a part is that cam, exactly, on an NA six, a turbo four and a hybrid four; and
//     splitting the cam and the charge path out of the build moved nothing (the fingerprint is identical);
//   · the physics: a longer duration fills best higher up; a tighter separation overlaps more; more lift and a harder
//     lobe float the valves sooner; the phaser's range is the one a designed cam carries;
//   · the preview moves nothing and is the fitted build; the part fits as its class and travels with a build;
//   · a port-timed engine is told a cam changes nothing.
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
  // 1. the factory cams as parts
  o.fac = [];
  for (const car of ['BMW M3 (E46', 'Golf GTI (Mk7', 'Ioniq']) {
    load(car);
    for (const k of ['stock', 'sport', 'race', 'atkinson']) {
      const a = camReport(k), p = partFromFactory(k, 'cam');
      o.fac.push({ car: vehicle.body.name, k, hp: a.peakHP, cls: camClass(p), d: maxDiff(a, camReport(p)) });
    }
  }
  // 2. the physics, on the M3
  load('BMW M3 (E46');
  const base = partFromFactory('sport', 'cam'), R = x => camReport(Object.assign({}, base, x));
  o.dur = [236, 252, 276].map(d => R({ dur: d }).ramPeakRpm);
  o.lsa = [114, 110, 104].map(l => R({ lsa: l }).overlap);
  o.lift = [7, 8.5, 10].map(l => R({ lift_mm: l }).floatRpm);
  o.prof = ['gentle', 'street', 'race'].map(k => R({ profile: k }).floatRpm);
  o.auth = [15, 45].map(v => R({ vvt_deg: v }).auth);
  // 3. the preview moves nothing, and is the build
  const before = { score: json(engine.score), pull: json(wotPull()), lap: json(simulateLap('mixed')) };
  partsUI.kind = 'cam'; setTab('parts'); previewPart('cam');
  o.still = before.score === json(engine.score) && before.pull === json(wotPull()) && before.lap === json(simulateLap('mixed'));
  const q = Object.assign({}, base, { name: 'TEST CAM', dur: 278, lsa: 107, lift_mm: 9.2 });
  const pre = camReport(q);
  partsUI.edit.cam = Object.assign({}, q); partToEditor('cam', partsUI.edit.cam);
  document.getElementById('pcSaveFit').click();
  o.fit = { part: !!engine.camPart, cls: engine.cam, form: document.getElementById('edCam').value === 'part:' + (engine.camPart && engine.camPart.id),
    pull: json(wotPull().pts) === json(pre.pts), lift: engine.ivLift_mm };
  // 4. it travels with a build
  const saved = serializeBuild('t', '');
  partLib = []; persistParts(); fillPartSelects(); load('Golf GTI (Mk7');
  applyBuild(saved);
  o.travel = { lib: partLib.length, name: engine.camPart && engine.camPart.name, cls: engine.cam };
  // 5. the page, and a port-timed engine
  o.guide = document.getElementById('pcGuide').innerText;
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === '1.3 Rotary NA (Renesis)').engine)); buildEngine();
  partsUI.edit.cam = null; setTab('parts'); o.rotary = document.getElementById('pcGuide').innerText;
  return o;
});
await browser.close();

console.log('== the factory cams as parts: peak power, class, largest torque difference ==');
for (const c of r.fac) {
  console.log(`  ${c.car.padEnd(30)} ${c.k.padEnd(9)} ${String(c.hp).padStart(4)} hp  ${c.cls.padEnd(9)} ${(c.d * 100).toExponential(1)}%`);
  if (c.d > 1e-5) fails.push(`${c.car} ${c.k}: the part is not the factory cam`);
  if (c.cls !== c.k) fails.push(`${c.car} ${c.k}: the part's class is ${c.cls}`);
}
console.log(`== duration 236/252/276: fills best at ${r.dur.join(' / ')} rpm; separation 114/110/104: overlap ${r.lsa.join(' / ')} deg ==`);
console.log(`== float at lift 7/8.5/10 mm: ${r.lift.map(Math.round).join(' / ')} rpm; lobe gentle/street/race: ${r.prof.map(Math.round).join(' / ')}; phaser ${r.auth.join(' / ')} ==`);
if (!(r.dur[0] < r.dur[1] && r.dur[1] < r.dur[2])) fails.push('a longer duration does not fill best higher up');
if (!(r.lsa[0] < r.lsa[1] && r.lsa[1] < r.lsa[2])) fails.push('a tighter separation does not overlap more');
if (!(r.lift[0] > r.lift[1] && r.lift[1] > r.lift[2])) fails.push('more lift does not float sooner');
if (!(r.prof[0] > r.prof[1] && r.prof[1] > r.prof[2])) fails.push('a harder lobe does not float sooner');
if (r.auth[0] !== 15 || r.auth[1] !== 45) fails.push('the phaser range is not the part\'s');
console.log(`== the preview moves nothing: ${r.still}; fitted: ${JSON.stringify(r.fit)}; travels: ${JSON.stringify(r.travel)} ==`);
if (!r.still) fails.push('opening the cam designer and previewing changed the build or the lap');
if (!r.fit.part || r.fit.cls !== 'race' || !r.fit.form || !r.fit.pull || Math.abs(r.fit.lift - 9.2) > 1e-9) fails.push('SAVE & FIT does not fit the cam as previewed, as its class');
if (r.travel.lib !== 1 || r.travel.name !== 'TEST CAM' || r.travel.cls !== 'race') fails.push('a saved build does not carry its cam');
console.log(`== page: ${r.guide.split('\n')[1]} ==\n== rotary: ${r.rotary.split('\n')[1]} ==`);
if (!/Overlap/.test(r.guide)) fails.push('the cam designer\'s readout is not shown');
if (!/no poppet valves/.test(r.rotary)) fails.push('a rotary is not told a cam changes nothing');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed cam feeds the breathing model its own valve events, a factory cam as a part is that cam, and the preview, fit and save are exact.');
process.exit(fails.length || errors.length ? 1 : 0);
