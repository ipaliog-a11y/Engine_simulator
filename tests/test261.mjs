// 3D-to-8-bit parts designer preview: all 13 part types, views, X-RAY, suspension axle toggle and phone layout.
//
// WHY THIS EXISTS. Build 434 added a shared 280x156 Pix3D 3D-to-8-bit preview (#partPreview3d)
// and interactive view bar (#partViewBar) to the Parts Designer. What must hold:
//   · clicking each angle button (3/4, FRONT, SIDE, TOP) and X-RAY visibly changes #partPreview3d;
//   · all 13 ready PART_KINDS render non-blank pixel geometry in both normal and X-RAY views;
//   · editing a part dimension visibly updates #partPreview3d;
//   · the suspension FRONT/REAR axle toggle appears only for susp and toggles cleanly;
//   · at phone width (390x800) the PARTS tab and #partViewBar cause no horizontal scroll;
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
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; setTab('parts'); });
await page.waitForTimeout(250);

const snap = () => page.evaluate(() => { previewT = 0; renderPartPreview(); return document.getElementById('partPreview3d').toDataURL(); });
const imgs = {};
for (const id of ['iso34', 'front', 'side', 'top']) {
  await page.click(`#partViewBar button[data-partview="${id}"]`);
  await page.waitForTimeout(80);
  imgs[id] = await snap();
}
const uniqueViews = new Set(Object.values(imgs)).size;
console.log('== part views unique:', uniqueViews, 'of 4 ==');
if (uniqueViews < 4) fails.push('not all 4 part camera angles produce distinct renders: ' + uniqueViews);

await page.click('#partViewBar button[data-partview="iso34"]');
await page.waitForTimeout(80);
const beforeX = await snap();
await page.click('#partCutawayBtn');
await page.waitForTimeout(80);
const afterX = await snap();
console.log('== part X-RAY changes image:', beforeX !== afterX, '==');
if (beforeX === afterX) fails.push('toggling X-RAY did not change #partPreview3d');
await page.click('#partCutawayBtn');

const cov = await page.evaluate(() => {
  const ready = PART_KINDS.filter(k => k.ready).map(k => k.kind);
  const out = [];
  for (const kind of ready) {
    partsUI.kind = kind;
    renderParts();
    const p = partFromEditor(kind);
    const R = getEng3D(ENG_GW, ENG_GH);
    buildPart3D(R, kind, p, 0.5, { cutaway: false });
    let n0 = 0; for (let i = 0; i < R.col.length; i++) if (R.col[i]) n0++;
    R.clear();
    buildPart3D(R, kind, p, 0.5, { cutaway: true });
    let n1 = 0; for (let i = 0; i < R.col.length; i++) if (R.col[i]) n1++;
    const axleHidden = document.getElementById('partAxleBtn').hidden;
    out.push({ kind, n0, n1, axleHidden });
  }
  return out;
});
for (const c of cov) {
  if (c.n0 < 1500 || c.n1 < 1500) fails.push(`part ${c.kind} sparse render: norm=${c.n0}, xray=${c.n1}`);
  if (c.kind === 'susp' && c.axleHidden) fails.push('#partAxleBtn should be visible on susp');
  if (c.kind !== 'susp' && !c.axleHidden) fails.push(`#partAxleBtn should be hidden on ${c.kind}`);
}
console.log('== 13 part kinds coverage ok:', cov.length, '==');

// Live dimension edit visibly updates #partPreview3d (turbo compressor exducer)
await page.evaluate(() => { partsUI.kind = 'turbo'; renderParts(); });
const tBefore = await snap();
await page.evaluate(() => { document.getElementById('pbComp').value = '112'; previewPart('turbo'); });
const tAfter = await snap();
console.log('== turbo dimension edit changes image:', tBefore !== tAfter, '==');
if (tBefore === tAfter) fails.push('changing turbo compressor diameter did not change #partPreview3d');

// Suspension axle toggle
await page.evaluate(() => { partsUI.kind = 'susp'; renderParts(); });
const axleBefore = await page.textContent('#partAxleBtn');
await page.click('#partAxleBtn');
const axleAfter = await page.textContent('#partAxleBtn');
console.log('== susp axle toggle:', axleBefore, '->', axleAfter, '==');
if (axleBefore === axleAfter) fails.push('clicking #partAxleBtn did not switch FRONT/REAR axle');

await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('== phone horizontal overflow:', overflow, 'px ==');
if (overflow > 1) fails.push('phone width has horizontal scroll: ' + overflow + ' px');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
