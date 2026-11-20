// Tyre pressure as a part (build 313); into stiffness, load capacity and grip (build 416).
//
// WHY THIS EXISTS. Every car's tyres stood for one inflation pressure (TYRE_KZ, the compounds' Crr, RACE_TREAD's
// kPa). The PARTS page now sets a cold pressure front and rear. What must hold:
//   · fitted at the reference pressure (TYRE_P_REF) it moves nothing: stiffness, rolling resistance, 0-100;
//   · the stiffness is Rhyne's relation at the set pressure (224 kN/m on a 205/55R16 at 230 kPa); the Crr as
//     pressure^-0.4 (SAE J2452), the axles by load;
//   · each axle's reference load (grip's load sensitivity) moves with the ETRTO load capacity, (p + 44.5)/(250 + 44.5)
//     of the load index, capped at 250 kPa;
//   · the hot pressure is the cold one at constant volume; more pressure aquaplanes later in the race;
//   · SAVE & FIT puts it on the car (not a factory fit), a factory car loaded after has none, and it travels with a build;
//   · no factory car carries one.
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
  const o = {}, preset = () => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('BMW M3 (E46')));
  preset();
  const snap = () => [vehicle.crr, quarterCar(vehicle, 'F').kt, quarterCar(vehicle, 'R').kt, perf.t100, vehicle.FzRefF, vehicle.FzRef];
  o.before = snap(); o.ref = TYRE_P_REF; o.fWt = vehicle.fWt; o.kz205 = tyreKz(205, 2 * 205 * 0.55 + 16 * 25.4, 230);
  const tw = a => (a === 'F' && vehicle.tireWidthF) || vehicle.tireWidth, od = 2000 * vehicle.rTire;
  o.want = p => ['F', 'R'].map((a, i) => tyreKz(tw(a), od, p[i]));
  const fit = (f, rr, name) => { const q = Object.assign(partFromFactory('ref', 'tyre'), { name, front_kPa: f, rear_kPa: rr });
    partsUI.kind = 'tyre'; partsUI.edit.tyre = Object.assign({}, q); partToEditor('tyre', q); document.getElementById('pySaveFit').click(); };
  partsUI.kind = 'tyre'; setTab('parts'); previewPart('tyre');
  o.shown = !document.getElementById('partsTyre').hidden; o.guide = document.getElementById('pyGuide').innerText;
  fit(TYRE_P_REF, TYRE_P_REF, 'REF'); o.atRef = snap();
  fit(300, 200, 'TEST PRESSURES');
  o.fit = { part: !!vehicle.tyrePart, form: document.getElementById('vhTyreP').value === 'part:' + vehicle.tyrePart.id, stock: isFactoryFit(readVehicleFromForm()) };
  o.after = snap(); o.wantKt = o.want([300, 200]);
  o.hot = tyreHotKPa(230, 80);
  const ty = raceCompound('sport'); o.wet = [0, 150, 300].map(k => raceWetKeep(ty, RACE.wetFull, 90 / 3.6, 12, k));
  const saved = serializeBuild('t', '');
  preset(); o.cleared = !vehicle.tyrePart && JSON.stringify(snap()) === JSON.stringify(o.before);
  applyBuild(saved); o.travel = vehicle.tyrePart && vehicle.tyrePart.name;
  o.presets = FACTORY_CARS.filter(c => c.fit && c.fit.tyrePart).length;
  return o;
});
await browser.close();

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
console.log(`== before ${r.before.map(x => +x.toPrecision(5)).join(' / ')}; at ${r.ref} kPa ${r.atRef.map(x => +x.toPrecision(5)).join(' / ')} ==`);
if (!r.before.every((x, i) => near(x, r.atRef[i]))) fails.push('the reference pressure, fitted, moves the car');
const crrWant = r.before[0] * (r.fWt * Math.pow(300 / r.ref, -0.4) + (1 - r.fWt) * Math.pow(200 / r.ref, -0.4));
console.log(`== 300/200 kPa: Crr ${r.after[0].toFixed(5)} (want ${crrWant.toFixed(5)}), kt ${(r.after[1] / 1e3).toFixed(1)} / ${(r.after[2] / 1e3).toFixed(1)} kN/m, 0-100 ${r.after[3].toFixed(3)} s ==`);
if (!near(r.after[0], crrWant)) fails.push('the rolling resistance does not follow pressure^-0.4');
if (!near(r.after[1], r.wantKt[0]) || !near(r.after[2], r.wantKt[1])) fails.push("the stiffness is not Rhyne's relation at the set pressure");
console.log(`== Rhyne: 205/55R16 at 230 kPa ${(r.kz205 / 1e3).toFixed(1)} kN/m; FzRef front x${(r.after[4] / r.before[4]).toFixed(4)}, rear x${(r.after[5] / r.before[5]).toFixed(4)} ==`);
if (!(Math.abs(r.kz205 / 1e3 - 223.6) < 0.5)) fails.push("Rhyne's relation does not give 224 kN/m on a 205/55R16 at 230 kPa");
if (!near(r.after[4] / r.before[4], 294.5 / 274.5) || !near(r.after[5] / r.before[5], 244.5 / 274.5)) fails.push('the reference load does not follow the ETRTO load capacity');
const hot = (230 + 101.3) * (273.15 + 80) / 293.15 - 101.3;
console.log(`== 230 kPa cold at 80 °C: ${r.hot.toFixed(1)} kPa hot; wet keep at 90 km/h, compound's/150/300 kPa: ${r.wet.map(x => x.toFixed(3)).join(' / ')} ==`);
if (!near(r.hot, hot)) fails.push('the hot pressure is not the cold one at constant volume');
if (!(r.wet[2] > r.wet[1])) fails.push('more pressure does not aquaplane later');
console.log(`== editor shown ${r.shown}; fitted ${JSON.stringify(r.fit)}; preset after clears it ${r.cleared}; travels ${r.travel} ==`);
if (!r.shown || !/aquaplanes at/.test(r.guide) || !/carries \d+ kg/.test(r.guide)) fails.push("the pressure editor's preview is not shown");
if (!r.fit.part || !r.fit.form || r.fit.stock) fails.push('SAVE & FIT does not put the pressures on the car');
if (!r.cleared) fails.push('a factory car loaded after keeps the pressures');
if (r.travel !== 'TEST PRESSURES') fails.push('a saved build does not carry its pressures');
if (r.presets) fails.push(r.presets + ' factory cars carry designed pressures');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: tyre pressures set stiffness, load capacity, grip, rolling resistance and the aquaplaning speed, and change nothing at the reference.');
process.exit(fails.length || errors.length ? 1 : 0);
