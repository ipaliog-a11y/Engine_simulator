// Economy road: a distance DP for the speed plan, and honest fuel at full load (build BNUM).
//
// WHY THIS EXISTS. The economy run's speed plan was a capped eco driver; build BNUM adds a dynamic programme over
// distance (ecoDP: least fuel or pack energy + λ × time, λ searched to meet the target) and closes a pricing hole in
// ecoFuelKg (a demand past the fuel map's full load cost 3 × idle). What must hold:
//   · MX-5 at Alpine Pass and Model 3 on the Dragon: the DP is kept, finishes on the target (≤ target, within 2%),
//     and spends less than the eco driver alone (ECO_DP.on = false);
//   · the engine car's fuel is physical: positive wheel work / fuel energy (LHV 43 MJ/kg) stays under 0.42;
//   · on a flat straight at 3 × its fastest time the MX-5 pulses and glides (speed swings ≥ 4 km/h, repeatedly),
//     and saves on a constant-speed plan of the same time; the Model 3 does not need to (it cruises);
//   · a hybrid keeps the eco driver's plan (no DP) and its hybrid result;
//   · the CHALLENGES head shows ECO DRIVER DP without a page error. Solve times are printed, not judged.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(async () => {
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
  const q = R => R.ev ? R.kWh : R.fuelL;
  const pair = road => {
    const dp = simulateEconomyChallenge(road, 1.25);
    ECO_DP.on = false; const eco = simulateEconomyChallenge(road, 1.25); ECO_DP.on = true;
    return { dp: q(dp), eco: q(eco), used: dp.ecoDP, ms: dp.dpMs, t: dp.time, target: dp.target, R: dp };
  };
  const out = {};
  load('MX-5 2.0'); const a = pair('alpine');
  // positive wheel work against fuel energy on the kept profile
  const line = a.R.road.line, v = a.R.v, m = vehicle.mass + FUEL_CYCLE.massAdd, rT = vehicle.rTire, fd = vehicle.finalDrive;
  const meff = m + (vehicle.wheelI || 0) / (rT * rT) + (engine.inertia || 0.15) * (vehicle.ratios[0] * fd / rT) ** 2;
  let W = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const ds = line[i].ds3, vm = Math.max(0.5, (v[i] + v[i + 1]) / 2), acc = (v[i + 1] ** 2 - v[i] ** 2) / (2 * Math.max(0.05, ds));
    const F = meff * acc + 0.5 * AIR_RHO * vehicle.cdA * vm * vm + crrAt(vehicle.crr, vm) * m * G * line[i].cosT + m * G * line[i].sinT;
    if (F > 0) W += F * ds;
  }
  out.mx5 = { dp: a.dp, eco: a.eco, used: a.used, ms: a.ms, t: a.t, target: a.target, eff: W / (a.R.fuelKg * 43e6) };
  // flat straight, 5 km
  const flat = [];
  for (let i = 0; i < 1000; i++) flat.push({ x: i * 5, y: 0, z: 0, s: i * 5, ds: 5, ds3: i < 999 ? 5 : 0, r: 1e6, sinT: 0, cosT: 1, grade: 0, kv: 0, dz: 0 });
  const flatRun = () => {
    const mt = ecoMinTime(flat), target = mt.t * 3, d = ecoDP(flat, mt.v, target);
    const f = vv => isElectric() ? ecoEnergyJ(flat, vv).E : ecoFuelKg(flat, vv);
    let lo = 1, hi = 60;
    for (let k = 0; k < 40; k++) { const c = (lo + hi) / 2; if (ecoTimeOf(flat, flat.map((p, i) => Math.min(mt.v[i], c))) > target) lo = c; else hi = c; }
    const vc = flat.map((p, i) => Math.min(mt.v[i], hi));
    let swings = 0, last = null, ext = d.v[200];
    for (let i = 200; i < 900; i++) {   // count reversals of ≥ 4 km/h in the cruise
      const x = d.v[i];
      if (last !== 'up' && x > ext + 4 / 3.6) { swings++; last = 'up'; ext = x; }
      else if (last !== 'dn' && x < ext - 4 / 3.6) { swings++; last = 'dn'; ext = x; }
      else if ((last === 'up' && x > ext) || (last === 'dn' && x < ext)) ext = x;
    }
    return { dp: f(d.v), cst: f(vc), t: d.t, tc: ecoTimeOf(flat, vc), swings };
  };
  out.flatIce = flatRun();
  load('Model 3 RWD'); const b = pair('dragon'); out.m3 = { dp: b.dp, eco: b.eco, used: b.used, ms: b.ms, t: b.t, target: b.target };
  out.flatEv = flatRun();
  load('Prius'); const h = simulateEconomyChallenge('alpine', 1.25); out.hyb = { hybrid: !!h.hybrid, dp: !!h.ecoDP, L: h.fuelL };
  load('MX-5 2.0'); setTab('challenges');
  const sel = document.getElementById('chalSel'); sel.value = 'economy'; sel.dispatchEvent(new Event('change'));
  await new Promise(z => setTimeout(z, 300));
  out.head = document.getElementById('chalPanel').textContent;
  return out;
});

