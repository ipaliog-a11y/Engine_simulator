// The ECU laptop on the bench (LIVE and DYNO).
//
// WHY THIS EXISTS. The fuel, spark and VE tables lived only on the ENGINE tab, and a fault's freeze
// frame could not be put back on the brake. What must hold:
//   · on LIVE the laptop is on the page and its scope draws a trace;
//   · the live cell is marked, and HOLD CELL sets the brake from that cell's rpm;
//   · REPRODUCE FREEZE FRAME puts the stored coolant on the bench slider;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; setTab('engine'); });
await page.waitForTimeout(600);
const fails = [];

const scope = await page.evaluate(() => {
  const c = document.getElementById('ecuScope'), g = c.getContext('2d'), pix = g.getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < pix.length; i += 16) if (pix[i] > 20 || pix[i + 1] > 40) ink++;
  return { shown: !document.getElementById('ecuComputer').hidden, ink };
});
console.log('scope', scope);
if (!scope.shown) fails.push('the laptop is hidden on LIVE');
if (scope.ink < 8) fails.push('the scope has no trace');

await page.evaluate(() => {
  document.getElementById('edAfrMode').value = 'auto';
  document.getElementById('edAfrMode').dispatchEvent(new Event('change'));
  buildEngine();
  ecuScreen('maps');
});
await page.waitForTimeout(300);
const hold = await page.evaluate(() => {
  const cell = document.querySelector('#fuelMapBox td.fm-cell');
  if (!cell) return { noCell: true };
  cell.click();
  document.getElementById('ecuHold').click();
  const rpm = fmRpmAt(fmSel.c);
  const want = Math.round(loadForRpm(Math.min(rpm, 0.99 * engine.redline)) * 100);
  return { live: !!document.querySelector('#fuelMapBox td.live'), load: +document.getElementById('load').value, want, rpm };
});
console.log('hold', hold);
if (hold.noCell) fails.push('no fuel cell to select');
else {
  if (!hold.live) fails.push('no live cell on the fuel map');
  if (Math.abs(hold.load - hold.want) > 1) fails.push(`HOLD CELL set load ${hold.load}, wanted ${hold.want}`);
}

const ff = await page.evaluate(() => {
  obd.codes.P0217 = { status: 'confirmed', clean: 0, newCycle: false, ff: { rpm: 3200, load: 40, map: 1.1, coolant: 112, lam: 1, boost: 0, volt: 13.4 } };
  ecuScreen('diag');
  document.querySelector('[data-ff="P0217"]').click();
  return +document.getElementById('coolant').value;
});
console.log('freeze coolant', ff);
if (ff !== 112) fails.push('freeze frame did not set the coolant to 112');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
