// Evolution film: eight animated scenes, not a slideshow.
//
// WHY THIS EXISTS
// · film.html registers eight scenes, in year order, each a few seconds;
// · seeking from the start of the first scene to the start of the second changes the picture;
// · seeking inside the first scene also changes it, so the scene itself is moving;
// · the page throws nothing.
import { createHash } from 'crypto';
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'film.html')).href;
const fails = [], errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.FILM && FILM.ready, null, { timeout: 8000 });

const info = await page.evaluate(() => ({
  n: FILM.scenes.length,
  years: FILM.scenes.map(s => s.year),
  ids: FILM.scenes.map(s => s.id),
  ms: FILM.scenes.map(s => s.ms),
  shutter: FILM.shutter,
  duration: FILM.duration
}));
const years = ['1961', '1968', '1974', '1986', '1993', '2004', '2016', '2020'];
const ids = ['office', 'coast', 'night', 'shop', 'dyno', 'tunnel', 'bay', 'pit'];
if (info.n !== 8) fails.push('scene count ' + info.n);
if (info.years.join() !== years.join()) fails.push('years ' + info.years.join());
if (info.ids.join() !== ids.join()) fails.push('ids ' + info.ids.join());
if (info.ms.some(m => m < 3000 || m > 5000)) fails.push('a scene is outside 3–5s: ' + info.ms.join());
if (!(info.duration > 30000 && info.duration < 40000)) fails.push('duration ' + info.duration);

// Plates drawn from file:// taint the canvas, so the pixels are read from a screenshot.
const sample = async (ms) => {
  await page.evaluate(t => FILM.seek(t), ms);
  const buf = await page.locator('#film').screenshot();
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
};

const a = await sample(0);
const mid = await sample(2200);
const b = await sample(info.ms[0] + info.shutter);
console.log('pixels', a, mid, b);
if (a === mid) fails.push('scene 1 did not move between 0 and 2200 ms');
if (a === b) fails.push('scene 2 looks identical to the start of scene 1');
if (mid === b) fails.push('the cut did not change the picture');

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
