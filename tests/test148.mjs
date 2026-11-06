// The title screen's pan is smooth (build 237).
//
// WHY THIS EXISTS. The menu's pan stuttered. It moved one <img> by its `left`, rounded to whole pixels twice, 20 times a
// second; it swapped the picture's src at each room (a fresh decode and a jump cut); and the whole bench was drawn
// under the menu on every frame. What must hold:
//   · four rooms, each its own <img>, whose src never changes once set: no picture is swapped or decoded again;
//   · the room on view walks by a running Web Animation of its transform, so it moves on (almost) every frame, in one
//     direction, by sub-pixel steps of an even size, not by whole-pixel jumps every third frame;
//   · for the first FADE_MS of a room, the room before is still on, under it, and still walking; after that only the
//     room on view is on;
//   · the walk never uncovers the stage, at the end of a room's fade-out included;
//   · with "reduce motion", the room holds still and changes without a fade;
//   · the bench is not drawn while the menu covers it, and is drawn again once the menu closes.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href + '?title=1';
const browser = await chromium.launch();
const errors = [], fails = [];
const watch = p => {
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
};
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
watch(page);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => titleRooms.length === 4 && titleRooms.every(R => R.ready), null, { timeout: 8000 }).catch(() => {});
const ready = await page.evaluate(() => titleRooms.filter(R => R.ready).length);
if (ready !== 4) fails.push(`${ready} of 4 rooms decoded`);

// 1. four rooms, src set once
const srcs0 = await page.evaluate(() => [...document.querySelectorAll('#titleScreen .title-room')].map(i => i.getAttribute('src')));
console.log('== rooms: ' + srcs0.length + ' <img>: ' + srcs0.map(s => s.split('/').pop()).join(', ') + ' ==');
if (srcs0.length !== 4) fails.push('expected 4 room pictures, got ' + srcs0.length);

// 2. frame by frame: the room on view moves every frame, one way, in even sub-pixel steps
await page.evaluate(() => titleAdvance(1000));
await page.waitForTimeout(200);
const frames = await page.evaluate(() => new Promise(res => {
  const xs = [], el = titleRoomEl();
  const tick = () => { xs.push(el.getBoundingClientRect().left); if (xs.length < 61) requestAnimationFrame(tick); else res({ xs, anims: el.getAnimations().map(a => a.playState) }); };
  requestAnimationFrame(tick);
}));
const d = frames.xs.slice(1).map((x, k) => x - frames.xs[k]);
const still = d.filter(v => Math.abs(v) < 1e-6).length, back = d.filter(v => v > 1e-6).length;
const moving = d.filter(v => v < -1e-6), mean = moving.reduce((a, b) => a + b, 0) / (moving.length || 1);
const frac = d.filter(v => Math.abs(v - Math.round(v)) > 0.01).length;
const spread = moving.length ? Math.max(...moving.map(v => Math.abs(v - mean))) / Math.abs(mean) : 1;
console.log(`== motion over 60 frames: ${d.length - still} moved, ${still} still, ${back} backwards; step ${mean.toFixed(3)} px, ` +
  `${frac} sub-pixel; animation ${frames.anims.join(',')} ==`);
if (!frames.anims.includes('running')) fails.push('the room on view has no running animation: ' + frames.anims.join(','));
if (still > d.length * 0.1) fails.push(`the picture stood still on ${still} of ${d.length} frames (the old 50 ms step stood still on 2 in 3)`);
if (back) fails.push(`the picture moved backwards on ${back} frames`);
if (frac < moving.length * 0.5) fails.push('the steps are whole pixels, not sub-pixel');
// a frame can be late under a loaded runner, so a step can be twice the usual; more than that is a jump
if (spread > 1.5) fails.push(`uneven steps: up to ${(spread * 100).toFixed(0)}% off the mean ${mean.toFixed(3)} px`);

// 3. the crossfade
const fade = await page.evaluate(async () => {
  const st = titleAdvance(5000 + 200), on = titleRooms.map(R => R.im.classList.contains('on')), z = titleRooms.map(R => +R.im.style.zIndex);
  const prevX0 = titleRooms[0].im.getBoundingClientRect().left;
  await new Promise(r => setTimeout(r, 150));
  const prevX1 = titleRooms[0].im.getBoundingClientRect().left;
  titleAdvance(5000 + FADE_MS + 100);
  const after = titleRooms.map(R => R.im.classList.contains('on'));
  return { idx: st.idx, on, z, prevMoved: prevX1 - prevX0, after };
});
console.log(`== fade: at 5.2 s room ${fade.idx}; on ${fade.on.join(',')}; z ${fade.z.join(',')}; the room before moved ${fade.prevMoved.toFixed(1)} px; ` +
  `after the fade on ${fade.after.join(',')} ==`);
