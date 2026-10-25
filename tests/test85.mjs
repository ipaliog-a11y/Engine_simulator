// Axle balance (build 157). Until now the lap pooled all four tyres' lateral grip, so no car could understeer or
// oversteer: the front and rear always ran out together. Now each axle has its own load (weight split and aero
// balance), its own share of the lateral load transfer (the roll-stiffness split: since build 172 the anti-roll bars on VEHICLE), its own
// tyres (a staggered car's narrower fronts) and must make the side force for the mass it carries; the car corners as
// hard as the axle that runs out first. Braking moves load forward, so the rear runs out first on the brakes.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const r = await page.evaluate(() => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input')); };
  const load = n => loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.includes(n)));
  const lap = () => { const L = simulateLap('mixed'); return { lap: L.lap, under: L.balance.under, over: L.balance.over, margin: L.balance.margin }; };
  const out = {};
  load('Golf GTI'); out.golf = lap();
  load('911 GT3'); out.gt3 = lap();
  load('M3 (E46'); out.m3 = lap(); out.m3Stock = isFactoryFit(readVehicleFromForm());
  set('vhBarF', 2); out.m3Stiff = lap(); out.m3StiffStock = isFactoryFit(readVehicleFromForm());
  set('vhBarF', -2); out.m3Soft = lap();
  load('Huracán LP610'); out.hur = lap();
  set('vhTireWF', 305); out.hurSquare = lap();
  // the axles at a corner, steady and on the brakes
  load('M3 (E46');
  const N = vehicle.mass * 9.81, ay = 9;
  const st = latBalance(N, ay, 0, 0), br = latBalance(N, ay, 0, vehicle.mass * 8 * vehicle.cg / vehicle.wb);
  out.axles = { stF: st.muF, stR: st.muR, brF: br.muF, brR: br.muR };
  // a symmetric car: same tyres, 50/50, no downforce, neutral bars, the same track and geometry at both ends
  // (build 171): the axles run out together
  const sv = { fWt: vehicle.fWt, lltdF: vehicle.lltdF, FzRefF: vehicle.FzRefF, trackF: vehicle.trackF, trackR: vehicle.trackR,
    camRecF: vehicle.camRecF, camRecR: vehicle.camRecR, camberF: vehicle.camberF, camberR: vehicle.camberR };
  vehicle.fWt = 0.5; vehicle.lltdF = 0.5; vehicle.FzRefF = vehicle.FzRef;
  vehicle.trackF = vehicle.trackR; vehicle.camRecF = vehicle.camRecR; vehicle.camberF = vehicle.camberR;
  const sym = latBalance(N, ay, 0, 0); out.sym = { F: sym.muF, R: sym.muR };
  Object.assign(vehicle, sv);
  // the readout
  load('Golf GTI'); document.getElementById('tabTrack').click();
  out.cell = [...document.querySelectorAll('#lapGrid .perf-cell')].map(c => c.textContent).find(t => /BALANCE/.test(t)) || '';
  return out;
});

const f = x => `${x.lap.toFixed(2)} s, margin ${(x.margin * 100).toFixed(1)}%`;
console.log('== balance through the corners of Riverside GP (margin: + = the rear has grip to spare, understeer) ==');
console.log(`  Golf GTI (front-heavy) ${f(r.golf)} · 911 GT3 (rear-engined) ${f(r.gt3)}`);
console.log(`  M3 E46: soft front bars ${f(r.m3Soft)} · neutral ${f(r.m3)} · stiff front ${f(r.m3Stiff)}`);
console.log(`  Huracán: factory 245 fronts ${f(r.hur)} · square 305s ${f(r.hurSquare)}`);
console.log(`  M3 axles at 0.9 g: steady front ${r.axles.stF.toFixed(3)} rear ${r.axles.stR.toFixed(3)} · braking 0.8 g front ${r.axles.brF.toFixed(3)} rear ${r.axles.brR.toFixed(3)}`);
console.log(`  readout: "${r.cell}"`);
if (!(r.golf.margin > 0.02 && r.golf.under > r.golf.over)) fails.push('a front-heavy hatch does not understeer');
if (!(r.gt3.margin < -0.02 && r.gt3.over > r.gt3.under)) fails.push('a rear-engined 911 does not oversteer');
if (!(r.m3Soft.margin < r.m3.margin && r.m3.margin < r.m3Stiff.margin)) fails.push('stiffer front bars do not move the balance toward understeer');
if (!r.m3Stock || r.m3StiffStock) fails.push('the roll balance is not part of the factory fit');
if (!(r.hurSquare.margin < r.hur.margin)) fails.push('narrower front tyres on a mid-engined car do not move the balance toward understeer');
if (!(r.axles.brR < r.axles.stR && r.axles.brF > r.axles.stF)) fails.push('braking does not move grip from the rear axle to the front');
if (!(Math.abs(r.sym.F - r.sym.R) < 1e-9)) fails.push('a symmetric car is out of balance');
if (!/UNDERSTEER/.test(r.cell)) fails.push('the TRACK readout does not show the balance');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
