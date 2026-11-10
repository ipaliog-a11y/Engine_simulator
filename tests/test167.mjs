// The four sections: BUILD, TEST, DRIVE, MORE (build 261).
//
// WHY THIS EXISTS. Ten tabs wrapped into three rows on a phone and took a fifth of the screen. They are now four
// sections; a phone shows a bar of the four at the foot of the screen, and the tabs as one strip that slides to the
// open section. What must hold:
//   · desktop: all ten tabs show in one row, and the section bar is hidden;
//   · phone (390 px upright): the bar shows, fixed to the foot of the screen, with four buttons;
//   · the tabs are one row; the open section's tabs are in view and lit; a section opens on the tab last used in it;
//   · every tab can still be clicked from anywhere (older tests do), and the page never scrolls sideways;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const fails = [], errors = [];
const open = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; });
  await page.waitForTimeout(300);
  return page;
};
const shown = page => page.evaluate(() => ({
  tabs: (() => { const st = document.querySelector('.viz-tabs').getBoundingClientRect(); return [...document.querySelectorAll('.viz-tabs button.ing')].filter(b => { const r = b.getBoundingClientRect(); return r.left >= st.left - 1 && r.right <= st.right + 1; }).map(b => b.id); })(),
  all: [...document.querySelectorAll('.viz-tabs button')].filter(b => b.offsetParent).length,
  rows: new Set([...document.querySelectorAll('.viz-tabs button')].filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().top))).size,
  bar: (() => { const n = document.getElementById('vizGroups'), r = n.getBoundingClientRect(); return { on: !!n.offsetParent || getComputedStyle(n).position === 'fixed' && getComputedStyle(n).display !== 'none', n: n.children.length, bottom: Math.round(innerHeight - r.bottom), active: (n.querySelector('.active') || {}).dataset?.g }; })(),
  mode: vizMode, side: document.documentElement.scrollWidth - innerWidth,
}));

// ---- desktop
let page = await open(1280, 800);
let s = await shown(page);
console.log('desktop:', s.all, 'tabs in', s.rows, 'row(s); bar', s.bar.on ? 'shown' : 'hidden');
if (s.all !== 10 || s.rows !== 1) fails.push(`desktop shows ${s.all} tabs in ${s.rows} rows, wanted 10 in 1`);
if (s.bar.on) fails.push('desktop shows the section bar');
await page.close();

// ---- phone
page = await open(390, 844);
s = await shown(page);
console.log('phone:', s.tabs.join(' '), '| bar', JSON.stringify(s.bar));
if (!s.bar.on || s.bar.n !== 4) fails.push('phone: no bar of four sections');
if (Math.abs(s.bar.bottom) > 1) fails.push(`phone: the bar is ${s.bar.bottom}px off the foot of the screen`);
if (s.rows !== 1) fails.push(`phone: tabs in ${s.rows} rows`);
const want = { build: ['tabDesign', 'tabVehicle', 'tabParts', 'tabGarage'], test: ['tabEngine', 'tabDyno'], drive: ['tabTrack', 'tabRace'], more: ['tabGuide', 'tabOptions'] };
for (const g of Object.keys(want)) {
  await page.click(`#vizGroups button[data-g="${g}"]`);
  await page.waitForTimeout(700);
  s = await shown(page);
  console.log(`  ${g}: ${s.tabs.join(' ')} -> ${s.mode}`);
  if (s.tabs.join() !== want[g].join()) fails.push(`${g} shows ${s.tabs.join()}`);
  if (s.bar.active !== g) fails.push(`${g} is not marked open on the bar`);
  if (s.side > 1) fails.push(`${g}: the page scrolls sideways by ${s.side}px`);
  for (const id of want[g]) {                       // every tab of the section can be clicked
    await page.click('#' + id); await page.waitForTimeout(150);
    const m = await page.evaluate(() => vizMode);
    const exp = id === 'tabDesign' ? 'design' : id === 'tabEngine' ? 'engine' : id.slice(3).toLowerCase();
    if (m !== exp) fails.push(`${id} opened ${m}`);
  }
}
// a section opens on the tab last used in it
await page.click('#tabTrack'); await page.waitForTimeout(200);   // a tab of another section, straight from here
if (await page.evaluate(() => vizMode) !== 'track') fails.push('TRACK could not be opened from MORE');
await page.click('#vizGroups button[data-g="build"]'); await page.waitForTimeout(150);
s = await shown(page);
console.log('  back to build ->', s.mode);
if (s.mode !== 'garage') fails.push(`BUILD reopened on ${s.mode}, last used was garage`);
await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
