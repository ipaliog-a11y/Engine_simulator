// Challenges: route maps zoom and scroll; the moose view shows the road the car's width takes (build 355).
//
// WHY THIS EXISTS. What must hold:
//   · a wheel turn over a route map zooms it about the cursor (that map point stays put) and a drag scrolls it;
//   · hover still finds the route point under the cursor when zoomed; double-click returns to the fitted map;
//   · a moose result carries the car's CG-to-bumper lengths, and its top-down view draws with no page error.
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
await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  setTab('challenges'); activeRunChallenge = 'stage-alpine'; refreshChallenge();
});
const toPx = (b, v) => ({ x: b.x + v.x * b.width / v.W, y: b.y + v.y * b.height / v.H });
const box = await page.locator('canvas').first().boundingBox();
const pick = () => page.evaluate(() => { const m = chalMapProject(chalResult), q = m.p[Math.floor(m.p.length / 3)];
  return { x: m.MX(q), y: m.MY(q), W: vizW, H: vizH, z: chalView.z, i: Math.floor(m.p.length / 3) }; });
const a = await pick(), pa = toPx(box, a);
await page.mouse.move(pa.x, pa.y);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(100);
const b = await pick();
if (!(b.z > 1.5)) fails.push('wheel did not zoom: z ' + b.z);
if (Math.hypot(b.x - a.x, b.y - a.y) > 2) fails.push('zoom moved the point under the cursor by ' + Math.hypot(b.x - a.x, b.y - a.y).toFixed(1));
const hov = await page.evaluate(([x, y]) => chalHoverAt(x, y), [b.x, b.y]);
if (Math.abs(hov - b.i) > 2) fails.push('hover when zoomed: ' + hov + ' vs ' + b.i);
await page.mouse.down(); await page.mouse.move(pa.x + 80, pa.y + 40, { steps: 4 }); await page.mouse.up();
const c = await pick();
if (!(c.x - b.x > 20 && c.y - b.y > 10)) fails.push('drag did not scroll: ' + (c.x - b.x).toFixed(0) + ',' + (c.y - b.y).toFixed(0));
await page.screenshot({ path: '/tmp/test217-route.png' });
await page.mouse.dblclick(pa.x + 80, pa.y + 40);
const d = await pick();
if (d.z !== 1 || Math.hypot(d.x - a.x, d.y - a.y) > 0.5) fails.push('double-click did not reset');
const m = await page.evaluate(() => { activeRunChallenge = 'moose'; refreshChallenge(); drawChallenge();
  const R = chalResult; return R && R.ok ? { body: R.body, w: R.trackW } : null; });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/test217-moose.png' });
if (!m) fails.push('moose did not solve');
else if (!(m.body && m.body.f > 1 && m.body.r > 1 && m.body.f + m.body.r < 6)) fails.push('moose body lengths ' + JSON.stringify(m.body));
console.log(JSON.stringify({ a, b, c, d, moose: m }));
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
