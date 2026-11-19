// The title screen's pan is smooth (build 237).
//
// WHY THIS EXISTS. The menu's pan stuttered. It moved one <img> by its `left`, rounded to whole pixels twice, 20 times a
// second; it swapped the picture's src at each room (a fresh decode and a jump cut); and the whole bench was drawn
// under the menu on every frame. What must hold:
//   · 54 rooms, each its own <img>; a picture stays put for the whole hold, and only the visible room, the next,
//     and during a fade the room before, are decoded;
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
await page.waitForFunction(() => titleRooms.length === TITLE_ROOMS.length && titleRoomEl() && titleRoomEl().naturalWidth > 0, null, { timeout: 8000 }).catch(() => {});
const ready = await page.evaluate(() => ({ n: titleRooms.length, shown: !!(titleRoomEl() && titleRoomEl().naturalWidth), loaded: titleRooms.filter(R => R.im.getAttribute('src')).length }));
console.log('== rooms: ' + ready.n + ' slots, ' + ready.loaded + ' decoded, on view ' + ready.shown + ' ==');
if (ready.n !== 54) fails.push('expected 54 room slots, got ' + ready.n);
if (!ready.shown) fails.push('the room on view has no picture');
if (ready.loaded < 1 || ready.loaded > 3) fails.push('expected at most 3 rooms decoded, got ' + ready.loaded);

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
const only = (arr, ix) => arr.every((v, i) => v === ix.includes(i));
if (fade.idx !== 1 || !only(fade.on, [0, 1])) fails.push('during the fade, rooms 0 and 1 should both be on: ' + fade.on.map(v => v ? 1 : 0).join(''));
if (!(fade.z[1] > fade.z[0])) fails.push('the incoming room is not on top: z ' + fade.z.join(','));
if (!(fade.prevMoved < -0.5)) fails.push('the outgoing room stopped walking during the fade (' + fade.prevMoved.toFixed(2) + ' px)');
if (!only(fade.after, [1])) fails.push('after the fade only room 1 should be on: ' + fade.after.map(v => v ? 1 : 0).join(''));

// 4. covered across the walk, the end of a fade included, for the first rooms and one late one
const timing = await page.evaluate(() => ({ scene: SCENE_MS, fade: FADE_MS, n: TITLE_ROOMS.length }));
const cover = [];
for (const k of [0, 1, 4, timing.n - 1]) {
  for (const t of [0, 2500, timing.scene - 50]) {
    await page.evaluate(({ k, t, scene }) => titleAdvance(k * scene + t), { k, t, scene: timing.scene });
    await page.waitForFunction(k => {
      const i = titleRooms[k] && titleRooms[k].im;
      return i && i.complete && i.naturalWidth > 0 && i.classList.contains('on');
    }, k, { timeout: 8000 }).catch(() => {});
    const ok = await page.evaluate(k => {
      const i = titleRooms[k].im, b = i.getBoundingClientRect(), s = i.parentElement.getBoundingClientRect();
      return !!(i.naturalWidth && b.left <= s.left + 1 && b.right >= s.right - 1 && b.top <= s.top + 1 && b.bottom >= s.bottom - 1);
    }, k);
    if (!ok) cover.push(k + '@' + t);
  }
  await page.evaluate(({ k, scene, fade }) => titleAdvance((k + 1) * scene + fade - 40), { k, scene: timing.scene, fade: timing.fade });
  await page.waitForFunction(k => {
    const i = titleRooms[k] && titleRooms[k].im;
    return i && i.complete && i.naturalWidth > 0 && i.classList.contains('on');
  }, k, { timeout: 8000 }).catch(() => {});
  const okEnd = await page.evaluate(k => {
    const i = titleRooms[k].im, b = i.getBoundingClientRect(), s = i.parentElement.getBoundingClientRect();
    return !!(i.classList.contains('on') && i.naturalWidth && b.left <= s.left + 1 && b.right >= s.right - 1 && b.top <= s.top + 1 && b.bottom >= s.bottom - 1);
  }, k);
  if (!okEnd) cover.push(k + '@fade-end');
}
console.log('== stage covered on sampled rooms: ' + (cover.length ? 'NO ' + cover.join(' ') : 'yes') + ' ==');
if (cover.length) fails.push('the walk uncovers the stage at ' + cover.join(', '));

// 5. a room keeps its own picture for the hold, then the next room brings its own
const stable = await page.evaluate(() => {
  titleAdvance(1500);
  const a = titleRoomEl().getAttribute('src');
  titleAdvance(3500);
  const b = titleRoomEl().getAttribute('src');
  titleAdvance(5100);
  const c = titleRoomEl().getAttribute('src');
  const loaded = titleRooms.filter(R => R.im.getAttribute('src')).length;
  return { sameHold: a === b && a === TITLE_ROOMS[0], advanced: c === TITLE_ROOMS[1], loaded };
});
console.log('== picture held ' + stable.sameHold + ', advanced ' + stable.advanced + ', decoded ' + stable.loaded + ' ==');
if (!stable.sameHold) fails.push('the picture changed during a room\'s hold');
if (!stable.advanced) fails.push('the next room did not take its own picture');
if (stable.loaded < 1 || stable.loaded > 3) fails.push('decoded room window grew past 3 during the fade, got ' + stable.loaded);

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
await calm.waitForFunction(() => titleRooms.length === TITLE_ROOMS.length && titleRoomEl() && titleRoomEl().naturalWidth > 0, null, { timeout: 8000 }).catch(() => {});
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
