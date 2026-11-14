// The rear wing as a part (build 291).
//
// WHY THIS EXISTS. A rear wing was a kit with a fitted lift and drag (AERO_REAR). The PARTS page now designs one: span,
// chord, angle, camber and end plates, by lifting-line theory (wingAero). What must hold:
//   · the theory's own numbers: a flat wing of aspect ratio 6 has a lift slope of 2 pi / (1 + 2/6) per radian, and its
//     induced drag is CL^2 / (pi AR);
//   · the physics: more angle, span or camber gives more downforce; end plates give more lift for less induced drag;
//     past the stall the lift is held and the wing is flagged;
//   · the preview moves nothing; SAVE & FIT puts exactly the wing's ClA and CdA on the car, on the rear axle; a kit
//     car is as it was once the wing is deleted;
//   · it works on an electric car, and travels with a build.
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
  const W = x => wingAero(normPart(Object.assign({ kind: 'wing', span_mm: 1500, chord_mm: 250, angle_deg: 6, camber_pct: 0, plate_mm: 0 }, x)));
  // 1. the theory
  const flat = W({}); o.flat = { AR: flat.AR, slope: flat.slope, CL: flat.CL, cdi: flat.cdi };
  // 2. the physics
  o.angle = [2, 6, 10].map(a => W({ angle_deg: a }).clA);
  o.span = [1200, 1500, 1800].map(s => W({ span_mm: s }).clA);
  o.camber = [0, 4, 8].map(c => W({ camber_pct: c }).clA);
  o.plate = [0, 200].map(h => { const q = W({ plate_mm: h }); return { cl: q.CL, cdi: q.cdi / (q.CL * q.CL) }; });
  const st = W({ angle_deg: 25, camber_pct: 12 }); o.stall = { CL: st.CL, flag: st.stalled, max: WING_CLMAX };
  // 3. the preview moves nothing; the fit is the wing
  load('BMW M3 (E46');
  const snap = () => JSON.stringify([vehicle.clA, vehicle.cdA, vehicle.aeroBal, vehicle.cost, perf.t100, perf.topSpeed, simulateLap('mixed').time]);
  const before = snap(), kit = { clA: vehicle.clA, cdA: vehicle.cdA, rear: vehicle.aeroRear, clF: vehicle.clA * vehicle.aeroBal };
  const k = AERO_REAR[vehicle.aeroRear] || AERO_REAR.none, base = { clA: vehicle.clA - k.cl * vehicle.aeroK, cdA: vehicle.cdA - k.cd * vehicle.area };
  partsUI.kind = 'wing'; setTab('parts'); previewPart('wing');
  o.start = partFromEditor('wing'); o.track = vehicle.track;
  o.still = before === snap();
  const q = Object.assign({}, partFromFactory('wing', 'wing'), { name: 'TEST WING', span_mm: 1600, chord_mm: 300, angle_deg: 10, camber_pct: 8, plate_mm: 200 });
  const A = wingAero(normPart(q));
  partsUI.edit.wing = Object.assign({}, q); partToEditor('wing', partsUI.edit.wing);
  document.getElementById('pwSaveFit').click();
  o.fit = { part: !!vehicle.wingPart, cls: vehicle.aeroRear, form: document.getElementById('vhAeroR').value === 'part:' + (vehicle.wingPart && vehicle.wingPart.id),
    dCl: vehicle.clA - (base.clA + A.clA), dCd: vehicle.cdA - (base.cdA + A.cdA), dF: vehicle.clA * vehicle.aeroBal - kit.clF, clA: A.clA, cdA: A.cdA,
    stock: isFactoryFit(readVehicleFromForm()) };
  o.guide = document.getElementById('pwGuide').innerText;
  // 4. it travels with a build
  const saved = serializeBuild('t', '');
  const id = vehicle.wingPart.id;
  partAction('del', id);
  o.del = { part: !!vehicle.wingPart, rear: vehicle.aeroRear, lib: partLib.length };
  load('BMW M3 (E46'); o.back = before === snap();
  applyBuild(saved);
  o.travel = { lib: partLib.length, name: vehicle.wingPart && vehicle.wingPart.name, clA: vehicle.clA - (base.clA + A.clA) };
  // 5. an electric car
  load('Model 3'); o.ev = { electric: isElectric() };
  fitPart(partLib[0].id); setTab('parts');
  o.ev.part = !!vehicle.wingPart; o.ev.hidden = document.getElementById('partsWing').hidden; o.ev.clA = vehicle.clA;
  return o;
});
await browser.close();

