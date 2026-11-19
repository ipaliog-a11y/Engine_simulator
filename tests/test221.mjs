// Challenges: skid pad (build 366).
//
// WHY THIS EXISTS. Build 366 adds a skid-pad challenge: the stepped car round a 200 ft (61 m) circle, the speed
// raised until it leaves a 1 m lane, scored as the magazines do, v²/(g·R) from the held lap's time. What must hold:
//   · the challenge is registered and the circle is 60.96 m across (200 ft);
//   · every car tested HOLDs a lap, and the g from its lap time agrees with the body's own mean ay within 5%;
//   · one step faster it fails as WIDE, TIGHT or SPIN (the search found an edge, not a timeout);
//   · the replay samples carry the dashboard's fields; the UI shows the g and switches on the replay rate;
//   · no page errors, and no horizontal scroll at phone width.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const out = { has: !!RUN_CHALLENGES.find(c => c.id === 'skidpad' && c.kind === 'skidpad'), d: 2 * SKID_R, cars: [] };
  for (const n of ['MX-5', 'Model 3', 'Civic Type R (FK8', '911 GT3']) {
    loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n)));
    const R = simulateSkidpadChallenge();
    out.cars.push({ n, ok: R.ok, out: R.outcome, g: R.gLap, ay: R.ayMean, kmh: R.speedKmh, fail: R.failBy,
      dash: R.samples.length > 20 && R.samples.every(q => q.rpm > 0 && q.gear >= 1 && isFinite(q.ay) && isFinite(q.delta)) });
  }
  setTab('challenges');
  const sel = document.getElementById('chalSel');
  sel.value = 'skidpad'; sel.dispatchEvent(new Event('change'));
  out.head = document.getElementById('chalHead').textContent;
  const el = document.getElementById('chalMooseRate');
  out.rate = el && el.closest('.field').style.display !== 'none';
  return out;
});
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(300);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });
await browser.close();

for (const c of r.cars) console.log(c.n.padEnd(18), c.out, c.g && c.g.toFixed(3) + ' g (lap)', c.ay && c.ay.toFixed(3) + ' g (ay)', c.kmh && c.kmh.toFixed(1) + ' km/h', '+1:', c.fail);
console.log('UI', r.head, 'rate', r.rate, 'scrollWidth@375', sw);
if (!r.has) fails.push('skidpad missing from RUN_CHALLENGES');
if (Math.abs(r.d - 60.96) > 0.01) fails.push('diameter ' + r.d);
for (const c of r.cars) {
  if (!c.ok || c.out !== 'HOLD') fails.push(c.n + ': not HOLD (' + c.out + ')');
  if (!(Math.abs(c.g / c.ay - 1) < 0.05)) fails.push(c.n + ': lap g ' + c.g + ' vs ay ' + c.ay);
  if (!['WIDE', 'TIGHT', 'SPIN'].includes(c.fail)) fails.push(c.n + ': +1 km/h fails as ' + c.fail);
  if (!c.dash) fails.push(c.n + ': replay samples lack dashboard fields');
}
if (!/Skid Pad.*g/.test(r.head || '')) fails.push('UI head: ' + r.head);
if (!r.rate) fails.push('replay rate hidden on skid pad');
if (sw > 375) fails.push('horizontal scroll at 375 px: ' + sw);
for (const e of errors) fails.push(e);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
