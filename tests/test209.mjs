// Challenges page: open-road economy run (build 341, EV energy build 342).
//
// WHY THIS EXISTS. The CHALLENGES tab solves an open mountain road at a target time
// (eco-rally: timeFactor × the car's min-time). What must hold:
//   · Alpine Pass is open (start ≠ end; length > 8 km; corners > 0);
//   · an ICE run finishes on the target and a heavier car uses more litres;
//   · an EV run returns pack kWh and Wh/km, and a heavier EV uses more energy;
//   · the CHALLENGES tab exists and the head shows the score without a page error.
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
  const road = buildRoad('alpine');
  const out = {
    open: !!(road && road.open),
    lenKm: road ? road.length / 1000 : 0,
    corners: road ? road.corners : 0,
    startEnd: road ? Math.hypot(road.pts[0].x - road.pts[road.pts.length - 1].x, road.pts[0].y - road.pts[road.pts.length - 1].y) : 0,
    tab: !!document.getElementById('tabChallenges'),
    panel: !!document.getElementById('chalPanel')
  };
  const load = n => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
  load('MX-5');
  const light = simulateEconomyChallenge('alpine');
  load('Hellcat');
  const heavy = simulateEconomyChallenge('alpine');
  out.light = light && light.ok && !light.ev ? { t: light.time, target: light.target, tMin: light.tMin, L: light.fuelL } : null;
  out.heavy = heavy && heavy.ok && !heavy.ev ? { L: heavy.fuelL } : null;
  load('Model 3 RWD (2021)');
  const ev = simulateEconomyChallenge('alpine');
  load('Model S Plaid');
  const evH = simulateEconomyChallenge('alpine');
  out.ev = ev && ev.ok && ev.ev ? { t: ev.time, target: ev.target, kWh: ev.kWh, whkm: ev.whkm, regen: ev.regenKWh } : null;
  out.evH = evH && evH.ok && evH.ev ? { kWh: evH.kWh } : null;
  setTab('challenges');
  out.head = (document.getElementById('chalHead') || {}).textContent || '';
  return out;
});

console.log(JSON.stringify(r, null, 2));
if (!r.tab) fails.push('no CHALLENGES tab');
if (!r.panel) fails.push('no chalPanel');
if (!r.open) fails.push('alpine is not marked open');
if (!(r.lenKm > 8)) fails.push('alpine length ' + r.lenKm.toFixed(2) + ' km, want > 8');
if (!(r.corners > 0)) fails.push('alpine has no corners');
if (!(r.startEnd > 100)) fails.push('alpine start and finish are too close (' + r.startEnd.toFixed(0) + ' m)');
if (!r.light) fails.push('MX-5 economy solve failed');
else {
  const band = 0.02 * r.light.target;
  if (!(Math.abs(r.light.t - r.light.target) <= Math.max(2, band))) fails.push('MX-5 off target: ' + r.light.t.toFixed(1) + ' vs ' + r.light.target.toFixed(1));
  if (!(r.light.t > r.light.tMin * 1.1)) fails.push('MX-5 eco should be slower than min-time');
  if (!(r.light.L > 0.2)) fails.push('MX-5 fuel missing');
}
if (!r.heavy) fails.push('Hellcat economy solve failed');
else if (r.light && !(r.heavy.L > r.light.L + 0.2)) fails.push('Hellcat should burn more than MX-5');
if (!r.ev) fails.push('Model 3 economy solve failed');
else {
  if (!(r.ev.kWh > 0.5)) fails.push('Model 3 kWh missing: ' + r.ev.kWh);
  if (!(r.ev.whkm > 50 && r.ev.whkm < 800)) fails.push('Model 3 Wh/km out of band: ' + r.ev.whkm);
  if (!(r.ev.regen >= 0)) fails.push('Model 3 regen missing');
  const band = 0.02 * r.ev.target;
  if (!(Math.abs(r.ev.t - r.ev.target) <= Math.max(2, band))) fails.push('Model 3 off target');
}
if (!r.evH) fails.push('Plaid economy solve failed');
else if (r.ev && !(r.evH.kWh > r.ev.kWh + 0.2)) fails.push('Plaid should use more energy than Model 3 (' + r.evH.kWh + ' vs ' + r.ev.kWh + ')');
if (!/kWh|Wh\/km|L\/100|ON TARGET|Mountain/i.test(r.head)) fails.push('chalHead empty or odd: ' + r.head);

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
