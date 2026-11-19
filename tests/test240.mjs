// Workshop bays follow the open card.
//
// WHY THIS EXISTS. The engine preview was a dot grid, the same in every section. What must hold:
//   · BUILD shows the workshop, TEST the garage and DRIVE the pit;
//   · switching an engine card changes the bay key and the preview is not empty;
//   · the vehicle BAY draws a car, and a phone width does too;
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
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; });
await page.waitForTimeout(300);

const room = async () => page.evaluate(() => getComputedStyle(document.getElementById('modeRoom')).backgroundImage);
await page.evaluate(() => setTab('design'));
const buildRoom = await room();
await page.evaluate(() => setTab('engine'));
const testRoom = await room();
await page.evaluate(() => setTab('track'));
const driveRoom = await room();
console.log(buildRoom, testRoom, driveRoom);
if (!/workshop-pickup/.test(buildRoom)) fails.push('BUILD has no workshop');
if (!/garage-f355/.test(testRoom)) fails.push('TEST has no garage');
if (!/pit-f355/.test(driveRoom)) fails.push('DRIVE has no pit');

await page.evaluate(() => setTab('design'));
await page.waitForTimeout(250);
await page.click('#icdRb-head');
await page.waitForTimeout(250);
const head = await page.evaluate(() => {
  const cv = document.getElementById('enginePreview');
  const pix = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let ink = 0; for (let i = 0; i < pix.length; i += 16) if (pix[i] + pix[i + 1] + pix[i + 2] > 30) ink++;
  return { bay: cv.dataset.bay, ink };
});
console.log('head bay', head);
if (head.bay !== 'ice:head') fails.push('head card bay is ' + head.bay);
if (head.ink < 20) fails.push('engine preview is empty');
await page.click('#icdRb-air');
await page.waitForTimeout(200);
const air = await page.evaluate(() => document.getElementById('enginePreview').dataset.bay);
if (air !== 'ice:air') fails.push('air card bay is ' + air);

await page.evaluate(() => setTab('vehicle'));
await page.click('#btnVhBay');
await page.waitForTimeout(250);
const car = await page.evaluate(() => document.getElementById('vhBay').dataset.bay);
console.log('car bay', car);
if (!/^car:/.test(car || '')) fails.push('vehicle bay is ' + car);

await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(300);
const phone = await page.evaluate(() => {
  const cv = document.getElementById('enginePreview');
  return { bay: cv.dataset.bay, w: cv.width };
});
await page.evaluate(() => setTab('design'));
await page.waitForTimeout(300);
const phoneBay = await page.evaluate(() => document.getElementById('enginePreview').dataset.bay);
console.log('phone', phoneBay);
if (!phoneBay) fails.push('phone preview has no bay');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