const near = (a, b, e = 1e-12) => Math.abs(a - b) <= e;
console.log(`== a flat wing, AR ${r.flat.AR}: slope ${r.flat.slope.toFixed(4)} /rad, CL ${r.flat.CL.toFixed(4)} at 6°, induced ${r.flat.cdi.toFixed(5)} ==`);
if (!near(r.flat.AR, 6) || !near(r.flat.slope, 2 * Math.PI / (1 + 2 / 6)) || !near(r.flat.CL, r.flat.slope * 6 * Math.PI / 180) || !near(r.flat.cdi, r.flat.CL ** 2 / (Math.PI * 6)))
  fails.push('the wing is not the lifting line');
const up = a => a[0] < a[1] && a[1] < a[2], f2 = a => a.map(x => x.toFixed(3)).join(' / ');
console.log(`== ClA, angle 2/6/10°: ${f2(r.angle)}; span 1.2/1.5/1.8 m: ${f2(r.span)}; camber 0/4/8%: ${f2(r.camber)} ==`);
if (!up(r.angle)) fails.push('more angle does not give more downforce');
if (!up(r.span)) fails.push('more span does not give more downforce');
if (!up(r.camber)) fails.push('more camber does not give more downforce');
console.log(`== end plates 0 / 200 mm: CL ${r.plate.map(p => p.cl.toFixed(3)).join(' / ')}, induced drag per CL² ${r.plate.map(p => p.cdi.toFixed(4)).join(' / ')} ==`);
if (!(r.plate[1].cl > r.plate[0].cl && r.plate[1].cdi < r.plate[0].cdi)) fails.push('end plates do not help');
if (r.stall.CL !== r.stall.max || !r.stall.flag) fails.push('a wing past its stall is not held and flagged');
console.log(`== starts from ${r.start.span_mm} mm on a ${r.track} m track; the preview moves nothing: ${r.still} ==`);
if (!r.still) fails.push('opening the wing designer and previewing changed the car');
if (r.start.span_mm !== Math.round(r.track * 100) * 10) fails.push("the starting wing is not as wide as the car's track");
console.log(`== fitted: ${JSON.stringify(r.fit)} ==`);
if (!r.fit.part || r.fit.cls !== 'wing' || !r.fit.form || !near(r.fit.dCl, 0) || !near(r.fit.dCd, 0) || !near(r.fit.dF, 0) || r.fit.stock)
  fails.push('SAVE & FIT does not put the wing as previewed on the car, on its rear axle');
if (!/Downforce/.test(r.guide) || !/kg/.test(r.guide)) fails.push("the wing designer's readout is not shown");
console.log(`== deleted: ${JSON.stringify(r.del)}; the factory car again: ${r.back}; travels: ${JSON.stringify(r.travel)} ==`);
if (r.del.part || r.del.rear !== 'wing' || r.del.lib !== 0) fails.push('deleting the fitted wing does not leave the kit wing');
if (!r.back) fails.push('the factory car is not as it was after the wing came off');
if (r.travel.lib !== 1 || r.travel.name !== 'TEST WING' || !near(r.travel.clA, 0)) fails.push('a saved build does not carry its wing');
console.log(`== electric: ${JSON.stringify(r.ev)} ==`);
if (!r.ev.electric) fails.push('the Model 3 is not electric any more: pick another');
if (!r.ev.part || r.ev.hidden || !(r.ev.clA > 0)) fails.push('an electric car cannot design and wear a wing');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed rear wing is the lifting line, lands on the rear axle as previewed, and saves, fits and comes off cleanly.');
process.exit(fails.length || errors.length ? 1 : 0);
