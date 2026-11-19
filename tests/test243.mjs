// Challenges: spiral skid pad and figure 8.
//
// WHY THIS EXISTS. Two courses beside the skid pad, both driven by the same stepped car. What must hold:
//   · the spiral is one turn from 12 m out to the skid pad's radius, and the car is faster at the outside than at the inside;
//   · the figure 8 is a lemniscate whose tightest bend is half that radius, and the path reaches both loops;
//   · both cars HOLD, and 1 km/h faster they leave the lane or spin (the search found an edge);
//   · on the figure 8 the body's mean lateral g is below the bend figure, because the crossing is straight;
//   · the replay samples carry the dashboard's fields; the UI shows the result and the replay rate;
//   · no page errors, and no horizontal scroll at phone width.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const out = {
    spiral: !!RUN_CHALLENGES.find(c => c.id === 'spiral' && c.kind === 'spiral'),
    fig: !!RUN_CHALLENGES.find(c => c.id === 'fig8' && c.kind === 'fig8'),
    r0: SPIRAL_R0, r1: SKID_R, rho: FIG8_RHO, cars: []
  };
  for (const n of ['MX-5', 'Model 3']) {
    loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
    const S = simulateSpiralChallenge(), F = simulateFig8Challenge();
    const ss = S.samples || [], fs = F.samples || [];
    const rad = q => Math.hypot(q.x, q.y);
    out.cars.push({
      n,
      sOk: S.ok, sOut: S.outcome, entry: S.entryKmh, exit: S.exitKmh, sg: S.gExit, sFail: S.failBy,
      sRad: ss.length > 20 ? [rad(ss[0]), rad(ss[ss.length - 1])] : null,
      sDash: ss.length > 20 && ss.every(q => q.rpm > 0 && q.gear >= 1 && isFinite(q.ay) && isFinite(q.delta)),
      fOk: F.ok, fOut: F.outcome, kmh: F.speedKmh, fg: F.gLap, fay: F.ayMean, fFail: F.failBy,
      fX: fs.length > 20 ? [Math.min(...fs.map(q => q.x)), Math.max(...fs.map(q => q.x))] : null,
      fDash: fs.length > 20 && fs.every(q => q.rpm > 0 && q.gear >= 1 && isFinite(q.ay) && isFinite(q.delta))
    });
  }
  setTab('challenges');
  const sel = document.getElementById('chalSel');
  const show = id => { sel.value = id; sel.dispatchEvent(new Event('change')); drawChallenge();
    return document.getElementById('chalHead').textContent; };
  out.sHead = show('spiral');
  out.fHead = show('fig8');
  const el = document.getElementById('chalMooseRate');
  out.rate = el && el.closest('.field').style.display !== 'none';
  return out;
});
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(300);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
await browser.close();

for (const c of r.cars) {
  console.log(c.n.padEnd(10), 'spiral', c.sOut, c.entry && c.entry.toFixed(0) + '→' + c.exit.toFixed(0), 'km/h', c.sg && c.sg.toFixed(2) + ' g', '+1', c.sFail,
    '| fig', c.fOut, c.kmh && c.kmh.toFixed(0), 'km/h', 'bend', c.fg && c.fg.toFixed(2), 'mean', c.fay && c.fay.toFixed(2), '+1', c.fFail);
}
console.log('UI', r.sHead, '|', r.fHead, 'rate', r.rate, 'scrollWidth@375', sw);
if (!r.spiral || !r.fig) fails.push('challenge missing from RUN_CHALLENGES');
if (r.r0 !== 12) fails.push('spiral inner ' + r.r0);
if (Math.abs(r.r1 - 30.48) > 0.01) fails.push('spiral outer ' + r.r1);
if (Math.abs(r.rho - 15.24) > 0.01) fails.push('figure-8 bend ' + r.rho);
const edge = ['WIDE', 'TIGHT', 'SPIN'];
for (const c of r.cars) {
  if (!c.sOk || c.sOut !== 'HOLD') fails.push(c.n + ' spiral ' + c.sOut);
  if (!(c.exit > c.entry + 10)) fails.push(c.n + ' spiral did not speed up ' + c.entry + ' → ' + c.exit);
  if (!c.sRad || !(c.sRad[1] > c.sRad[0] + 10)) fails.push(c.n + ' spiral radius ' + c.sRad);
  if (!(c.sg > 0.5 && c.sg < 1.3)) fails.push(c.n + ' spiral g ' + c.sg);
  if (!edge.includes(c.sFail)) fails.push(c.n + ' spiral +1 km/h ' + c.sFail);
  if (!c.sDash) fails.push(c.n + ' spiral replay samples');
  if (!c.fOk || c.fOut !== 'HOLD') fails.push(c.n + ' figure 8 ' + c.fOut);
  if (!(c.kmh > 30)) fails.push(c.n + ' figure 8 speed ' + c.kmh);
  if (!(c.fg > 0.6 && c.fg < 1.4)) fails.push(c.n + ' figure 8 bend g ' + c.fg);
  if (!(c.fay < c.fg)) fails.push(c.n + ' figure 8 mean ay ' + c.fay + ' not under bend g ' + c.fg);
  if (!c.fX || !(c.fX[0] < -20 && c.fX[1] > 20)) fails.push(c.n + ' figure 8 span ' + c.fX);
  if (!edge.includes(c.fFail)) fails.push(c.n + ' figure 8 +1 km/h ' + c.fFail);
  if (!c.fDash) fails.push(c.n + ' figure 8 replay samples');
}
if (!/Spiral Skid Pad/.test(r.sHead || '') || !/km\/h/.test(r.sHead || '')) fails.push('spiral UI: ' + r.sHead);
if (!/Figure 8/.test(r.fHead || '') || !/km\/h/.test(r.fHead || '')) fails.push('figure 8 UI: ' + r.fHead);
if (!r.rate) fails.push('replay rate hidden');
if (sw > 375) fails.push('horizontal scroll at 375 px: ' + sw);
for (const e of errors) fails.push(e);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
