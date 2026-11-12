// The top-down circuit is a place, not a flat ribbon (build 266).
//
// WHY THIS EXISTS. TRACK and RACE drew the circuit as one dark stroke. The map should show the ground
// around it, the corner runoff and the rail, without moving the lap.
// What must hold:
//   · drawing Ashdown paints grass, tarmac and a kerb, and does not throw;
//   · the same draw leaves the car sprite able to paint;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(200);
const R = await page.evaluate(() => {
  const T = buildTrack('tech');
  const c = document.createElement('canvas');
  c.width = 720; c.height = 520;
  const g = c.getContext('2d');
  const sc = 0.72;
  const px = q => 30 + (q.x - T.minX) * sc;
  const py = q => 30 + (q.y - T.minY) * sc;
  drawTrackScene(g, T, px, py, sc);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let grass = 0, tar = 0, kerb = 0, rail = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], gv = d[i + 1], b = d[i + 2];
    if (gv > 70 && gv > r + 12 && gv > b) grass++;
    if (r < 48 && gv < 52 && b < 60 && r > 8) tar++;
    if (r > 160 && gv < 90 && b < 90) kerb++;
    if (r > 160 && gv > 160 && b > 165 && Math.abs(r - b) < 20) rail++;
  }
  drawTopCar(g, 80, 80, 0.4, '#d81f32', 'thr');
  return { grass, tar, kerb, rail, n: T.pts.length, nx: T.pts[0].nx != null, kerbs: !!T.kerbs };
});
await browser.close();
console.log(`ashdown ${R.n} pts, normals ${R.nx}, kerbs ${R.kerbs}; grass ${R.grass}, tarmac ${R.tar}, kerb ${R.kerb}, rail ${R.rail}`);
if (!R.nx || !R.kerbs) fails.push('the built circuit has no normals or kerbs to draw from');
if (R.grass < 200) fails.push('the ground around the circuit did not paint');
if (R.tar < 30) fails.push('the tarmac did not paint');
if (R.kerb < 5) fails.push('the corner kerb did not paint');
if (errors.length) fails.push(errors.join('; '));
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
