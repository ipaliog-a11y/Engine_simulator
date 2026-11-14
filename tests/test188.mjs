// The differential as a part (build 308).
//
// WHY THIS EXISTS. The diff was a factory table with a fitted traction, scrub and lock (DIFF). The PARTS page now
// designs a clutch-plate LSD: preload, ramp angle, friction faces and the two radii. What must hold:
//   · the ramp's statics: lock L = 2 faces mu rFace cot(ramp) / rRamp, at most 1; a 90° ramp has none; bias (1+L)/(1-L);
//   · the physics: with no lock and no preload it puts down what the open diff does; more lock, more faces, a steeper
//     ramp or more preload put down more, never past the whole axle;
//   · the preview moves nothing; SAVE & FIT puts the part on the car (the 0-100 reads it), and deleting it leaves the
//     table's clutch-plate LSD; it travels with a build;
//   · no factory car carries one (the fingerprint of the presets is unchanged).
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
  const P = x => normPart(Object.assign({ kind: 'diff', preload_Nm: 0, ramp_deg: 45, faces: 3, rFace_mm: 40, rRamp_mm: 40 }, x));
  const U = (x, g = 0, Tg = 3000) => diffTractionAt(diffSpec(P(x)), g * G, 0.5, 1, Tg);
  o.lock = [P({}), P({ ramp_deg: 30 }), P({ ramp_deg: 90 }), P({ faces: 10, ramp_deg: 25 })].map(diffPartLock);
  o.tbr = diffSpec(P({})).tbr; o.mu = DIFF_MU;
  o.open = { part: U({ ramp_deg: 90 }), open: diffTractionAt(DIFF.open, 0, 0.5, 1), partG: U({ ramp_deg: 90 }, 0.8), openG: diffTractionAt(DIFF.open, 0.8 * G, 0.5, 1) };
  o.ramp = [90, 60, 45, 30].map(a => U({ ramp_deg: a, faces: 1 }, 0.6));
  o.faces = [1, 2, 3].map(f => U({ faces: f, ramp_deg: 60 }, 0.6));
  o.pre = [0, 100, 200].map(t => U({ preload_Nm: t, ramp_deg: 90 }, 0.6));
  o.max = U({ faces: 10, ramp_deg: 25, preload_Nm: 400 }, 1.2);
  o.presets = FACTORY_CARS.filter(c => c.fit && c.fit.diffPart).length;
  // the preview, the fit, the delete
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46')));
  const snap = () => JSON.stringify([vehicle.diff, vehicle.diffTraction, vehicle.cost, perf.t100, simulateLap('mixed').time]);
  const before = snap(), t100 = perf.t100;
  partsUI.kind = 'diff'; setTab('parts'); previewPart('diff');
  o.still = before === snap(); o.shown = !document.getElementById('partsDiff').hidden; o.guide = document.getElementById('pdGuide').innerText;
  const q = Object.assign({}, partFromFactory('clsd', 'diff'), { name: 'TEST DIFF', ramp_deg: 60, faces: 2, preload_Nm: 100 });
  partsUI.edit.diff = Object.assign({}, q); partToEditor('diff', partsUI.edit.diff);
  document.getElementById('pdSaveFit').click();
  o.fit = { part: !!vehicle.diffPart, cls: vehicle.diff, lock: vehicle.df.lock, want: diffPartLock(normPart(q)),
    form: document.getElementById('vhDiff').value === 'part:' + (vehicle.diffPart && vehicle.diffPart.id), stock: isFactoryFit(readVehicleFromForm()), t100: perf.t100, t0: t100 };
  const saved = serializeBuild('t', '');
  partAction('del', vehicle.diffPart.id);
  o.del = { part: !!vehicle.diffPart, cls: vehicle.diff, df: vehicle.df === DIFF.clsd };
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46'))); o.del.back = before === snap();
  applyBuild(saved);
  o.travel = { name: vehicle.diffPart && vehicle.diffPart.name, lock: vehicle.df.lock };
  return o;
});
await browser.close();

const near = (a, b, e = 1e-12) => Math.abs(a - b) <= e, f3 = a => a.map(x => x.toFixed(3)).join(' / ');
const L = (f, a, rf = 40, rr = 40) => Math.min(1, 2 * f * r.mu * rf / rr / Math.tan(a * Math.PI / 180));
console.log(`== lock 45°/30°/90°/max: ${f3(r.lock)}; bias at 45° ${r.tbr.toFixed(3)} ==`);
if (!near(r.lock[0], L(3, 45)) || !near(r.lock[1], L(3, 30)) || r.lock[2] !== 0 || r.lock[3] !== 1 || !near(r.tbr, (1 + r.lock[0]) / (1 - r.lock[0])))
  fails.push("the lock is not the ramp's statics");
console.log(`== no lock, no preload: ${r.open.part.toFixed(4)} (open ${r.open.open.toFixed(4)}), at 0.8 g ${r.open.partG.toFixed(4)} (open ${r.open.openG.toFixed(4)}) ==`);
if (!near(r.open.part, r.open.open) || !near(r.open.partG, r.open.openG)) fails.push('a diff with no lock is not the open diff');
const up = a => a.every((x, i) => i === 0 || x > a[i - 1]);
console.log(`== at 0.6 g: ramp 90/60/45/30° ${f3(r.ramp)}; faces 1/2/3 ${f3(r.faces)}; preload 0/100/200 N m ${f3(r.pre)}; most ${r.max} ==`);
if (!up(r.ramp) || !up(r.faces) || !up(r.pre)) fails.push('more lock or preload does not put down more');
if (r.max !== 1) fails.push('a locked diff does not put down exactly the whole axle');
if (r.presets) fails.push(r.presets + ' factory cars carry a designed diff');
console.log(`== preview moves nothing: ${r.still}, shown ${r.shown}; fitted ${JSON.stringify(r.fit)} ==`);
if (!r.still || !r.shown || !/torque bias ratio/.test(r.guide)) fails.push("the diff designer's preview is not shown, or moved the car");
if (!r.fit.part || r.fit.cls !== 'clsd' || !r.fit.form || r.fit.stock || !near(r.fit.lock, r.fit.want) || !(r.fit.t100 > 0)) fails.push('SAVE & FIT does not put the diff on the car');
console.log(`== deleted ${JSON.stringify(r.del)}; travels ${JSON.stringify(r.travel)} ==`);
if (r.del.part || r.del.cls !== 'clsd' || !r.del.df || !r.del.back) fails.push("deleting the fitted diff does not leave the table's clutch-plate LSD, or the factory car is not as it was");
if (r.travel.name !== 'TEST DIFF' || !near(r.travel.lock, r.fit.want)) fails.push('a saved build does not carry its diff');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log("\nOK: a designed clutch-plate LSD locks by its ramp's statics, puts down what that lock and preload allow, and fits, saves and comes off cleanly.");
process.exit(fails.length || errors.length ? 1 : 0);
