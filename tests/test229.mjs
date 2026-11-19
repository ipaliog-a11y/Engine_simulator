// Rich mixtures cool the exhaust; the ECU holds the turbine's limit (plans/small-physics.md step 13).
//
// WHY THIS EXISTS. Until this build the exhaust rich of stoichiometric only lost the extra work, so enrichment barely
// cooled it and the ECU never read it. What must hold:
//   · exhaustGasT falls steadily from lambda 1 to 0.78, and the excess fuel's evaporation is part of it (a fuel with a
//     larger heat of vaporization cools more rich, and not at all at lambda 1);
//   · on the 993 Turbo (hottest preset at best spark), the ECU's exhaust at full load holds TURB_T_LIMIT (+10 K for the
//     boost table's interpolation) and its boost target is cut below the taper somewhere;
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
  loadVehiclePreset(VEHICLE_PRESETS.find(p => /993/.test(p.name)));
  const e = engine, rpm = 0.8 * e.redline, lams = [1, 0.95, 0.9, 0.85, 0.8, 0.78];
  const T = l => exhaustGasT(1, rpm, l, 0);
  const curve = lams.map(T);
  const h0 = e.fuelHfg; e.fuelHfg = 2 * h0;
  const hot = { l1: T(1), l8: T(0.8) }; e.fuelHfg = h0;
  let maxT = 0, cut = false;
  for (let n = 1500; n <= e.redline; n += 250) {
    const m = wotMapAt(n); maxT = Math.max(maxT, egtAt(n, m));
    if (boostTarget(n) < e.maxBoost * boostTaperFrac(n) - 0.01) cut = true;
  }
  const guarded = ecuGuardsTurbine();
  e.afrMode = 'fixed'; const fixed = ecuGuardsTurbine(); e.afrMode = 'auto';
  loadVehiclePreset(VEHICLE_PRESETS.find(p => /S2000/.test(p.name)));
  return { curve, hot, l1: curve[0], l8: curve[4], maxT, cut, guarded, fixed, na: ecuGuardsTurbine(), lim: TURB_T_LIMIT };
});
await browser.close();
const fails = [...errors], C = k => (k - 273.15).toFixed(0);
console.log(`== 993 Turbo at 80% redline, EGT by lambda 1..0.78: ${r.curve.map(C).join(', ')} °C ==`);
for (let i = 1; i < r.curve.length; i++) if (!(r.curve[i] < r.curve[i - 1])) fails.push(`EGT does not fall from lambda step ${i - 1} to ${i}`);
console.log(`== twice the heat of vaporization: lambda 1 ${C(r.hot.l1)} (was ${C(r.l1)}), lambda 0.8 ${C(r.hot.l8)} (was ${C(r.l8)}) °C ==`);
if (r.hot.l1 !== r.l1) fails.push('evaporation moves the exhaust at lambda 1');
if (!(r.hot.l8 < r.l8 - 1)) fails.push('evaporation does not cool the rich exhaust');
console.log(`== full load: hottest ${C(r.maxT)} °C against ${C(r.lim)} °C, boost cut: ${r.cut} ==`);
if (!(r.maxT <= r.lim + 10)) fails.push(`the ECU lets the exhaust reach ${C(r.maxT)} °C`);
if (!r.cut) fails.push('the boost is never lowered for the exhaust');
if (!r.guarded || r.fixed || r.na) fails.push(`guard: ECU ${r.guarded}, fixed mixture ${r.fixed}, NA ${r.na}`);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
