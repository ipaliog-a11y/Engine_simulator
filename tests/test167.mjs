// The four sections: BUILD, TEST, DRIVE, MORE.
//
// WHY THIS EXISTS. The tab bar used to mix BUILD, DRIVE and TEST, and a phone on its side lost the section bar and
// squeezed every tab into one unreadable strip. What must hold:
//   · desktop and a wide screen show the section bar in the page, and only the open section's tabs, in one row;
//   · a phone upright (390×844) and on its side (844×390) pins that bar to the foot of the screen;
//   · a section opens on the tab last used in it, and a hidden tab can still be opened by script;
//   · the canvas stays within 560px tall on a wide screen, and the page never scrolls sideways;
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
  dom: document.querySelectorAll('.viz-tabs button').length,
  rows: new Set([...document.querySelectorAll('.viz-tabs button.ing')].map(b => Math.round(b.getBoundingClientRect().top))).size,
  bar: (() => { const n = document.getElementById('vizGroups'), r = n.getBoundingClientRect(), s = getComputedStyle(n); return { on: s.display !== 'none' && r.width > 0, fixed: s.position === 'fixed', n: n.children.length, bottom: Math.round(innerHeight - r.bottom), active: (n.querySelector('.active') || {}).dataset?.g }; })(),
  mode: vizMode, group: document.body.dataset.group, side: document.documentElement.scrollWidth - innerWidth,
  canvas: Math.round((document.getElementById('engineCanvas').getBoundingClientRect().height) || 0),
}));

const want = { build: ['tabDesign', 'tabVehicle', 'tabParts', 'tabGarage'], test: ['tabEngine', 'tabDyno'], drive: ['tabTrack', 'tabRace', 'tabChamp', 'tabChallenges'], more: ['tabGuide', 'tabOptions'] };

// ---- desktop
let page = await open(1280, 800);
let s = await shown(page);
console.log('desktop:', s.all, 'of', s.dom, 'tabs in', s.rows, 'row(s); bar', s.bar.on ? 'shown' : 'hidden', s.group);
if (s.dom !== 12) fails.push(`desktop has ${s.dom} tab buttons, wanted 12`);
if (s.all !== 2 || s.rows !== 1 || s.tabs.join() !== want.test.join()) fails.push(`desktop shows ${s.tabs.join()} in ${s.rows} rows`);
if (!s.bar.on || s.bar.fixed || s.bar.n !== 4) fails.push('desktop section bar should sit in the page, with four buttons');
if (s.side > 1) fails.push(`desktop scrolls sideways by ${s.side}px`);
await page.close();

// ---- wide screen: the cutaway must not grow with the window
page = await open(1920, 1080);
s = await shown(page);
console.log('wide: canvas', s.canvas, 'px, sideways', s.side);
if (s.canvas > 560) fails.push(`wide screen canvas is ${s.canvas}px tall`);
if (s.bar.fixed) fails.push('wide screen pins the section bar');
if (s.side > 1) fails.push(`wide screen scrolls sideways by ${s.side}px`);
await page.close();

// ---- phone
page = await open(390, 844);
s = await shown(page);
console.log('phone:', s.tabs.join(' '), '| bar', JSON.stringify(s.bar));
if (!s.bar.on || !s.bar.fixed || s.bar.n !== 4) fails.push('phone: no bar of four sections fixed to the screen');
if (Math.abs(s.bar.bottom) > 1) fails.push(`phone: the bar is ${s.bar.bottom}px off the foot of the screen`);
if (s.rows !== 1) fails.push(`phone: tabs in ${s.rows} rows`);
for (const g of Object.keys(want)) {
  await page.click(`#vizGroups button[data-g="${g}"]`);
  await page.waitForTimeout(700);
  s = await shown(page);
  console.log(`  ${g}: ${s.tabs.join(' ')} -> ${s.mode}`);
  if (s.tabs.join() !== want[g].join()) fails.push(`${g} shows ${s.tabs.join()}`);
  if (s.bar.active !== g) fails.push(`${g} is not marked open on the bar`);
  if (s.side > 1) fails.push(`${g}: the page scrolls sideways by ${s.side}px`);
  const order = [...want[g].filter(id => id !== 'tabRace'), ...want[g].filter(id => id === 'tabRace')];
  for (const id of order) {                       // RACE last: it covers the page, and the next section click closes it
    await page.click('#' + id); await page.waitForTimeout(150);
    const m = await page.evaluate(() => vizMode);
    const exp = id === 'tabDesign' ? 'design' : id === 'tabEngine' ? 'engine' : id.slice(3).toLowerCase();
    if (m !== exp) fails.push(`${id} opened ${m}`);
  }
}
// a section opens on the tab last used in it
await page.evaluate(() => document.getElementById('tabTrack').click()); await page.waitForTimeout(200);
if (await page.evaluate(() => vizMode) !== 'track') fails.push('TRACK could not be opened while hidden');
await page.click('#vizGroups button[data-g="build"]'); await page.waitForTimeout(150);
s = await shown(page);
console.log('  back to build ->', s.mode);
if (s.mode !== 'garage') fails.push(`BUILD reopened on ${s.mode}, last used was garage`);
await page.close();

// ---- phone on its side
page = await open(844, 390);
s = await shown(page);
console.log('landscape:', s.tabs.join(' '), '| bar', JSON.stringify(s.bar), 'side', s.side);
if (!s.bar.fixed || Math.abs(s.bar.bottom) > 1) fails.push('landscape phone does not pin the section bar to the foot');
if (s.tabs.join() !== want.test.join()) fails.push('landscape phone shows ' + s.tabs.join());
if (s.side > 1) fails.push(`landscape phone scrolls sideways by ${s.side}px`);
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(200);
s = await shown(page);
if (s.side > 1) fails.push(`375px scrolls sideways by ${s.side}px`);
await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
