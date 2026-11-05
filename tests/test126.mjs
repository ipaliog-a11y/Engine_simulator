// Title screen rooms: tyre bay, V8 flat-lay, pit garage; five-second pan (build 215).
//
// WHY THIS EXISTS. Build 209 opened on one hoist bay. Build 215 adds three more rooms and walks a
// left-to-right pan across each for five seconds before the next. What must hold:
//   · four scenes, each held 5000 ms, drawn wider than the stage so the pan has somewhere to go;
//   · titleAdvance(0) starts on scene 0 at pan 0; late in the hold the pan has moved right;
//   · crossing 5000 ms lands on the next scene and resets the pan;
//   · every scene shows its picture (since build 230, assets/landing/*.webp in an <img>), covering the stage, placed
//     where the pan says;
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
// in picture pixels since build 230 (the picture is ~1900 px wide): 100 ms in, the pan is 2% of its walk
if (next.pan > next.maxPan * 0.05) fails.push('a new scene should restart the pan near 0, got ' + next.pan + ' of ' + next.maxPan);

const third = await page.evaluate(() => titleAdvance(10100));
if (third.idx !== 2) fails.push('at 10.1 s expected scene 2 (V8 flat-lay), got ' + third.idx);
const fourth = await page.evaluate(() => titleAdvance(15100));
if (fourth.idx !== 3) fails.push('at 15.1 s expected scene 3 (pit garage), got ' + fourth.idx);
const wrap = await page.evaluate(() => titleAdvance(20100));
if (wrap.idx !== 0) fails.push('at 20.1 s should wrap to scene 0, got ' + wrap.idx);

// Since build 230 each room is a picture (an <img>, assets/landing/): each must load, be the right room's picture,
// cover the stage, and sit where the pan says (its left edge at -pan × scale).
const seen = new Set();
for (const ms of [0, 4000, 5100, 10100, 15100]) {
  await page.evaluate(t => titleAdvance(t), ms);
  await page.waitForFunction(() => { const i = document.getElementById('titleImg'); return !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate(t => {
    const st = titleAdvance(t), i = document.getElementById('titleImg'), b = i.getBoundingClientRect(), s = i.parentElement.getBoundingClientRect();
    const scale = b.width / i.naturalWidth;
    return { idx: st.idx, pan: st.pan, src: i.getAttribute('src') || i.src, room: TITLE_ROOMS[st.idx], shown: !i.hidden, w: i.naturalWidth,
      covers: b.left <= s.left + 1 && b.right >= s.right - 1 && b.top <= s.top + 1 && b.bottom >= s.bottom - 1,
      leftOk: Math.abs((b.left - s.left) + st.pan * scale) <= 2 };
  }, ms);
  console.log(`scene at ${ms} ms: room ${r.idx} ${r.room} · pan ${r.pan} · covers ${r.covers} · placed ${r.leftOk}`);
  if (!r.shown || !r.w || !r.src.endsWith(r.room)) fails.push(`scene at ${ms} ms does not show room ${r.idx}'s picture`);
  if (!r.covers) fails.push(`scene at ${ms} ms does not cover the stage`);
  if (!r.leftOk) fails.push(`scene at ${ms} ms is not placed where the pan says`);
  seen.add(r.room);
}
if (seen.size !== 4) fails.push('not all four rooms were shown: ' + [...seen].join(', '));

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
