// Challenges: an open road imported from the player's GPX file.
//
// WHY THIS EXISTS. IMPORT GPX ROAD turns a local GPX file into a road the economy run drives. What must hold:
//   · a sample trace (1 km north, a 100 m-radius right bend, east to 3 km; 5% climb with ±1 m GPS height jitter)
//     gives length 3 km ±2%, tightest radius 100 m ±20%, mean grade 5% ±0.5 pt and no grade past 10% (smoothed);
//   · the economy run solves on it and never exceeds the road's speed limit (90 km/h assumed; 50 when set);
//   · a trace with no elevation is flat and says so; a bad file is refused with a message and changes nothing;
//   · the road is kept under pes.userRoad and comes back, with its challenge, after a reload;
//   · the built-in roads carry no speed limit; no page errors; no horizontal scroll at phone width.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
// Sample GPX, built here: points every 15 m along the path.
function sampleGpx(ele) {
  const R = 6371000, rad = Math.PI / 180, lat0 = 45, lon0 = 7, pts = [];
  for (let s = 0; s <= 3000; s += 15) {
    let x, y;
    if (s <= 1000) { x = 0; y = s; }
    else if (s <= 1000 + 50 * Math.PI) { const a = (s - 1000) / 100; x = 100 - 100 * Math.cos(a); y = 1000 + 100 * Math.sin(a); }
    else { x = 100 + (s - 1000 - 50 * Math.PI); y = 1100; }
    const lat = lat0 + y / R / rad, lon = lon0 + x / (R * Math.cos(lat0 * rad)) / rad;
    const z = 200 + 0.05 * s + ((s / 15) % 2 ? 1 : -1);
    pts.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${ele ? `<ele>${z.toFixed(1)}</ele>` : ''}</trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1"><trk><name>Test Hill</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => { try { localStorage.removeItem('pes.userRoad'); } catch (e) {} setTab('challenges'); });
const status = () => page.evaluate(() => document.getElementById('status').textContent);
const file = (name, text) => page.setInputFiles('#roadGpxInput', { name, mimeType: 'application/gpx+xml', buffer: Buffer.from(text) });
// Bad file first: nothing imported.
await file('bad.gpx', '<gpx><trk></trk></gpx>');
await page.waitForTimeout(300);
const bad = { msg: await status(), none: await page.evaluate(() => !ROADS.user) };
await page.evaluate(() => loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Golf GTI (Mk7'))));
await file('hill.gpx', sampleGpx(true));
await page.waitForFunction(() => !!ROADS.user);
const run = () => page.evaluate(() => {
  const T = buildRoad('user'), p = T.pts, inner = p.slice(20, -20);
  const R = solveRunChallenge('economy-user');
  return { label: T.label, len: T.length, rMin: Math.min(...inner.map(q => q.r)), hasEle: ROADS.user.hasEle,
    grade: (p[p.length - 21].z - p[20].z) / (p[p.length - 21].s - p[20].s), gMax: Math.max(...inner.map(q => Math.abs(q.grade))),
    lim: ROADS.user.limitKmh, ok: R && R.ok, vTop: R && R.vTop, vMin: R && Math.max(...R.vMin) * 3.6, L: R && R.fuelL,
    active: activeRunChallenge, limShown: document.getElementById('chalRoadLimit').closest('.field').style.display !== 'none',
    builtIn: ['alpine', 'dragon'].map(k => buildRoad(k).vLimit) };
});
const a = await run(), msg = await status();
await page.fill('#chalRoadLimit', '50');
await page.dispatchEvent('#chalRoadLimit', 'change');
const b = await run();
await page.reload({ waitUntil: 'networkidle' });
const back = await page.evaluate(() => ({ has: !!ROADS.user, lim: ROADS.user && ROADS.user.limitKmh,
  chal: !!RUN_CHALLENGES.find(c => c.id === 'economy-user'),
  opt: Array.from(document.getElementById('chalSel').options).filter(o => o.value === 'economy-user').length }));
await file('flat.gpx', sampleGpx(false));
await page.waitForFunction(() => ROADS.user && !ROADS.user.hasEle);
const flat = await page.evaluate(() => { const p = buildRoad('user').pts; return { gMax: Math.max(...p.map(q => Math.abs(q.grade))), blurb: ROADS.user.blurb }; });
await page.evaluate(() => setTab('challenges'));
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(300);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
await browser.close();

console.log('bad:', bad.msg, '| import:', msg);
for (const [n, x] of [['90', a], ['50', b]]) console.log(`limit ${n}: ${x.label} ${(x.len / 1000).toFixed(3)} km rMin ${x.rMin.toFixed(1)} m grade ${(x.grade * 100).toFixed(2)}% max ${(x.gMax * 100).toFixed(1)}% | eco ${x.ok} top ${x.vTop && x.vTop.toFixed(1)} min-time top ${x.vMin && x.vMin.toFixed(1)} km/h ${x.L && x.L.toFixed(3)} L`);
console.log('reload', JSON.stringify(back), '| flat max grade', flat.gMax, '| scrollWidth@375', sw);
if (!/no track or route points/.test(bad.msg) || !bad.none) fails.push('bad file: ' + bad.msg);
if (Math.abs(a.len - 3000) > 60) fails.push('length ' + a.len);
if (!(a.rMin > 80 && a.rMin < 120)) fails.push('tightest radius ' + a.rMin);
if (Math.abs(a.grade - 0.05) > 0.005) fails.push('grade ' + a.grade);
if (!(a.gMax < 0.10)) fails.push('grade not smoothed ' + a.gMax);
if (a.label !== 'TEST HILL' || !a.hasEle || a.lim !== 90 || a.active !== 'economy-user' || !a.limShown) fails.push('import state ' + JSON.stringify(a));
for (const [lim, x] of [[90, a], [50, b]]) {
  if (!x.ok) fails.push('economy at ' + lim + ' did not solve');
  else if (x.vTop > lim + 0.5 || x.vMin > lim + 0.5) fails.push(`over the ${lim} km/h limit: ${x.vTop} / ${x.vMin}`);
}
if (!(b.vMin > 45)) fails.push('50 km/h limit not reached ' + b.vMin);
if (a.builtIn.some(v => v !== 0)) fails.push('built-in road has a limit ' + a.builtIn);
if (!back.has || back.lim !== 50 || !back.chal || back.opt !== 1) fails.push('reload ' + JSON.stringify(back));
if (flat.gMax !== 0 || !/no elevation/.test(flat.blurb)) fails.push('flat trace ' + JSON.stringify(flat));
if (sw > 375) fails.push('horizontal scroll at 375 px: ' + sw);
fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
