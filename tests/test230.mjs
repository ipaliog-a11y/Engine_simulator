// Rich mixtures cool the exhaust; the ECU holds the turbine's limit (plans/small-physics.md step 13).
//
// WHY THIS EXISTS. Until this build the exhaust rich of stoichiometric only lost the extra work, so enrichment barely
// cooled it and the ECU never read it. What must hold:
//   · exhaustGasT falls steadily from lambda 1 to 0.78, and the excess fuel's evaporation is part of it (a fuel with a
//     larger heat of vaporization cools more rich, and not at all at lambda 1);
//   · the gas at the turbine inlet is cooler than at the port, by the manifold's heat loss;
//   · on the Golf GTI, the ECU enriches where its turbine inlet would pass TURB_T_LIMIT: at full load it holds the limit
//     wherever its mixture is leaner than LAMBDA_KNOCK_MIN; on the 993 Turbo (hottest preset) it reaches LAMBDA_KNOCK_MIN;
//   · the boost is never lowered for the exhaust (owner's decision: enrichment only until EGT's load factor is derived);
//   · the guard is the ECU's only: a fixed mixture or an NA engine has none.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  loadVehiclePreset(VEHICLE_PRESETS.find(p => /\(993,/.test(p.name)));
  const e = engine, rpm = 0.8 * e.redline, lams = [1, 0.95, 0.9, 0.85, 0.8, 0.78];
  const T = l => exhaustGasT(1, rpm, l, 0);
  const curve = lams.map(T);
  const h0 = e.fuelHfg; e.fuelHfg = 2 * h0;
  const hot = { l1: T(1), l8: T(0.8) }; e.fuelHfg = h0;
  const pull = () => { let maxT = 0, minL = 9, over = 0, inlet = 1;
    for (let n = 1500; n <= e.redline; n += 250) {
      const m = wotMapAt(n), l = curAFR(n, m) / e.stoichAFR, Tp = egtAt(n, m), Ti = turbineInletT(n, m, l, Tp);
      maxT = Math.max(maxT, Ti); minL = Math.min(minL, l); inlet = Math.min(inlet, Tp - Ti);
      if (Ti > TURB_T_LIMIT + 2 && l > LAMBDA_KNOCK_MIN + 0.002) over++;
    } return { maxT, minL, over, inlet }; };
  const turbo = pull();
  const cut = e.knockLimTable ? e.knockLimTable.some(x => x.bar < e.maxBoost) : false;
  const guarded = ecuGuardsTurbine();
  e.afrMode = 'fixed'; const fixed = ecuGuardsTurbine(); e.afrMode = 'auto';
  loadVehiclePreset(VEHICLE_PRESETS.find(p => /Golf GTI \(Mk7/.test(p.name)));
  const golf = pull();
  loadVehiclePreset(VEHICLE_PRESETS.find(p => /S2000/.test(p.name)));
  return { curve, hot, l1: curve[0], l8: curve[4], turbo, golf, cut, guarded, fixed, na: ecuGuardsTurbine(), lim: TURB_T_LIMIT, lmin: LAMBDA_KNOCK_MIN };
});
await browser.close();
const fails = [...errors], C = k => (k - 273.15).toFixed(0);
console.log(`== 993 Turbo at 80% redline, EGT by lambda 1..0.78: ${r.curve.map(C).join(', ')} °C ==`);
for (let i = 1; i < r.curve.length; i++) if (!(r.curve[i] < r.curve[i - 1])) fails.push(`EGT does not fall from lambda step ${i - 1} to ${i}`);
console.log(`== twice the heat of vaporization: lambda 1 ${C(r.hot.l1)} (was ${C(r.l1)}), lambda 0.8 ${C(r.hot.l8)} (was ${C(r.l8)}) °C ==`);
if (r.hot.l1 !== r.l1) fails.push('evaporation moves the exhaust at lambda 1');
if (!(r.hot.l8 < r.l8 - 1)) fails.push('evaporation does not cool the rich exhaust');
for (const [n, x] of [['993 Turbo', r.turbo], ['Golf GTI', r.golf]]) {
  console.log(`== ${n} at full load: turbine inlet up to ${C(x.maxT)} °C (limit ${C(r.lim)}), richest λ ${x.minL.toFixed(3)}, manifold cools ≥ ${x.inlet.toFixed(0)} K ==`);
  if (x.over) fails.push(`${n}: ${x.over} points pass the limit while the ECU could still enrich`);
  if (!(x.inlet > 0)) fails.push(`${n}: the turbine inlet is not cooler than the port`);
}
if (!(r.turbo.minL <= r.lmin + 1e-6)) fails.push('the 993 Turbo is never enriched to the floor');
if (r.cut) fails.push('the boost is lowered on the 993 Turbo');
if (!r.guarded || r.fixed || r.na) fails.push(`guard: ECU ${r.guarded}, fixed mixture ${r.fixed}, NA ${r.na}`);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
