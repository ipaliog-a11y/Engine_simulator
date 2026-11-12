// The hotlap and the race use the oblique chase, not a flat map (build 270).
//
// WHY THIS EXISTS. The circuit has to read as the draft: the same metres ahead of the car take less
// screen than the same metres to the side, because the view is pitched, and the ground around the
// car is painted. The lap solver is not involved.
// What must hold:
//   · twenty metres to the side of the car lands further across the screen than twenty metres ahead;
//   · painting the chase puts grass in the frame and does not throw;
//   · painting leaves the canvas's own scale in place, and a pan slides the picture by that much on screen;
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
await page.waitForTimeout(400);
const R = await page.evaluate(() => {
  const src = buildTrack('tech');
  const look = sceneBind(src);
  let peak = look.pts[0];
  for (const p of look.pts) if (Math.abs(p.curv) > Math.abs(peak.curv)) peak = p;
  const car = { x: peak.x, y: peak.y, hd: peak.hd, curv: peak.curv, col: '#d81f32', brk: true, pos: 1 };
  const cam = sceneChase(car, 900, 600, 14, 0.70);
  const here = sceneProject(cam, car.x, car.y);
  const ahead = sceneProject(cam, car.x + Math.cos(car.hd) * 20, car.y + Math.sin(car.hd) * 20);
  const side = sceneProject(cam, car.x + Math.cos(car.hd + Math.PI / 2) * 20, car.y + Math.sin(car.hd + Math.PI / 2) * 20);
  const da = Math.hypot(ahead.sx - here.sx, ahead.sy - here.sy);
  const ds = Math.hypot(side.sx - here.sx, side.sy - here.sy);
  const c = document.createElement('canvas');
  c.width = 900; c.height = 600;
  const g = c.getContext('2d');
  sceneWeather('dry', 0);
  g.setTransform(2, 0, 0, 2, 0, 0);
  scenePaint(g, cam, { cars: [car] });
  const keep = g.getTransform().a;
  g.setTransform(1, 0, 0, 1, 0, 0);
  scenePan(cam, 30, -12);
  const slid = sceneProject(cam, car.x, car.y);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let grass = 0, dark = 0;
  for (let i = 0; i < d.length; i += 32) {
    const r = d[i], gv = d[i + 1], b = d[i + 2];
    if (gv > 60 && gv > r + 8 && gv > b - 10) grass++;
    if (r < 70 && gv < 75 && b < 80) dark++;
  }
  return { keep, slide: [slid.sx - here.sx, slid.sy - here.sy], da, ds, grass, dark, pitch: cam.pitch, n: look.pts.length };
});
await browser.close();
console.log(`pitch ${R.pitch}; 20 m ahead ${R.da.toFixed(1)} px, aside ${R.ds.toFixed(1)} px; grass ${R.grass}, dark ${R.dark}; ${R.n} pts`);
if (!(R.pitch < 0.95)) fails.push('the camera is not pitched');
if (!(R.ds > R.da * 1.15)) fails.push('ahead and aside cover the same screen, so the view is still flat');
if (R.keep !== 2) fails.push('painting the scene lost the canvas scale the page draws through');
if (Math.hypot(R.slide[0] - 30, R.slide[1] + 12) > 0.5) fails.push(`a pan of (30, -12) moved the picture by (${R.slide.map(v => v.toFixed(1))})`);
if (R.grass < 80) fails.push('the ground around the car did not paint');
if (errors.length) fails.push(errors.join('; '));
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