console.log('MX-5 Alpine: DP', r.mx5.dp.toFixed(3), 'L vs eco driver', r.mx5.eco.toFixed(3), 'L; used', r.mx5.used,
  '; t', r.mx5.t.toFixed(1), '/', r.mx5.target.toFixed(1), 's; engine eff', r.mx5.eff.toFixed(3), '; DP', Math.round(r.mx5.ms), 'ms');
console.log('Model 3 Dragon: DP', r.m3.dp.toFixed(3), 'kWh vs eco driver', r.m3.eco.toFixed(3), 'kWh; used', r.m3.used,
  '; t', r.m3.t.toFixed(1), '/', r.m3.target.toFixed(1), 's; DP', Math.round(r.m3.ms), 'ms');
console.log('Flat 5 km at 3x: MX-5 DP', (r.flatIce.dp * 1000).toFixed(1), 'g vs constant', (r.flatIce.cst * 1000).toFixed(1), 'g, swings', r.flatIce.swings,
  '| Model 3 DP', (r.flatEv.dp / 3.6e6).toFixed(3), 'kWh vs constant', (r.flatEv.cst / 3.6e6).toFixed(3), 'kWh, swings', r.flatEv.swings);
console.log('Prius Alpine: hybrid', r.hyb.hybrid, 'DP', r.hyb.dp, 'L', r.hyb.L && r.hyb.L.toFixed(3));

for (const [k, p] of [['mx5', r.mx5], ['m3', r.m3]]) {
  if (!p.used) fails.push(`${k}: the DP was not kept`);
  if (!(p.dp < p.eco)) fails.push(`${k}: DP ${p.dp} does not beat the eco driver ${p.eco}`);
  if (!(p.t <= p.target + 1e-6 && p.t >= p.target * 0.98)) fails.push(`${k}: off target ${p.t} vs ${p.target}`);
}
if (!(r.mx5.eff > 0.1 && r.mx5.eff < 0.42)) fails.push('MX-5 engine efficiency on the road is not physical: ' + r.mx5.eff);
if (!(r.flatIce.swings >= 6)) fails.push('MX-5 does not pulse and glide on the flat (swings ' + r.flatIce.swings + ')');
if (!(r.flatIce.dp < r.flatIce.cst && r.flatIce.t <= r.flatIce.tc + 1)) fails.push('MX-5 pulse-and-glide does not beat a constant speed');
if (!(r.flatEv.dp <= r.flatEv.cst * 1.001)) fails.push('Model 3 DP spends more than a constant speed on the flat');
if (!(r.hyb.hybrid && !r.hyb.dp && r.hyb.L > 0)) fails.push('hybrid should keep the eco driver: ' + JSON.stringify(r.hyb));
if (!/ECO DRIVER\s*DP/.test(r.head)) fails.push('panel lacks ECO DRIVER DP');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
