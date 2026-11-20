// Springs, bars and dampers as a part (build 420).
//
// WHY THIS EXISTS. Build 174's springs and bars, and build 216's dampers, were SOFT -2 .. STIFF +2 steps about the kit
// (SPRING_STEP 1.3, BAR_STEP 1.5, DAMPER_STEP 1.3: fitted numbers). They are now a SPRINGS, BARS & DAMPERS part whose
// rates come from its dimensions. What must hold:
//   · a coil's rate is G d^4 / (8 D^3 n), G 77.2 GPa; a bar's roll stiffness (G pi d^4/32 / L) (MR t / a)^2, G 79.3 GPa;
//     each at the wheel by its motion ratio squared; the damper's mean of bound and rebound, MR^2 of it;
//   · the kit's own rates written as the part (START FROM) move nothing: roll, transfer, damping, ride;
//   · the stepped car reads the part's rebound ratio; SAVE & FIT puts it on the car (not a factory fit);
//   · no factory car carries one, and the steps' constants are gone.
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

const o = await page.evaluate(() => {
  const o = {};
  loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.includes('M3 (E46')));
  const snap = () => [vehicle.rollGrad, vehicle.lltdF, vehicle.zetaF, vehicle.zetaR, vehicle.rideF, vehicle.rideR, vehicle.roughF];
  o.before = snap();
  o.spring = springRate(12, 100, 8); o.springWant = 77.2e9 * 0.012 ** 4 / (8 * 0.1 ** 3 * 8);
  const P = Object.assign(partFromFactory('kit', 'susp'), { mrF: 0.7, barMrF: 0.6, barDF_mm: 22, barArmF_mm: 250, barLF_mm: 900, rbF: 2.5 });
  const v = Object.assign({}, vehicle, { suspPart: P }), a = suspAxle(v, 'F'), t = v.trackF;
  o.ax = { ks: a.ks, ksWant: 0.49 * springRate(P.wireDF_mm, P.coilDF_mm, P.coilsF), kb: a.kb,
    kbWant: 79.3e9 * Math.PI * 0.022 ** 4 / 32 / 0.9 * (0.6 * t / 0.25) ** 2, cs: a.cs, csWant: 0.49 * P.dampF * 3.5 / 2 };
  o.stepCar = { rb: driveBody(v, v.wb * (1 - v.fWt), v.wb * v.fWt).rbF, kit: driveBody(vehicle, vehicle.wb * (1 - vehicle.fWt), vehicle.wb * vehicle.fWt).rbF };
  // START FROM the kit's, SAVE & FIT
  partsUI.kind = 'susp'; setTab('parts'); partsUI.edit.susp = null; renderParts();
  document.getElementById('psSaveFit').click();
  o.fit = { part: !!vehicle.suspPart, form: document.getElementById('vhSuspPart').value === 'part:' + (vehicle.suspPart || {}).id, stock: isFactoryFit(readVehicleFromForm()) };
  o.after = snap();
  o.guide = document.getElementById('psGuide').innerText;
  o.presets = VEHICLE_PRESETS.filter(p => p.vehicle && p.vehicle.suspPart).map(p => p.name);
  o.gone = ['SPRING_STEP', 'BAR_STEP', 'DAMPER_STEP'].filter(n => { try { eval(n); return true; } catch (e) { return false; } });
  return o;
});
await browser.close();

const rel = (a, b) => Math.abs(a / b - 1);
console.log(`coil 12 / 100 mm, 8 coils: ${(o.spring / 1000).toFixed(2)} N/mm (want ${(o.springWant / 1000).toFixed(2)})`);
if (rel(o.spring, o.springWant) > 1e-12) fails.push('a coil is not G d^4 / (8 D^3 n)');
console.log(`front axle: wheel rate ${(o.ax.ks / 1000).toFixed(2)} N/mm (${(o.ax.ksWant / 1000).toFixed(2)}), bar ${(o.ax.kb / 1000).toFixed(1)} kN m/rad (${(o.ax.kbWant / 1000).toFixed(1)}), damping ${o.ax.cs.toFixed(0)} N s/m (${o.ax.csWant.toFixed(0)})`);
if (rel(o.ax.ks, o.ax.ksWant) > 1e-12 || rel(o.ax.kb, o.ax.kbWant) > 1e-9 || rel(o.ax.cs, o.ax.csWant) > 1e-12) fails.push('the axle is not its parts at their motion ratios');
console.log(`stepped car rebound/bound: part ${o.stepCar.rb}, kit ${o.stepCar.kit}`);
if (o.stepCar.rb !== 2.5 || o.stepCar.kit !== 3) fails.push("the stepped car does not read the part's rebound ratio");
console.log(`the kit's as a part, fitted: ${JSON.stringify(o.fit)}`);
const moved = o.before.map((x, i) => rel(o.after[i], x)), worst = Math.max(...moved);
console.log(`  roll, transfer, damping, ride, swing moved at most ${(worst * 100).toExponential(1)}%`);
if (!o.fit.part || !o.fit.form || o.fit.stock) fails.push('SAVE & FIT does not put the part on the car, or the car stays a factory fit');
if (worst > 1e-4) fails.push("the kit's rates as a part move the car: " + moved.join(', '));
if (!/wheel rate/.test(o.guide) || !/Roll/.test(o.guide)) fails.push('the part page does not show the rates');
if (o.presets.length) fails.push('factory cars carry the part: ' + o.presets.join(', '));
if (o.gone.length) fails.push('the steps are still defined: ' + o.gone.join(', '));

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length || errors.length ? 1 : 0);
