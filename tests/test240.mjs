// The bench drawing follows the engine that is already running.
//
// WHY THIS EXISTS. Exhaust temperature, knock and a dyno sweep were numbers with no picture.
// What must hold:
//   · 500 C and 1100 C are different manifold colours;
//   · a knocking engine paints the warning block, and reduced motion still draws;
//   · RUN PULL starts a sweep of the brake;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; setTab('engine'); });
await page.waitForTimeout(300);
const fails = [];

const col = await page.evaluate(() => ({ cold: egtColour(773), hot: egtColour(1373) }));
console.log(col);
if (col.cold === col.hot) fails.push('exhaust colour ignores temperature');

const knock = await page.evaluate(() => {
  state.knockRisk = 90; drawEngine(0.016);
  const S = Math.min(vizW / 640, vizH / 420), ox = (vizW - 640 * S) / 2, oy = (vizH - 420 * S) / 2;
  const x = Math.round((ox + 110 * S) * vizScale), y = Math.round((oy + 92 * S) * vizScale);
  const p = document.getElementById('engineCanvas').getContext('2d').getImageData(x, y, 1, 1).data;
  return { r: p[0], g: p[1] };
});
console.log('knock pixel', knock);
if (knock.r < 80) fails.push('knock warning is not drawn');

await page.emulateMedia({ reducedMotion: 'reduce' });
const still = await page.evaluate(() => { drawEngine(0.016); return matchMedia('(prefers-reduced-motion: reduce)').matches; });
if (!still) fails.push('reduced motion was not applied');

const sweep = await page.evaluate(() => { startDynoSweep(); return !!dynoSweep && vizMode === 'dyno'; });
console.log('sweep', sweep);
if (!sweep) fails.push('RUN PULL did not start');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
