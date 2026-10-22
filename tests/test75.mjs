// The full-screen track view (build 143): ⛶ in TRACK's live timing puts the lap, its live instruments and the
// replay controls on a page of their own, in landscape: turned a quarter by the page itself when a phone is held
// upright (where the browser will not lock the orientation), and back where they were on ✕.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const errors = [], fails = [];
for (const [w, h, tag] of [[390, 844, 'phone upright'], [844, 390, 'phone sideways'], [1280, 900, 'desktop']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
  page.on('console', m => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('#tabTrack'); await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('btnTrackFull').click());
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => {
    const bar = document.getElementById('trackBar').getBoundingClientRect(), row = document.getElementById('trackReplayRow');
    return { open: trackPage.open, rot: trackPage.rot, vizW, vizH,
      canvas: document.getElementById('trackStage').contains(canvas), controls: document.getElementById('trackBar').contains(row),
      hud: !!(lapResult && lapResult.replay), playing: lapReplay.playing,
      overflow: [...row.children].some(el => el.scrollWidth > el.clientWidth + 1), sw: document.documentElement.scrollWidth };
  });
  console.log(`== ${tag}: open ${s.open}, turned ${s.rot}, drawing ${s.vizW}x${s.vizH}, map ${s.canvas}, controls ${s.controls}, playing ${s.playing}`);
  if (!s.open || !s.canvas || !s.controls) fails.push(tag + ': ⛶ does not put the map and the replay controls on the full-screen page');
  if (!(s.vizW > s.vizH)) fails.push(tag + ': the full-screen view is not landscape');
  if (!(s.vizH >= 380)) fails.push(tag + ': too little height for the live instruments');
  if (s.rot !== (h > w)) fails.push(tag + ': turned when it should not be, or not when it should');
  if (!s.playing) fails.push(tag + ': the replay is not running');
  if (s.overflow) fails.push(tag + ': a control in the bar is cut off');
  if (s.sw > w) fails.push(tag + ': the page scrolls sideways');
  // a drag pans the map the way the finger moves, through the turn as well
  await page.evaluate(() => { trackView.z = 3; trackView.x = 0; trackView.y = 0; });
  const r = await page.evaluate(() => { const b = canvas.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  const d = s.rot ? [0, 60] : [60, 0];   // along the drawing's own x: down the screen when turned
  await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + d[0], r.y + d[1], { steps: 4 }); await page.mouse.up();
  const pan = await page.evaluate(() => ({ x: trackView.x, y: trackView.y }));
  if (!(pan.x > 10 && Math.abs(pan.y) < Math.abs(pan.x) / 3)) fails.push(`${tag}: dragging along the drawing does not pan along it (${pan.x.toFixed(1)}, ${pan.y.toFixed(1)})`);
  await page.evaluate(() => document.getElementById('btnTrackFull').click());
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => ({ open: trackPage.open, vizW, home: document.querySelector('.viz-panel').contains(canvas),
    row: document.getElementById('trackPanel').contains(document.getElementById('trackReplayRow')) }));
  if (b.open || !b.home || !b.row || b.vizW !== 640) fails.push(tag + ': ✕ does not put the map and the controls back');
  await page.close();
}
console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
