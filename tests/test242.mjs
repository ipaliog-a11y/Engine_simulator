// Shift lights on the track instruments.
//
// WHY THIS EXISTS. The lap replay showed rpm as one bar. What must hold:
//   · eight lights are drawn, and at redline at least one is lit;
//   · a rotor past 450 C marks the brake;
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
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; setTab('engine'); sizeCanvas(); });
await page.waitForTimeout(200);
const fails = [];
const lit = await page.evaluate(() => {
  ctx.setTransform(vizScale, 0, 0, vizScale, 0, 0);
  ctx.fillStyle = '#0d0d18'; ctx.fillRect(0, 0, 200, 40);
  drawShiftLights(10, 10, engine.redline, engine.redline);
  const x = Math.round(12 * vizScale), y = Math.round(12 * vizScale);
  const p = document.getElementById('engineCanvas').getContext('2d').getImageData(x, y, 1, 1).data;
  ctx.setTransform(vizScale, 0, 0, vizScale, 0, 0);
  drawReplayHud({ pwrPeak: 1000 }, { v: 80, gear: 3, rpm: 3000, thr: 0.2, brk: 0.8, gLat: 0.4, gLong: -0.5, steer: 0.1, pwr: 1000, map: 1, fade: 1, tF: 500, tR: 200 }, vizW, 20);
  const cv = document.getElementById('engineCanvas');
  const sx = Math.min(cv.width - 2, Math.round(520 * vizScale)), sy = Math.min(cv.height - 2, Math.round(60 * vizScale));
  const sw = Math.min(cv.width - sx, Math.round(110 * vizScale)), sh = Math.min(cv.height - sy, Math.round(20 * vizScale));
  const block = cv.getContext('2d').getImageData(sx, sy, Math.max(1, sw), Math.max(1, sh)).data;
  let br = 0; for (let i = 0; i < block.length; i += 4) br = Math.max(br, block[i]);
  return { r: p[0], g: p[1], b: p[2], br };
});
console.log(lit);
if (lit.r + lit.g + lit.b < 80) fails.push('shift lights are dark at redline');
if (lit.br < 80) fails.push('hot brake is not marked');
await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
