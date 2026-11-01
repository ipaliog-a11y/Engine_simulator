// Title screen rooms: tyre bay, V8 flat-lay, pit garage; five-second pan (build 215).
//
// WHY THIS EXISTS. Build 209 opened on one hoist bay. Build 215 adds three more rooms and walks a
// left-to-right pan across each for five seconds before the next. What must hold:
//   · four scenes, each held 5000 ms, drawn wider than the stage so the pan has somewhere to go;
//   · titleAdvance(0) starts on scene 0 at pan 0; late in the hold the pan has moved right;
//   · crossing 5000 ms lands on the next scene and resets the pan;
//   · every scene paints something (lit pixels on the canvas);
//   · the existing menu still opens on ?title=1 (test123 covers the buttons).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href + '?title=1';
const fails = [], errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(200);

const info = await page.evaluate(() => titleSceneInfo());
console.log('title scenes', info);
if (info.n !== 4) fails.push('expected 4 title scenes, got ' + info.n);
if (info.holdMs !== 5000) fails.push('each scene should hold 5000 ms, got ' + info.holdMs);
if (!(info.sceneW > info.viewW)) fails.push('scene is not wider than the view, so it cannot pan');
if (info.pan !== info.sceneW - info.viewW) fails.push('pan range should be sceneW - viewW');

const start = await page.evaluate(() => titleAdvance(0));
if (start.idx !== 0 || start.pan !== 0) fails.push('at t=0 expected scene 0 pan 0, got ' + JSON.stringify(start));

const mid = await page.evaluate(() => titleAdvance(4000));
if (mid.idx !== 0) fails.push('at 4 s still on scene 0, got ' + mid.idx);
if (!(mid.pan > start.pan + 20)) fails.push('pan should have walked right by 4 s: ' + start.pan + ' → ' + mid.pan);

const next = await page.evaluate(() => titleAdvance(5100));
if (next.idx !== 1) fails.push('at 5.1 s expected scene 1, got ' + next.idx);
if (next.pan > 5) fails.push('a new scene should restart the pan near 0, got ' + next.pan);

const third = await page.evaluate(() => titleAdvance(10100));
if (third.idx !== 2) fails.push('at 10.1 s expected scene 2 (V8 flat-lay), got ' + third.idx);
const fourth = await page.evaluate(() => titleAdvance(15100));
if (fourth.idx !== 3) fails.push('at 15.1 s expected scene 3 (pit garage), got ' + fourth.idx);
const wrap = await page.evaluate(() => titleAdvance(20100));
if (wrap.idx !== 0) fails.push('at 20.1 s should wrap to scene 0, got ' + wrap.idx);

for (const ms of [0, 5100, 10100, 15100]) {
  const lit = await page.evaluate(t => {
    titleAdvance(t);
    const cv = document.getElementById('titleBg');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 40) n++;
    return n;
  }, ms);
  console.log('scene at', ms, 'ms lit samples', lit);
  if (lit < 20) fails.push('scene at ' + ms + ' ms was not drawn');
}

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
