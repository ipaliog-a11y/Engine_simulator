// 3D-to-8-bit engine preview: camera angles, X-RAY cutaway, EV motor and phone layout.
//
// WHY THIS EXISTS. Build 433 replaced the flat 150x78 engine sprite with a 280x156 3D-to-8-bit
// renderer (engine-art-3d.js) and added angle/X-RAY controls under #enginePreview. What must hold:
//   · clicking each angle button (3/4 EXH, 3/4 INT, FRONT, SIDE) and X-RAY visibly changes #enginePreview;
//   · an electric drive draws cleanly into the 280x156 grid with real pixel coverage;
//   · at phone width (390x800) the ENGINE tab and its view bar cause no horizontal scroll;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const fails = [], errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; setTab('design'); });
await page.waitForTimeout(250);

const snap = () => page.evaluate(() => { previewT = 0; renderEnginePreview(); return document.getElementById('enginePreview').toDataURL(); });
const imgs = {};
for (const id of ['exh34', 'int34', 'front', 'side']) {
  await page.click(`#engViewBar button[data-engview="${id}"]`);
  await page.waitForTimeout(100);
  imgs[id] = await snap();
}
const uniqueViews = new Set(Object.values(imgs)).size;
console.log('== engine views unique:', uniqueViews, 'of 4 ==');
if (uniqueViews < 4) fails.push('not all 4 camera angles produce distinct renders: ' + uniqueViews);

await page.click('#engViewBar button[data-engview="exh34"]');
await page.waitForTimeout(100);
const beforeX = await snap();
await page.click('#engCutawayBtn');
await page.waitForTimeout(100);
const afterX = await snap();
console.log('== X-RAY changes image:', beforeX !== afterX, '==');
if (beforeX === afterX) fails.push('toggling X-RAY did not change #enginePreview');

const evCov = await page.evaluate(() => {
  const b = new PixBuf(ENG_GW, ENG_GH);
  drawEngineSprite(b, Object.assign({}, DEFAULT_ENGINE, { type: 'electric', evRotorD: 180, evStack: 160, evKWh: 80 }), 0);
  return b.c.filter(Boolean).length;
});
console.log('== EV motor pixels:', evCov, '==');
if (evCov < 4000) fails.push('EV 3D motor sprite is too small/blank: ' + evCov);

await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('== phone horizontal overflow:', overflow, 'px ==');
if (overflow > 1) fails.push('phone width has horizontal scroll: ' + overflow + ' px');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
