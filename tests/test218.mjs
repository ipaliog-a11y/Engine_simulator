// Moose run: a tap on the lower diagram switches to the car seen from above (build 357).
//
// WHY THIS EXISTS. What must hold:
//   · the replay samples carry yaw rate, body velocity, steer and slip angles, and the result the axle positions;
//   · a tap below the course strip switches the front-axle view to the view from above and back, with no page error;
//   · the balance reads UNDERSTEER when the front slips more than the rear (αF > αR), OVERSTEER when less.
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
const m = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  setTab('challenges'); activeRunChallenge = 'moose'; refreshChallenge(); drawChallenge();
  const R = chalResult, s = R && R.samples && R.samples[Math.floor(R.samples.length / 2)];
  return R && R.ok ? { a: R.a, b: R.b, s: s && { yaw: s.yaw, vy: s.vy, delta: s.delta, alpha: s.alpha }, strip: mooseStrip(), H: vizH, W: vizW } : null;
});
if (!m) fails.push('moose did not solve');
else {
  if (!(m.a > 0.5 && m.b > 0.5)) fails.push('axle positions ' + m.a + ' / ' + m.b);
  if (!(m.s && typeof m.s.yaw === 'number' && typeof m.s.delta === 'number' && m.s.alpha && m.s.alpha.length === 4)) fails.push('sample fields ' + JSON.stringify(m.s));
  const box = await page.locator('canvas').first().boundingBox();
  const tap = () => page.mouse.click(box.x + box.width / 2, box.y + (m.strip + (m.H - m.strip) / 2) * box.height / m.H);
  await tap(); await page.waitForTimeout(400);
  if (await page.evaluate(() => chalMooseView) !== 'plan') fails.push('tap did not switch to the view from above');
  await page.screenshot({ path: '/tmp/test218-plan.png' });
  await tap();
  if (await page.evaluate(() => chalMooseView) !== 'front') fails.push('second tap did not switch back');
  const tags = await page.evaluate(() => [mooseBalance({ alpha: [0.06, 0.06, 0.03, 0.03], ay: 0.5 }).tag,
    mooseBalance({ alpha: [-0.03, -0.03, -0.06, -0.06], ay: -0.5 }).tag, mooseBalance({ alpha: [0.04, 0.04, 0.04, 0.04], ay: 0.5 }).tag]);
  if (tags.join() !== 'UNDERSTEER,OVERSTEER,NEUTRAL') fails.push('balance tags ' + tags.join());
}
console.log(JSON.stringify(m));
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
