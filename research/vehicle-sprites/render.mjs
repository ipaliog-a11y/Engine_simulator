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

// The rules in README.md, "The format of one profile". Wheelbase-dependent checks run in the page.
const bad = [];
for (const c of data.cars) {
  const s = c.spec || {}, l = c.look || {}, say = m => bad.push(c.name + ': ' + m);
  for (const k of ['len_mm', 'h_mm', 'ovF_mm']) if (!Number.isInteger(s[k]) || s[k] <= 0) say('spec.' + k + ' must be a positive whole number of mm');
  for (const k of ['nose', 'hood', 'deck', 'tail']) if (k in l && !(l[k] >= 0.1 && l[k] <= 0.9)) say('look.' + k + ' must be 0.1-0.9');
  if ('h' in l || 'ovF' in l || 'ovR' in l || 'col' in l) say('look must not set h, ovF, ovR or col');
  const u = ['bk', 'rr', 'rf', 'ws'].map(k => l[k]);
  if (u.some(x => typeof x !== 'number') || !(u[0] >= 0.04 && u[0] < u[1] && u[1] < u[2] && u[2] < u[3] && u[3] <= 0.93))
    say('look needs 0.04 <= bk < rr < rf < ws <= 0.93');
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

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
    const p = FACTORY_CARS.find(q => q.name === c.name);
    if (!p) { missing.push(c.name); return; }
    const v = vehicleFromPreset(p), wb = v.body.wb, base = CAR_LOOK[v.chassis];
    const s = c.spec, ovF = s.ovF_mm / 1000 / wb, ovR = (s.len_mm / 1000 - wb - s.ovF_mm / 1000) / wb;
    if (ovR <= 0) missing.push(c.name + ' (front overhang leaves no rear overhang at wb ' + wb + ')');
    if (s.len_mm / 1000 * CAR_PXM > CAR_GW - 4 || s.h_mm / 1000 * CAR_PXM > CAR_GY - 2) missing.push(c.name + ' (too big for the ' + CAR_GW + 'x' + CAR_GH + ' grid)');
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
if (out.missing.length) console.error('Not drawn correctly: ' + out.missing.join(', '));
if (errors.length) console.error(errors.join('\n'));
const file = path.join(here, 'compare.png');
writeFileSync(file, Buffer.from(out.png.split(',')[1], 'base64'));
console.log('wrote ' + path.relative(repo, file));
process.exit(out.missing.length || errors.length ? 1 : 0);