if (fade.idx !== 1 || !fade.on[0] || !fade.on[1] || fade.on[2] || fade.on[3]) fails.push('during the fade, rooms 0 and 1 should both be on: ' + fade.on.join(','));
if (!(fade.z[1] > fade.z[0])) fails.push('the incoming room is not on top: z ' + fade.z.join(','));
if (!(fade.prevMoved < -0.5)) fails.push('the outgoing room stopped walking during the fade (' + fade.prevMoved.toFixed(2) + ' px)');
if (fade.after.join() !== 'false,true,false,false') fails.push('after the fade only room 1 should be on: ' + fade.after.join(','));

// 4. covered at every point of the walk, its fade-out's end included
const cover = await page.evaluate(() => {
  const s = document.querySelector('#titleScreen .title-stage').getBoundingClientRect(), bad = [];
  for (let k = 0; k < 4; k++) {
    const R = titleRooms[k];
    for (const t of [0, 2500, SCENE_MS, SCENE_MS + FADE_MS]) {
      titleRoomAt(k, t); R.anim.pause();
      const b = R.im.getBoundingClientRect();
      if (!(b.left <= s.left + 1 && b.right >= s.right - 1 && b.top <= s.top + 1 && b.bottom >= s.bottom - 1)) bad.push(k + '@' + t);
    }
  }
  titleAdvance(0);
  return bad;
});
console.log('== stage covered at 0, 2.5 s, 5 s and 5.7 s of every walk: ' + (cover.length ? 'NO ' + cover.join(' ') : 'yes') + ' ==');
if (cover.length) fails.push('the walk uncovers the stage at ' + cover.join(', '));

// 5. still the same four pictures after a full cycle
await page.evaluate(() => { for (const t of [5100, 10100, 15100, 20100]) titleAdvance(t); });
const srcs1 = await page.evaluate(() => [...document.querySelectorAll('#titleScreen .title-room')].map(i => i.getAttribute('src')));
if (srcs1.join() !== srcs0.join()) fails.push('a room picture was swapped during the cycle');

// 6. the bench is not drawn under the menu
const drawn = await page.evaluate(async () => {
  let n = 0; const orig = window.drawEngine; window.drawEngine = function () { n++; return orig.apply(this, arguments); };
  setTab('engine'); openTitleScreen(); n = 0;
  await new Promise(r => setTimeout(r, 400));
  const under = n;
  closeTitleScreen(); n = 0;
  await new Promise(r => setTimeout(r, 400));
  const after = n;
  window.drawEngine = orig;
  return { under, after };
});
console.log(`== bench drawn ${drawn.under} times in 0.4 s under the menu, ${drawn.after} times once it closes ==`);
if (drawn.under) fails.push(`the bench was drawn ${drawn.under} times under the menu`);
if (!drawn.after) fails.push('the bench was not drawn again after the menu closed');
await page.close();

// 7. reduce motion: the room holds still
const calm = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
watch(calm);
await calm.goto(url, { waitUntil: 'networkidle' });
await calm.waitForFunction(() => titleRooms.length === 4 && titleRooms.every(R => R.ready), null, { timeout: 8000 }).catch(() => {});
const rm = await calm.evaluate(async () => {
  titleAdvance(500); const el = titleRoomEl(), x0 = el.getBoundingClientRect().left;
  await new Promise(r => setTimeout(r, 400));
  return { moved: el.getBoundingClientRect().left - x0, trans: getComputedStyle(el).transitionDuration, st: titleAdvance(4000) };
});
console.log(`== reduce motion: moved ${rm.moved} px in 0.4 s, fade ${rm.trans}, pan ${rm.st.pan} ==`);
if (Math.abs(rm.moved) > 0.01 || rm.st.pan !== 0) fails.push('with reduce motion the room still walks');
if (rm.trans !== '0s') fails.push('with reduce motion the rooms still fade (' + rm.trans + ')');
await calm.close();

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
