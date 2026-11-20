// Economy road: a hybrid on its own energy path (build 383).
//
// WHY THIS EXISTS. Until this build a hybrid on the economy challenge was priced as a plain engine (ecoFuelKg). Now the
// WLTC's charge-sustaining energy manager (hybridCycle) runs on the road's own speed profile and grade. What must hold:
//   · a hybrid's run is marked hybrid and reports fuel, the pack's energy out and back in (regen), and engine-off time;
//   · the pack ends where it started (within 0.5% of its capacity), or the run says it was charge-corrected;
//   · an engine car's run is still the engine path (no hybrid fields; its litres are ecoFuelKg's on its own profile);
//   · the CHALLENGES head shows the hybrid's litres without a page error.
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

const r = await page.evaluate(() => {
  const out = {};
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  const ice = simulateEconomyChallenge('alpine');
  const f = FUELS[engine.fuel] || FUELS.gasoline;
  out.ice = { hybrid: !!ice.hybrid, L: ice.fuelL, Lice: ecoFuelKg(ice.road.line, ice.v) / f.density };
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(p => p.name.includes('Prius')));
  const h = simulateEconomyChallenge('alpine');
  out.hy = { hybrid: !!h.hybrid, L: h.fuelL, l100: h.l100, out: h.packOutKWh, in: h.packInKWh, dSoc: h.dSocKWh, corr: h.corrected,
    off: h.engOff, short: h.limitShare, kWh: engine.hy.pack.kWh, t: h.time, target: h.target };
  activeRunChallenge = 'economy'; chalResult = h; renderRunChallenge();   // the CHALLENGES tab's renderer, renamed in build 410 (it shadowed the build card's renderChallenge)
  out.head = (document.getElementById('chalHead') || {}).textContent || '';
  return out;
});
console.log(JSON.stringify(r, null, 2));
if (r.ice.hybrid) fails.push('MX-5 run marked hybrid');
if (!(Math.abs(r.ice.L - r.ice.Lice) < 1e-9)) fails.push('MX-5 litres are not the engine path: ' + r.ice.L + ' vs ' + r.ice.Lice);
const h = r.hy;
if (!h.hybrid) fails.push('Prius run not on the hybrid path');
else {
  if (!(h.L > 0.1)) fails.push('Prius fuel missing: ' + h.L);
  if (!(h.out > 0 && h.in > 0)) fails.push('Prius pack energy out/in missing');
  if (!(h.corr || Math.abs(h.dSoc) <= 0.005 * h.kWh + 1e-9)) fails.push('Prius pack not sustained: ' + h.dSoc + ' kWh');
  if (!(h.off > 0 && h.off < 1)) fails.push('Prius engine-off share out of range: ' + h.off);
  if (!(Math.abs(h.t - h.target) <= Math.max(2, 0.02 * h.target))) fails.push('Prius off target');
}
if (!/L\/100/.test(r.head)) fails.push('chalHead odd: ' + r.head);
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
