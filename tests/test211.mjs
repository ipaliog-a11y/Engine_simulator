// Challenges: pace select and route hover (build 344).
//
// WHY THIS EXISTS. Build 344 adds a 125/150/200% pace control and a route
// hover tab (speed + incline). What must hold:
//   · #chalPace lists 1.25, 1.5 and 2; default 1.25 matches prior solves;
//   · raising pace lengthens the target (MX-5 Alpine 200% > 125%);
//   · chalHoverAt on the start point returns speed and a finite grade %.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const sel = document.getElementById('chalPace');
  const opts = sel ? Array.from(sel.options).map(o => +o.value) : [];
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  chalPaceFactor = 1.25;
  const a = simulateEconomyChallenge('alpine', 1.25);
  const b = simulateEconomyChallenge('alpine', 2);
  setTab('challenges');
  chalPaceFactor = 1.25;
  refreshChallenge();
  const R = chalResult;
  const map = R && R.road ? chalMapProject(R) : null;
  const start = map ? { x: map.MX(map.p[0]), y: map.MY(map.p[0]) } : null;
  const hi = start ? chalHoverAt(start.x, start.y, 20) : -1;
  const info = chalHoverInfo(hi);
  return {
    opts,
    selVal: sel ? +sel.value : null,
    a: a && a.ok ? { target: a.target, tMin: a.tMin, factor: a.factor } : null,
    b: b && b.ok ? { target: b.target, factor: b.factor } : null,
    hi,
    info
  };
});

console.log(JSON.stringify(r, null, 2));
if (!(r.opts.length === 3 && r.opts[0] === 1.25 && r.opts[1] === 1.5 && r.opts[2] === 2))
  fails.push('chalPace options: ' + JSON.stringify(r.opts));
if (r.selVal !== 1.25) fails.push('default pace ' + r.selVal);
if (!r.a) fails.push('125% solve failed');
else if (!(Math.abs(r.a.factor - 1.25) < 1e-9)) fails.push('125% factor ' + r.a.factor);
else if (!(Math.abs(r.a.target - r.a.tMin * 1.25) < 0.05)) fails.push('125% target not 1.25× min');
if (!r.b) fails.push('200% solve failed');
else if (!(r.b.target > r.a.target * 1.4)) fails.push('200% target should be much longer than 125%');
if (!(r.hi === 0)) fails.push('hover miss at start: ' + r.hi);
if (!r.info || !(r.info.vKmh > 0 && r.info.vKmh < 5)) fails.push('start speed odd: ' + (r.info && r.info.vKmh));
if (!r.info || !isFinite(r.info.gradePct)) fails.push('grade missing');

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
