// Brake balance as a part (build 312).
//
// WHY THIS EXISTS. Each car's rear brakes were sized to the R13-H line (front locks first up to 0.8 g), with no way to
// change it. The PARTS page now designs a balance bar, two master cylinders and the rear caliper and rotor. What must hold:
//   · the hydraulics: each line's pressure is 2 x its bar share x (19.05 / bore)^2 of BRAKE_LINE_BAR, and the front
//     share is f / (f + r) from the pistons and rotors; more bar, a smaller front bore or a smaller rear piston move it forward;
//   · the car's own brakes written as the part give the share it has now;
//   · the lock order: no-ABS lock points mu fW/(fH - mu h/L) and mu (1-fW)/(1-fH + mu h/L), the first one locks;
//   · the preview moves nothing; SAVE & FIT puts it on the car (its share and brake force, and the cost); deleting it puts the
//     R13-H rear back; it travels with a build; no factory car carries one.
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
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46')));
  const snap = () => JSON.stringify([vehicle.brakeFrontShare, vehicle.brakeDecelCap, vehicle.cost, simulateLap('mixed').lap]);
  const before = snap(), fH0 = vehicle.brakeFrontShare, cost0 = vehicle.cost;
  const base = partFromFactory('r13h', 'brake');
  const share = x => { const t = Object.assign({}, vehicle, { brakePart: normPart(Object.assign({}, base, x)) }); brakeForceCap(t); return t.brakeFrontShare; };
  o.factory = { fH0, part: share({}) };
  o.press = brakePartPress(normPart(Object.assign({}, base, { bar_pct: 60, mcF_mm: 22, mcR_mm: 17 })));
  o.bar = [40, 50, 60].map(b => share({ bar_pct: b }));
  o.mcF = [22, 19.05, 16].map(d => share({ mcF_mm: d }));
  o.pist = [50, 40, 30].map(d => share({ rearPistonD_mm: d }));
  o.lockF = brakeLockOrder(0.75, 1, 0.5, 0.2); o.lockR = brakeLockOrder(0.55, 1, 0.5, 0.2);
  o.presets = FACTORY_CARS.filter(c => c.fit && c.fit.brakePart).length;
  partsUI.kind = 'brake'; setTab('parts'); previewPart('brake');
  o.still = before === snap(); o.shown = !document.getElementById('partsBrake').hidden; o.guide = document.getElementById('pkGuide').innerText;
  const q = Object.assign({}, base, { name: 'TEST BAL', bar_pct: 45 });
  partsUI.edit.brake = Object.assign({}, q); partToEditor('brake', partsUI.edit.brake);
  document.getElementById('pkSaveFit').click();
  const tq = Object.assign({}, vehicle, { brakePart: normPart(Object.assign({}, base, { bar_pct: 45 })) });
  o.fit = { part: !!vehicle.brakePart, fH: vehicle.brakeFrontShare, want: share({ bar_pct: 45 }), cap: vehicle.brakeDecelCap, capWant: brakeForceCap(tq) / vehicle.mass,
    form: document.getElementById('vhBrakeBal').value === 'part:' + (vehicle.brakePart && vehicle.brakePart.id), stock: isFactoryFit(readVehicleFromForm()), cost: vehicle.cost - cost0 };
  const saved = serializeBuild('t', '');
  partAction('del', vehicle.brakePart.id);
  o.del = { part: !!vehicle.brakePart, fH: vehicle.brakeFrontShare, fH0 };
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46'))); o.del.back = before === snap();
  applyBuild(saved);
  o.travel = { name: vehicle.brakePart && vehicle.brakePart.name, fH: vehicle.brakeFrontShare };
  return o;
});
await browser.close();

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e, f3 = a => a.map(x => x.toFixed(4)).join(' / ');
console.log(`== the car's own brakes as the part: share ${r.factory.part.toFixed(5)} (now ${r.factory.fH0.toFixed(5)}) ==`);
if (!near(r.factory.part, r.factory.fH0, 2e-4)) fails.push("the car's own brakes written as the part do not give the share it has");
const k = d => (19.05 / d) ** 2;
console.log(`== 60% bar, 22/17 mm bores: front ${r.press.f.toFixed(4)}, rear ${r.press.r.toFixed(4)} of the line pressure ==`);
if (!near(r.press.f, 1.2 * k(22)) || !near(r.press.r, 0.8 * k(17))) fails.push('the line pressures are not the bar over each bore');
const up = a => a.every((x, i) => i === 0 || x > a[i - 1]);
console.log(`== front share: bar 40/50/60% ${f3(r.bar)}; front bore 22/19.05/16 ${f3(r.mcF)}; rear piston 50/40/30 ${f3(r.pist)} ==`);
if (!up(r.bar) || !up(r.mcF) || !up(r.pist)) fails.push('the share does not follow the bar, the bores and the pistons');
console.log(`== lock order: 75% ${JSON.stringify(r.lockF)}; 55% ${JSON.stringify(r.lockR)} ==`);
if (r.lockF.first !== 'front' || r.lockR.first !== 'rear' || !near(r.lockF.zF, 0.5 / 0.55) || !near(r.lockR.zR, 0.5 / 0.65) || !near(r.lockF.zc, 1.25)) fails.push('the lock order is not the axles\' grip at a fixed share');
if (r.presets) fails.push(r.presets + ' factory cars carry a designed brake balance');
console.log(`== preview moves nothing: ${r.still}, shown ${r.shown}; fitted ${JSON.stringify(r.fit)} ==`);
if (!r.still || !r.shown || !/Front share/.test(r.guide)) fails.push("the brake designer's preview is not shown, or moved the car");
if (!r.fit.part || !near(r.fit.fH, r.fit.want) || !r.fit.form || r.fit.stock || r.fit.cost !== 800 || !near(r.fit.cap, r.fit.capWant)) fails.push('SAVE & FIT does not put the balance on the car');
console.log(`== deleted ${JSON.stringify(r.del)}; travels ${JSON.stringify(r.travel)} ==`);
if (r.del.part || !near(r.del.fH, r.del.fH0) || !r.del.back) fails.push('deleting the fitted balance does not put the R13-H rear back');
if (r.travel.name !== 'TEST BAL' || !near(r.travel.fH, r.fit.want)) fails.push('a saved build does not carry its brake balance');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a designed brake balance sets the front share from its hydraulics, shows which axle locks first, and fits, saves and comes off cleanly.');
process.exit(fails.length || errors.length ? 1 : 0);
