// The title screen (draft).
//
// Opening the app is a menu: build an engine, build a vehicle, open the wiki, settings. The workshop
// behind it is drawn, and each choice lands on the tab it names. The suite drives the bench, so the
// menu stays down unless the page is asked for it (?title=1). MENU brings it back; Escape leaves it.
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
await page.waitForTimeout(250);

const open = () => page.evaluate(() => !document.getElementById('titleScreen').hidden);
const mode = () => page.evaluate(() => vizMode);
if (!await open()) fails.push('title screen did not open on ?title=1');
const labels = await page.$$eval('#titleScreen .title-menu button', bs => bs.map(b => b.textContent.trim()));
const want = ['BUILD AN ENGINE', 'BUILD A VEHICLE', 'OPEN WIKI', 'SETTINGS'];
if (labels.join('|') !== want.join('|')) fails.push('menu labels: ' + labels.join(' | '));
// since build 229 the room is a picture (an <img>), not a canvas: it must be loaded and cover the stage
await page.waitForFunction(() => { const i = document.getElementById('titleImg'); return i && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
const painted = await page.evaluate(() => {
  const i = document.getElementById('titleImg'), r = i.getBoundingClientRect(), s = i.parentElement.getBoundingClientRect();
  return { shown: !i.hidden, w: i.naturalWidth, covers: r.left <= s.left + 1 && r.right >= s.right - 1 && r.top <= s.top + 1 && r.bottom >= s.bottom - 1 };
});
console.log('workshop picture', painted.w + ' px wide, shown ' + painted.shown + ', covers the stage ' + painted.covers);
if (!painted.shown || painted.w < 50 || !painted.covers) fails.push('workshop was not drawn');

await page.click('#titleScreen .title-menu button[data-go="vehicle"]');
await page.waitForTimeout(150);
if (await open()) fails.push('menu stayed up after BUILD A VEHICLE');
if (await mode() !== 'vehicle') fails.push('BUILD A VEHICLE did not open the vehicle tab (' + await mode() + ')');

await page.click('#btnMenu');
await page.waitForTimeout(150);
if (!await open()) fails.push('MENU did not bring the title screen back');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
if (await open()) fails.push('Enter left the menu up');
if (await mode() !== 'guide') fails.push('third item should be the wiki, got ' + await mode());

await page.click('#btnMenu');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
if (await open()) fails.push('Escape did not leave the menu');
if (await mode() !== 'guide') fails.push('Escape changed the tab');

const gk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await gk.addInitScript(() => { try { localStorage.setItem('pes.lang', 'el'); } catch (e) {} });
await gk.goto(url, { waitUntil: 'networkidle' });
await gk.waitForTimeout(200);
const greek = await gk.$$eval('#titleScreen .title-menu button, #btnMenu', bs => bs.map(b => b.textContent.trim()));
const greekWant = ['ΦΤΙΑΞΕ ΚΙΝΗΤΗΡΑ', 'ΦΤΙΑΞΕ ΟΧΗΜΑ', 'ΑΝΟΙΞΕ ΟΔΗΓΟ', 'ΡΥΘΜΙΣΕΙΣ', 'ΜΕΝΟΥ'];
if (greek.join('|') !== greekWant.join('|')) fails.push('Greek menu: ' + greek.join(' | '));
await gk.close();

const plain = await browser.newPage();
await plain.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await plain.waitForTimeout(200);
const hidden = await plain.evaluate(() => document.getElementById('titleScreen').hidden && navigator.webdriver);
if (!hidden) fails.push('the menu opened under the test runner');

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
