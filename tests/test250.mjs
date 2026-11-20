// Hybrid economy solve: fast, and the same numbers (build 406).
//
// WHY THIS EXISTS. A hybrid's economy run prices each plan with hybridCycle's energy manager, whose equivalence factor
// is found by ~20-50 passes over the road. Build 406 keeps what a step offers that the charge does not change (shaft
// speeds and torques, machine limits) from the first pass, shares the loss and fuel tables across the run's solves and
// prices the kept plan once. What must hold:
//   · Qashqai e-POWER (series) on Route Napoléon, Prius (power-split) and Ioniq (parallel) on Alpine Pass give the
//     figures build 403 gave (L/100 km, pack out and in, engine off, over-limit share), to 1e-9;
//   · Qashqai on Napoléon solves in under 15 s (it took ~38 s before; ~3.3 s here).
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
// build 403's figures: l100, packOutKWh, packInKWh, engOff, limitShare
const REF = [
  ['Qashqai', 'napoleon', [7.58511350335, 8.39272020817, 8.87815053437, 0.569765891768, 0.329501578568]],
  ['Prius', 'alpine', [8.08453509785, 0.978322255246, 0.978669726891, 0.424805254323, 0.356363819286]],
  ['Ioniq Hybrid', 'alpine', [9.50644323459, 1.34356008046, 1.3479753381, 0.379803397351, 0.06575810901]],
];
const out = await page.evaluate(REF => REF.map(([car, road]) => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(car)));
  const t0 = performance.now(), R = simulateEconomyChallenge(road), ms = performance.now() - t0;
  return { car, road, ms, got: [R.l100, R.packOutKWh, R.packInKWh, R.engOff, R.limitShare] };
}), REF);
const names = ['L/100km', 'pack out', 'pack in', 'engine off', 'over-limit'];
out.forEach((o, i) => {
  console.log(`${o.car} @ ${o.road}: ${Math.round(o.ms)} ms  ` + o.got.map((x, k) => names[k] + ' ' + x.toPrecision(8)).join(', '));
  o.got.forEach((x, k) => { const r = REF[i][2][k]; if (!(Math.abs(x - r) <= 1e-9 * Math.max(1, Math.abs(r)))) fails.push(`${o.car} ${names[k]}: ${x} vs ${r}`); });
});
if (!(out[0].ms < 15000)) fails.push(`Qashqai on Napoléon took ${Math.round(out[0].ms)} ms (limit 15000)`);
await browser.close();
fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
