// UI: tab names, the firing order on the LIVE bank, the paged guide, and the Greek font.
//
// Each of these was a real complaint, and each is checked by what it does rather than by what the
// markup says:
//   · Greek text was falling back to the system monospace, because the bundled pixel font was the
//     latin subset only — so at the same CSS size it rendered far smaller and was unreadable. The
//     check is that the browser actually LOADED the Greek face, not that a @font-face rule exists.
//   · The LIVE bank fired every engine 1-2-3-...-n. The check is the crank geometry, which is the
//     same fact: in an inline four firing 1-3-4-2, pistons 1 and 4 are always level.
//   · The guide was one long sheet at 8px. It is now an index of pages at 16px, and every page has to
//     be reachable by NEXT from the first.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// ---------------------------------------------------------------- 1. tab names
const tabs = await page.evaluate(() => [...document.querySelectorAll('.viz-tabs button')].map(b => b.textContent.trim()));
console.log('tabs:', tabs.join(' | '));
if (tabs[0] !== 'ENGINE') fails.push(`design tab should read ENGINE, reads ${tabs[0]}`);
if (!tabs.includes('LIVE')) fails.push('the running-engine tab should read LIVE');
if (tabs.includes('DESIGN')) fails.push('a tab still reads DESIGN');

// ---------------------------------------------------------------- 2. firing order
const fo = await page.evaluate(() => {
  const out = {};
  for (const [lay, n] of [['inline', 4], ['inline', 6], ['v', 8], ['v', 12], ['boxer', 6], ['v', 5]])
    out[lay + n] = firingOrder(lay, n).join('-');
  // crank geometry of an inline four, sampled round a full cycle
  const order = firingOrder('inline', 4), cycle = Math.PI * 4, save = crankAngle;
  let worst14 = 0, worst23 = 0, worst12 = 0;
  for (let k = 0; k < 72; k++) {
    crankAngle = cycle * k / 72;
    const f = i => pistonFrac(cylPhase(i, 4, cycle, order), 3.2);
    worst14 = Math.max(worst14, Math.abs(f(0) - f(3)));
    worst23 = Math.max(worst23, Math.abs(f(1) - f(2)));
    worst12 = Math.max(worst12, Math.abs(f(0) - f(1)));
  }
  // cylinder 3 must fire 180 degrees after cylinder 1
  crankAngle = 0;
  const lag3 = (cylPhase(0, 4, cycle, order) - cylPhase(2, 4, cycle, order) + cycle) % cycle;
  crankAngle = save;
  return { out, worst14, worst23, worst12, lag3deg: lag3 * 180 / Math.PI };
});
console.log('firing orders:', JSON.stringify(fo.out));
console.log(`inline four: |p1-p4| max ${fo.worst14.toFixed(4)}, |p2-p3| max ${fo.worst23.toFixed(4)}, |p1-p2| max ${fo.worst12.toFixed(3)}, cyl 3 fires ${fo.lag3deg.toFixed(0)} deg after cyl 1`);
const want = { inline4: '1-3-4-2', inline6: '1-5-3-6-2-4', v8: '1-5-4-8-6-3-7-2', v12: '1-7-5-11-3-9-6-12-2-8-4-10', boxer6: '1-6-2-4-3-5', v5: '1-2-3-4-5' };
for (const [k, v] of Object.entries(want)) if (fo.out[k] !== v) fails.push(`${k} fires ${fo.out[k]}, expected ${v}`);
if (fo.worst14 > 1e-9 || fo.worst23 > 1e-9) fails.push('inline four: pistons 1&4 (and 2&3) are not level — firing order and crank geometry disagree');
if (!(fo.worst12 > 0.9)) fails.push('inline four: pistons 1 and 2 should be a full stroke apart at TDC');
if (Math.abs(fo.lag3deg - 180) > 0.5) fails.push(`cylinder 3 should fire 180 deg after cylinder 1, not ${fo.lag3deg.toFixed(1)}`);

// ---------------------------------------------------------------- 3. guide
const g = await page.evaluate(() => {
  setTab('guide'); showGuide(null);
  const pages = guidePages(), indexButtons = document.querySelectorAll('#guideIndex button[data-gp]').length;
  showGuide(pages[0].id.slice(3));
  let n = 1;
  for (;;) { const b = document.querySelector('#guideNav button[data-go="next"]'); if (!b || b.disabled) break; b.click(); if (++n > 200) break; }
  const visible = pages.filter(p => !p.hidden).length;
  const fs = parseFloat(getComputedStyle(document.querySelector('.guide-body')).fontSize);
  const wide = document.querySelector('.main').classList.contains('wide');
  const cats = new Set(pages.map(p => p.dataset.cat)).size;
  showGuide(null);
  return { pages: pages.length, indexButtons, walked: n, visible, fs, wide, cats };
});
console.log(`guide: ${g.pages} pages in ${g.cats} categories, ${g.indexButtons} index entries, NEXT walks ${g.walked}, ${g.visible} page visible at a time, body ${g.fs}px`);
if (g.pages < 20) fails.push(`guide has only ${g.pages} pages`);
if (g.indexButtons !== g.pages) fails.push(`index lists ${g.indexButtons} of ${g.pages} pages`);
if (g.walked !== g.pages) fails.push(`NEXT reaches ${g.walked} of ${g.pages} pages`);
if (g.visible !== 1) fails.push(`${g.visible} guide pages visible at once`);
if (!(g.fs >= 16)) fails.push(`guide body is ${g.fs}px — it was 8px and should be at least double`);
if (!g.wide) fails.push('the guide should take the full width');

