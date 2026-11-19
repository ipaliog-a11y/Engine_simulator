// Title screen rooms: the original four workshops, then fifty more cars and places (build 389).
//
// WHY THIS EXISTS. Build 209 opened on one hoist bay. Build 215 adds three more rooms and walks a
// left-to-right pan across each for five seconds before the next. Build 389 adds fifty pictures and keeps
// only the visible room, the next one, and during a fade the room before, decoded. What must hold:
//   · 54 scenes, each held 5000 ms, drawn wider than the stage so the pan has somewhere to go;
//   · every named picture exists on disk; room 4 is bay-miata and the last is canyon-camp;
//   · at most three pictures are decoded at once;
//   · titleAdvance(0) starts on scene 0 at pan 0; late in the hold the pan has moved right;
//   · crossing 5000 ms lands on the next scene and resets the pan;
//   · a full cycle (54 × 5000 ms) wraps to scene 0;
//   · every scene shows its picture (an <img>, titleRoomEl() the one on view), covering the stage, placed where the
//     pan says (test148 covers how it moves);
//   · the existing menu still opens on ?title=1 (test123 covers the buttons).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
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
console.log('title scenes', info.n, info.rooms[0], '…', info.rooms[info.n - 1]);
if (info.n !== 54) fails.push('expected 54 title scenes, got ' + info.n);
if (info.rooms[4] !== 'assets/landing/bay-miata.webp') fails.push('room 4 should be bay-miata, got ' + info.rooms[4]);
if (info.rooms[53] !== 'assets/landing/canyon-camp.webp') fails.push('last room should be canyon-camp, got ' + info.rooms[53]);
for (const room of info.rooms) {
  if (!fs.existsSync(path.join(repo, room))) fails.push('missing ' + room);
}
const loaded0 = await page.evaluate(() => titleRooms.filter(R => R.im.getAttribute('src')).length);
if (loaded0 < 1 || loaded0 > 3) fails.push('decoded room window should be 1 to 3 at the start, got ' + loaded0);
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
const fifth = await page.evaluate(() => titleAdvance(20100));
if (fifth.idx !== 4) fails.push('at 20.1 s expected scene 4 (first new room), got ' + fifth.idx);
const wrapAt = info.n * 5000 + 100;
const wrap = await page.evaluate(t => titleAdvance(t), wrapAt);
if (wrap.idx !== 0) fails.push('at ' + wrapAt + ' ms should wrap to scene 0, got ' + wrap.idx);

// Since build 230 each room is a picture (an <img>, assets/landing/): each must load, be the right room's picture,
// cover the stage, and sit where the pan says (its left edge at -pan × scale).
const seen = new Set();
for (const ms of [0, 4000, 5100, 10100, 15100, 20100]) {
  await page.evaluate(t => titleAdvance(t), ms);
  await page.waitForFunction(() => { const i = titleRoomEl(); return i && i.classList.contains('on') && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate(t => {
    const st = titleAdvance(t), i = titleRoomEl(), b = i.getBoundingClientRect(), s = i.parentElement.getBoundingClientRect();
    const scale = b.width / i.naturalWidth;
    return { idx: st.idx, pan: st.pan, src: i.getAttribute('src') || i.src, room: TITLE_ROOMS[st.idx], shown: i.classList.contains('on'), w: i.naturalWidth,
      covers: b.left <= s.left + 1 && b.right >= s.right - 1 && b.top <= s.top + 1 && b.bottom >= s.bottom - 1,
      leftOk: Math.abs((b.left - s.left) + st.pan * scale) <= 2 };
  }, ms);
  console.log(`scene at ${ms} ms: room ${r.idx} ${r.room} · pan ${r.pan} · covers ${r.covers} · placed ${r.leftOk}`);
  if (!r.shown || !r.w || !r.src.endsWith(r.room)) fails.push(`scene at ${ms} ms does not show room ${r.idx}'s picture`);
  if (!r.covers) fails.push(`scene at ${ms} ms does not cover the stage`);
  if (!r.leftOk) fails.push(`scene at ${ms} ms is not placed where the pan says`);
  seen.add(r.room);
}
if (seen.size !== 5) fails.push('not all of the first five rooms were shown: ' + [...seen].join(', '));
const loaded1 = await page.evaluate(() => titleRooms.filter(R => R.im.getAttribute('src')).length);
if (loaded1 < 1 || loaded1 > 3) fails.push('decoded room window grew past 3, got ' + loaded1);

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
