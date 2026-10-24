// The guide as a wiki (build 139): every page climbs three levels (real life, the game, the physics), its
// pictures are drawn in code and actually draw, its links all land somewhere, the index can be searched, the
// animation runs only while the guide is open, Greek keeps the blocks it still has and falls back to English
// for the new ones, and a phone never scrolls sideways.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];

// ---------------------------------------------------------------- 1. structure, pictures, links
const s = await page.evaluate(async () => {
  setTab('guide');
  const pages = guidePages(), out = { pages: pages.length, ref: 0, tierBad: [], artBad: [], artMissing: [], arts: 0, linkBad: [], links: 0, noArt: [] };
  // a picture "draws" if a good share of its cells are not the backdrop
  const inked = cv => { const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n / (d.length / 4); };
  for (const pg of pages) {
    const id = pg.id.slice(3);
    showGuide(id);
    await new Promise(r => requestAnimationFrame(r));
    const tiers = ['gt-real', 'gt-game', 'gt-phys'].map(c => pg.querySelector('.gtier.' + c));
    const isRef = !tiers.some(Boolean);
    if (isRef) { out.ref++; if (!pg.querySelector('.guide-body')) out.tierBad.push(id + ' (no body)'); }
    else if (!tiers.every(t => t && t.querySelector('.gtier-h') && t.querySelector('.guide-body'))) out.tierBad.push(id);
    const cvs = [...pg.querySelectorAll('canvas.gart')];
    if (!cvs.length) out.noArt.push(id);
    for (const cv of cvs) {
      out.arts++;
      if (!GUIDE_ART[cv.dataset.art]) { out.artMissing.push(id + ':' + cv.dataset.art); continue; }
      drawGuideArt(cv, 1.7);
      const f = inked(cv);
      if (!(f > 0.01)) out.artBad.push(`${id}:${cv.dataset.art} ${(f * 100).toFixed(2)}%`);
    }
    for (const a of pg.querySelectorAll('a[data-gp]')) { out.links++; if (!document.getElementById('gp-' + a.dataset.gp)) out.linkBad.push(id + '->' + a.dataset.gp); }
  }
  // following a link moves the guide
  showGuide('glossary');
  document.querySelector('#gp-glossary a[data-gp="knock"]').click();
  out.linkFollowed = guideCur;
  // every picture moves or stands still as declared: an animated one differs between two times
  out.still = Object.entries(GUIDE_ART).filter(([n, a]) => a.anim).filter(([n]) => {
    const cv = document.createElement('canvas'); cv.className = 'gthumb'; cv.dataset.art = n;
    drawGuideArt(cv, 0.4); const a = cv.toDataURL(); drawGuideArt(cv, 1.9); return a === cv.toDataURL();
  }).map(([n]) => n);
  showGuide(null);
  out.thumbs = document.querySelectorAll('#guideIndex canvas.gthumb').length;
  out.buttons = document.querySelectorAll('#guideIndex button[data-gp]').length;
  out.cats = new Set(pages.map(p => p.dataset.cat)).size;
  return out;
});
console.log(`wiki: ${s.pages} pages (${s.ref} reference) in ${s.cats} sections, ${s.arts} pictures, ${s.links} links, ${s.thumbs} index icons`);
if (s.pages < 50) fails.push(`only ${s.pages} pages`);
if (s.tierBad.length) fails.push('pages without all three levels: ' + s.tierBad.join(', '));
if (s.ref > 4) fails.push(`${s.ref} reference pages: only the limits, calibration and glossary pages should skip the levels`);
if (s.noArt.length) fails.push('pages without a picture: ' + s.noArt.join(', '));
if (s.artMissing.length) fails.push('pictures with no drawing: ' + s.artMissing.join(', '));
if (s.artBad.length) fails.push('pictures that drew (almost) nothing: ' + s.artBad.join(', '));
if (s.still.length) fails.push('animated pictures that do not move: ' + s.still.join(', '));
if (s.linkBad.length) fails.push('links to missing pages: ' + s.linkBad.join(', '));
if (s.links < 100) fails.push(`only ${s.links} cross-links`);
if (s.linkFollowed !== 'knock') fails.push(`clicking a glossary link landed on ${s.linkFollowed}, not knock`);
if (s.thumbs !== s.pages || s.buttons !== s.pages) fails.push(`index has ${s.buttons} entries and ${s.thumbs} icons for ${s.pages} pages`);

