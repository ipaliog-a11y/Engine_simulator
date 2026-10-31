// Draws each car in profiles.json twice, with the current sprite code (src/js/sprites.js, through
// index.html): on the left with its chassis archetype's shape, which is what the game draws now,
// and on the right with its own profile. Writes compare.png beside this file.
//
//   node research/vehicle-sprites/render.mjs
//
// Research only. The override is applied by swapping the archetype's CAR_LOOK entry for one draw,
// so nothing in src/ changes.
import { chromium } from '../../tests/pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const data = JSON.parse(readFileSync(path.join(here, 'profiles.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const out = await page.evaluate(cars => {
  const S = 3, rowH = CAR_GH + 10, pad = 6;
  const cv = document.createElement('canvas');
  cv.width = (CAR_GW * 2 + pad * 3) * S; cv.height = (rowH * cars.length + 14) * S;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#0a0a10'; g.fillRect(0, 0, cv.width, cv.height);
  g.font = (4 * S) + 'px monospace'; g.fillStyle = '#ffcc00';
  g.fillText('NOW: the chassis archetype', pad * S, 9 * S);
  g.fillText('PROPOSED: the car\'s own profile', (CAR_GW + pad * 2) * S, 9 * S);
  const missing = [];
  cars.forEach((c, i) => {
    const p = VEHICLE_PRESETS.find(q => q.name === c.name);
    if (!p) { missing.push(c.name); return; }
    const v = vehicleFromPreset(p), wb = v.body.wb, base = CAR_LOOK[v.chassis];
    const s = c.spec, ovF = s.ovF_mm / 1000 / wb, ovR = (s.len_mm / 1000 - wb - s.ovF_mm / 1000) / wb;
    const own = Object.assign({}, base, c.look, { h: s.h_mm / 1000, ovF, ovR });
    const y = (14 + i * rowH) * S;
    [base, own].forEach((look, j) => {
      CAR_LOOK[v.chassis] = look;
      const buf = new PixBuf(CAR_GW, CAR_GH);
      drawCarSprite(buf, v, null, 0);
      CAR_LOOK[v.chassis] = base;
      const x = (pad + j * (CAR_GW + pad)) * S;
      g.fillStyle = '#26263a'; g.fillRect(x, y + CAR_GY * S, CAR_GW * S, S);
      g.drawImage(buf.canvas(), x, y, CAR_GW * S, CAR_GH * S);
    });
    g.fillStyle = '#00ccff';
    g.fillText(c.name + '  [' + v.chassis + ']', pad * S, y + (CAR_GH + 6) * S);
  });
  return { png: cv.toDataURL('image/png'), missing };
}, data.cars);

await browser.close();
if (out.missing.length) console.error('Not in VEHICLE_PRESETS: ' + out.missing.join(', '));
if (errors.length) console.error(errors.join('\n'));
const file = path.join(here, 'compare.png');
writeFileSync(file, Buffer.from(out.png.split(',')[1], 'base64'));
console.log('wrote ' + path.relative(repo, file));
process.exit(out.missing.length || errors.length ? 1 : 0);
