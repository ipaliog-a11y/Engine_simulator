// A hybrid's consumption over the WLTP cycle, and the Atkinson cam (build 188, step 3.2b of plans/hybrid-electric/).
//
// WHY THIS EXISTS. A charge-sustaining hybrid's fuel on the cycle comes from its energy manager: second by second the
// equivalent-consumption minimisation (src/js/fuel-cycle.js, hybridCycle) picks electric only, the engine with the
// motor helping or charging, or regeneration, pricing the pack's energy at the one equivalence factor that leaves the
// pack where it started. What must hold:
//   · the pack is sustained over the cycle (within 0.5% of its capacity), and the factor is a fuel price a real engine
//     sets (220-330 g/kWh);
//   · the Hyundai Ioniq Hybrid against Hyundai's WLTP combined 4.4-5.2 L/100 km; the same car with the hybrid taken off
//     burns at least 15% more; the engine is off for a third of the cycle or more, and runs from the cold start until
//     it is warm;
//   · the ATKINSON cam closes the intake late at every speed (55 degrees after BDC or more, the phaser's short range)
//     and burns no more at part load than the stock cam. It does not yet reproduce the Kappa's low power or its ~40%
//     peak efficiency (the model has no cooled EGR, and its intake ram rewards a late closing up high): printed, and
//     the reason the Ioniq's figure sits at the top of Hyundai's range rather than the bottom;
//   · the VEHICLE tab fills in a hybrid's cycle line after it draws.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(async () => {
  const o = {};
  loadVehiclePreset(HYB_VEHICLE_PRESETS[0]);
  o.lineBefore = (document.getElementById('hybCycle') || {}).textContent || '';
  await new Promise(res => setTimeout(res, 2500));
  o.lineAfter = (document.getElementById('hybCycle') || {}).textContent || '';
  engine._hcyc = null;
  const t0 = performance.now(); const h = hybridCycle(vehicle); o.ms = performance.now() - t0;
  o.h = { l100: h.l100, co2: h.co2, ev: h.evShare, on: h.onShare, dE: h.dSocKJ, s: h.s, cap: engine.hy.pack.kWh * 3600 };
  const hy = engine.hy; delete engine.hy; engine._fcyc = null; o.plain = engineCycle(vehicle).l100; engine.hy = hy;
  // the cold start: the engine runs until warm (a cycle started hot stops the engine sooner)
  FUEL_CYCLE.soak = 60; engine._hcyc = null; o.hot = hybridCycle(vehicle); FUEL_CYCLE.soak = 23; engine._hcyc = null;
  // the Atkinson cam on the same engine
  const base = { type: 'petrol4', cylinders: 4, bore_mm: 72, stroke_mm: 97, compression: 13, redline: 6250, intake: 'na', injector: 'direct', vvt: true,
    valves: 4, octane: 95, airFilter: 'stock', exhaust: 'stock', cat: 'stock', intakeSys: 'efi' };
  o.cam = {};
  for (const cam of ['stock', 'atkinson']) {
    applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE, base, { cam }), tune: Object.assign({}, STD_TUNE) });
    const ivc = [1500, 2500, 4000, 5500].map(rpm => ivcAt(rpm));
    o.cam[cam] = { hp: engine.score.peakHP, ivcMin: Math.min(...ivc), part: engineFuelAt(2000, 40, 95) / (40 * 2000 * Math.PI / 30) * 3.6e6 };
  }
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

const H = r.h;
console.log(`== Ioniq Hybrid on the WLTP cycle: ${f(H.l100, 2)} L/100 km, ${Math.round(H.co2)} g/km (Hyundai 4.4-5.2); without the hybrid ${f(r.plain, 2)} ` +
  `(${f((r.plain / H.l100 - 1) * 100, 0)}% more); engine off ${f((1 - H.on) * 100, 0)}% (electric ${f(H.ev * 100, 0)}%); pack ${f(H.dE, 1)} kJ of ${Math.round(H.cap)}; ` +
  `equivalence ${Math.round(H.s * 3.6e6)} g/kWh; ${Math.round(r.ms)} ms ==`);
if (Math.abs(H.dE) > H.cap * 0.005) fails.push('the pack is not sustained over the cycle');
const sg = H.s * 3.6e6; if (!(sg > 220 && sg < 330)) fails.push(`an equivalence factor of ${Math.round(sg)} g/kWh is no engine's`);
if (!(H.l100 > 4.4 * 0.85 && H.l100 < 5.2 * 1.08)) fails.push(`${f(H.l100, 2)} L/100 km against Hyundai's 4.4-5.2`);
if (!(r.plain > H.l100 * 1.15)) fails.push('the hybrid saves less than 15% on its own engine');
if (!(1 - H.on > 0.33 && H.ev > 0.2)) fails.push('the engine is not off for a third of the cycle');
if (!(r.hot.l100 < H.l100 && r.hot.onShare < H.on)) fails.push('the cold start does not keep the engine on longer');
if (r.ms > 3000) fails.push(`the energy manager took ${Math.round(r.ms)} ms`);
console.log(`== VEHICLE tab: "${r.lineBefore.trim()}" then "${r.lineAfter.trim()}" ==`);
if (!/L\/100 km/.test(r.lineAfter)) fails.push('the VEHICLE tab does not fill in a hybrid\'s cycle');
const S = r.cam.stock, A = r.cam.atkinson;
console.log(`== cams on the Kappa: stock ${S.hp} hp, IVC from ${f(S.ivcMin, 0)} deg ABDC, ${Math.round(S.part)} g/kWh at 2000 rpm / 40 Nm; ` +
  `ATKINSON ${A.hp} hp, IVC from ${f(A.ivcMin, 0)}, ${Math.round(A.part)} g/kWh (the real Kappa: 105 PS, ~40% peak efficiency) ==`);
if (!(A.ivcMin >= 55)) fails.push('the Atkinson cam does not close the intake late');
if (!(A.part <= S.part)) fails.push('the Atkinson cam burns more at part load than the stock cam');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the hybrid\'s energy manager sustains its pack, keeps the engine off a third of the cycle, and lands in the Ioniq\'s WLTP range.');
process.exit(fails.length || errors.length ? 1 : 0);