// ---------------------------------------------------------------- 2. search
const q = await page.evaluate(() => {
  showGuide(null);
  const inp = document.getElementById('guideSearch'), shown = () => [...document.querySelectorAll('#guideIndex button[data-gp]')].filter(b => b.style.display !== 'none').map(b => b.dataset.gp);
  const set = v => { inp.value = v; inp.dispatchEvent(new Event('input')); return shown(); };
  const r = { all: set('').length, waste: set('wastegate'), two: set('camber roll'), none: set('zzqqxx').length, noHit: !document.getElementById('guideNoHit').hidden };
  set(''); r.noHitAfter = !document.getElementById('guideNoHit').hidden;
  showGuide('turbo'); r.boxHidden = document.getElementById('guideSearchBox').hidden; showGuide(null);
  return r;
});
if (!q.waste.includes('wastegate') || q.waste.length >= q.all) fails.push(`search "wastegate" shows ${q.waste.length} of ${q.all}, wastegate page ${q.waste.includes('wastegate') ? 'in' : 'missing'}`);
if (!q.two.includes('suspension') || q.two.length >= q.waste.length + 20) fails.push('a two-word search does not narrow to the suspension page: ' + q.two.join(','));
if (q.none !== 0 || !q.noHit || q.noHitAfter) fails.push('a search with no hits does not say so, or the notice sticks');
if (!q.boxHidden) fails.push('the search box stays up over an open page');

// ---------------------------------------------------------------- 3. the animation loop lives only in the guide
const anim = await page.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  setTab('guide'); showGuide('turbo'); await frame();
  const on = guideArtRaf !== 0;
  const cv = document.querySelector('#gp-turbo canvas.gart'), a = cv.toDataURL();
  await new Promise(r => setTimeout(r, 300)); const moved = a !== cv.toDataURL();
  setTab('engine'); await frame(); await frame();
  const offTab = guideArtRaf === 0;
  setTab('guide'); showGuide('glossary'); await frame(); await frame();
  const offStatic = guideArtRaf === 0;      // the glossary's picture does not move
  showGuide(null); setTab('engine');
  return { on, moved, offTab, offStatic };
});
if (!anim.on || !anim.moved) fails.push('the turbo picture does not animate on its page');
if (!anim.offTab) fails.push('the animation keeps running after leaving the GUIDE tab');
if (!anim.offStatic) fails.push('the animation loop runs on a page with no moving picture');

// ---------------------------------------------------------------- 4. Greek: kept blocks Greek, new ones English
// Since build 161 every block has Greek, so a new, untranslated block is stood in for by taking one block's
// Greek away for the check (and putting it back).
const el = await page.evaluate(() => {
  const kept = GUIDE_I18N.welcomeReal; delete GUIDE_I18N.welcomeReal;
  applyLang('el'); setTab('guide'); showGuide('welcome');
  const r = { loop: document.querySelector('[data-gk="loop"]').textContent, fresh: document.querySelector('[data-gk="welcomeReal"]').textContent,
    tier: document.querySelector('#gp-welcome .gt-phys .gtier-h').textContent, cat: document.querySelector('#guideNav .crumb').textContent };
  applyLang('en'); r.tierEn = document.querySelector('#gp-welcome .gt-phys .gtier-h').textContent; showGuide(null); setTab('engine');
  GUIDE_I18N.welcomeReal = kept;
  return r;
});
if (!/ΚΙΝΗΤΗΡΑΣ/.test(el.loop)) fails.push('the kept Greek block (loop) is not Greek in Greek');
if (!/dynamometer/.test(el.fresh)) fails.push('a new block without Greek does not fall back to English');
if (el.tier !== 'LV3 · Η ΦΥΣΙΚΗ' || el.tierEn !== 'LV3 · THE PHYSICS') fails.push(`level label in Greek "${el.tier}", back in English "${el.tierEn}"`);

// ---------------------------------------------------------------- 5. a phone never scrolls sideways
await page.setViewportSize({ width: 375, height: 800 });
const ph = await page.evaluate(async () => {
  setTab('guide'); const bad = [];
  for (const id of ['index', 'fourstroke', 'turbo', 'fuels', 'scorecard', 'tyres', 'glossary']) {
    showGuide(id === 'index' ? null : id); await new Promise(r => setTimeout(r, 50));
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) bad.push(id + ' ' + document.documentElement.scrollWidth);
  }
  const fs = parseFloat(getComputedStyle(document.querySelector('#gp-glossary .guide-body')).fontSize);
  showGuide(null); setTab('engine'); return { bad, fs };
});
if (ph.bad.length) fails.push('horizontal scroll at phone width: ' + ph.bad.join(', '));

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL\n  ' + fails.join('\n  ') : '\nPASS — three levels on every page, pictures draw and move, links land, search narrows, Greek falls back, phones fit');
await browser.close();
process.exit(fails.length ? 1 : 0);