// ---------------------------------------------------------------- 4. Greek font actually loads
const font = await page.evaluate(async () => {
  applyLang('el');
  await document.fonts.load("16px 'Press Start 2P'", 'ΚΙΝΗΤΗΡΑΣ αβγ');
  const faces = [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Press Start 2P');
  const greek = faces.find(f => /U\+0?3[A7]/i.test(f.unicodeRange));
  // measured, not inferred: a Greek string set in the pixel font is as wide per glyph as latin
  const c = document.createElement('canvas').getContext('2d');
  c.font = "16px 'Press Start 2P'";
  const wl = c.measureText('ABCDEFGH').width / 8, wg = c.measureText('ΑΒΓΔΕΖΗΘ').width / 8;
  applyLang('en');
  return { status: greek && greek.status, wl, wg };
});
console.log(`Greek face: ${font.status}; glyph width latin ${font.wl.toFixed(1)}px, Greek ${font.wg.toFixed(1)}px`);
if (font.status !== 'loaded') fails.push(`the Greek subset of the pixel font did not load (${font.status})`);
if (Math.abs(font.wg - font.wl) > 0.5) fails.push('Greek glyphs are not set in the same pixel font as latin');

// ---------------------------------------------------------------- 5. build 85 additions
const b85 = await page.evaluate(() => {
  const out = {};
  // caps: 4 rotors, 6 two-stroke cylinders, offered counts above the cap disabled
  const g = id => document.getElementById(id);
  g('edType').value = 'rotary'; g('edType').dispatchEvent(new Event('change'));
  out.rotary = [...g('edCyl').options].filter(o => !o.disabled).map(o => +o.value);
  g('edType').value = 'twostroke'; g('edType').dispatchEvent(new Event('change'));
  out.two = [...g('edCyl').options].filter(o => !o.disabled).map(o => +o.value);
  g('edType').value = 'petrol4'; g('edType').dispatchEvent(new Event('change'));
  // dyno result: the headline figures are the scorecard's
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4').engine)); buildEngine();
  setTab('dyno'); renderDynoResult(true);
  const box = g('dynoResult');
  out.dyno = { shown: !box.hidden, text: box.textContent, hp: engine.score.peakHP, tq: engine.score.peakTQ, rows: box.querySelectorAll('tbody tr').length };
  setTab('engine'); out.dynoHiddenElsewhere = box.hidden;
  // track zoom: the map point under the cursor must not move, and a new circuit resets the view
  setTab('track'); drawTrack();
  trackViewReset();
  const vx = 200, vy = 260, base = { x: trackView.mcx + (vx - trackView.mcx - trackView.x) / trackView.z, y: trackView.mcy + (vy - trackView.mcy - trackView.y) / trackView.z };
  trackZoomAt(vx, vy, 3.5);
  const sx = trackView.mcx + (base.x - trackView.mcx) * trackView.z + trackView.x, sy = trackView.mcy + (base.y - trackView.mcy) * trackView.z + trackView.y;
  out.zoom = { z: trackView.z, drift: Math.hypot(sx - vx, sy - vy) };
  trackZoomAt(vx, vy, 0.01); out.zoomFloor = trackView.z;
  trackZoomAt(vx, vy, 100); out.zoomCap = trackView.z;
  trackView.key = 'some other circuit'; drawTrack(); out.resetOnTrackChange = trackView.z;
  setTab('engine');
  return out;
});
console.log(`caps: rotary ${b85.rotary.join(',')} · two-stroke ${b85.two.join(',')}`);
console.log(`dyno result: shown ${b85.dyno.shown}, ${b85.dyno.rows} rows, hidden elsewhere ${b85.dynoHiddenElsewhere}`);
console.log(`track zoom: ×${b85.zoom.z.toFixed(1)}, cursor drift ${b85.zoom.drift.toExponential(1)}, floor ${b85.zoomFloor}, cap ${b85.zoomCap}, after a circuit change ${b85.resetOnTrackChange}`);
if (Math.max(...b85.rotary) !== 4) fails.push(`rotary should offer up to 4 rotors, offers ${b85.rotary.join(',')}`);
if (Math.max(...b85.two) !== 6) fails.push(`two-stroke should offer up to 6 cylinders, offers ${b85.two.join(',')}`);
if (!b85.dyno.shown) fails.push('the dyno result panel is not shown on the DYNO tab');
if (!b85.dynoHiddenElsewhere) fails.push('the dyno result panel shows outside the DYNO tab');
if (!b85.dyno.text.includes(b85.dyno.hp + ' hp') || !b85.dyno.text.includes(b85.dyno.tq + ' Nm'))
  fails.push(`the dyno result does not headline the scorecard's ${b85.dyno.hp} hp / ${b85.dyno.tq} Nm`);
if (b85.dyno.rows < 8) fails.push(`the run-data table has only ${b85.dyno.rows} rows`);
if (!(b85.zoom.drift < 1e-6)) fails.push(`zooming moved the point under the cursor by ${b85.zoom.drift}`);
if (b85.zoomFloor !== 1) fails.push(`zoom went below the fitted view (${b85.zoomFloor})`);
if (!(b85.zoomCap <= 16)) fails.push(`zoom is not capped (${b85.zoomCap})`);
if (b85.resetOnTrackChange !== 1) fails.push('changing circuit should reset the map view');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
