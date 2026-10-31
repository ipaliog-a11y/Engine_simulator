// The G-G diagram (build 200).
//
// WHY THIS EXISTS. The lap time is one number that hides how the car gets it: how hard it corners, brakes and drives,
// and how speed changes each. The G-G DIAGRAM window draws the car's envelope at three road speeds from the lap's own
// solvers (simulateLapRun's probe: the cornering ceiling, brakeFrom, accFrom), with every point of a lap over it. What
// must hold:
//   · it is the lap's physics: the lap run on a levelled copy of a circuit's racing line (the same line with its slope
//     and its crests and dips taken out, which the envelope assumes) never corners past the envelope at the speed it
//     is doing at any point, nor brakes or drives past it straight ahead, and at its limit it reaches it;
//   · the shapes are the physics: no downforce, the same cornering limit at every speed; downforce, a wider one the
//     faster; a power-limited car drives less hard the faster; the braking and the drive fall as the cornering grows;
//   · opening it changes nothing: the lap is bit-identical before and after;
//   · the window: opens from the VEHICLE tab, draws, reads three speeds and the lap, leaves out a speed past the top
//     speed, works on an electric car, reads in Greek, closes on Escape.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const load = n => { loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(n))); setTab('vehicle'); };
  const env = () => { const P = ggProbe(); return GG_SPEEDS.map(v => ggEnvelope(v, P)); };
  const o = {};
  // 1. the lap's physics: the M3 round two circuits' racing lines, levelled
  load('BMW M3 (E46');
  o.flat = [];
  for (const key of ['mixed', 'tech']) {
    trackKey = key;
    const p0 = simulateLapRun(key, {}).track.line;
    const line = Object.assign(p0.map(q => Object.assign({}, q, { cosT: 1, sinT: 0, kv: 0, grade: 0 })), { length_: p0.length_ });
    const L = simulateLapRun(key, { line }), P = ggProbe();
    let n = 0, over = 0, worst = 0, overB = 0;
    for (let i = 0; i < line.length; i++) {
      const lat = Math.abs(L.replay.gLat[i]), e = ggEnvelope(L.v[i] * 3.6, P); if (!e) continue;
      // straight ahead, the braking may not pass the envelope's (5%: the lap's braking also has the engine's)
      if (lat < 0.05 && -L.replay.gLong[i] > e.pts[0].brake * 1.05) overB++;
      if (lat < 0.3) continue;
      n++; const x = lat / e.ayMax; worst = Math.max(worst, x); if (x > 1.005) over++;
    }
    o.flat.push({ key, n, over, worst, overB });
  }
  trackKey = 'mixed';
  // 2. the shapes
  o.m3 = env().map(e => e && { vk: e.vk, ay: e.ayMax, acc: e.pts.map(p => p.acc), brake: e.pts.map(p => p.brake), kind: e.pts[0].kind });
  o.m3clA = vehicle.clA;
  load('Radical'); o.wing = env().map(e => e && e.ayMax); o.wingClA = vehicle.clA;
  // 3. nothing moves: the lap before and after opening the window
  load('Golf GTI (Mk7');
  const json = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  const before = json(simulateLap('mixed'));
  openGGWin(); closeGGWin();
  o.same = before === json(simulateLap('mixed'));
  // 4. the window
  load('BMW M3 (E46');
  document.getElementById('btnGG').click();
  const c = document.getElementById('ggCanvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
  o.win = { open: !document.getElementById('ggWin').hidden, lit, rows: document.querySelectorAll('#ggRead .gg-row').length,
    read: document.getElementById('ggRead').innerText };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  o.win.closed = document.getElementById('ggWin').hidden;
  load('Trabant'); openGGWin(); o.slow = { top: perf.topSpeed, speeds: gg.env.map(e => e.vk) }; closeGGWin();
  load('Model 3'); openGGWin(); o.ev = { speeds: gg.env.map(e => e.vk), ay: gg.env.map(e => e.ayMax), lap: !!gg.lap }; closeGGWin();
  load('BMW M3 (E46'); applyLang('el'); openGGWin();
  o.el = { title: document.getElementById('ggTitle').textContent, btn: document.getElementById('btnGG').textContent, read: document.getElementById('ggRead').innerText.slice(0, 80) };
  closeGGWin(); applyLang('en');
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
console.log('== the lap\'s physics: the M3 round levelled racing lines, against its envelope at each point\'s speed ==');
for (const x of r.flat) {
  console.log(`  ${x.key.padEnd(6)} ${x.n} cornering points, ${x.over} past it, the most ${f(x.worst * 100, 1)}% of it; ${x.overB} braking past it straight ahead`);
  if (x.n < 20) fails.push(`${x.key}: too few flat cornering points to check (${x.n})`);
  if (x.over) fails.push(`${x.key}: ${x.over} points of the levelled lap corner past the envelope (the most ${f(x.worst * 100, 1)}%)`);
  if (x.overB) fails.push(`${x.key}: ${x.overB} points of the levelled lap brake past the envelope straight ahead`);
  if (!(x.worst > 0.97)) fails.push(`${x.key}: the lap never comes near its envelope (${f(x.worst * 100, 1)}%): it is not the lap's`);
}
console.log('\n== the shapes ==');
const m3 = r.m3.filter(Boolean);
for (const e of m3) console.log(`  M3 ${e.vk} km/h: sideways ${f(e.ay)} g, braking ${f(e.brake[0])} g, drive ${f(e.acc[0])} g (${e.kind})`);
console.log(`  Radical SR3 (ClA ${f(r.wingClA)} m2): sideways ${r.wing.map(x => x && f(x)).join(' / ')} g at ${'60 / 120 / 180'} km/h`);
if (r.m3clA !== 0) fails.push('the M3 has downforce: the no-downforce check needs a car without');
if (m3.length !== 3 || Math.max(...m3.map(e => e.ay)) / Math.min(...m3.map(e => e.ay)) > 1.01) fails.push('with no downforce the cornering limit moves with the speed');
if (!(r.wing[2] > r.wing[1] && r.wing[1] > r.wing[0])) fails.push('with downforce the cornering limit does not grow with the speed');
if (!(m3[0].acc[0] > m3[1].acc[0] && m3[1].acc[0] > m3[2].acc[0])) fails.push('the drive does not fall with the speed');
for (const e of m3) {
  if (e.acc.some((a, i) => i && a > e.acc[i - 1] + 1e-3)) fails.push(`${e.vk} km/h: the drive grows as the cornering does`);
  if (e.brake.some((a, i) => i && a > e.brake[i - 1] + 1e-3)) fails.push(`${e.vk} km/h: the braking grows as the cornering does`);
  if (!(e.acc[e.acc.length - 1] < 0.1)) fails.push(`${e.vk} km/h: at the cornering limit the car still drives at ${f(e.acc[e.acc.length - 1])} g`);
}
if (!r.same) fails.push('opening the G-G window changed the lap');
console.log(`\n== the window: open ${r.win.open}, ${r.win.lit} pixels drawn, ${r.win.rows} rows, closed on Escape ${r.win.closed} ==`);
console.log('  ' + r.win.read.replace(/\n/g, '\n  '));
console.log(`  Trabant (top ${f(r.slow.top, 0)} km/h): ${r.slow.speeds.join(', ')} km/h; Model 3: ${r.ev.speeds.join(', ')} km/h, sideways ${r.ev.ay.map(x => f(x)).join(' / ')} g, lap ${r.ev.lap}`);
console.log(`  Greek: ${r.el.title} · ${r.el.btn} · ${r.el.read}`);
if (!r.win.open || !r.win.closed) fails.push('the window does not open from its button or close on Escape');
if (r.win.lit < 5000) fails.push('the diagram is not drawn');
if (r.win.rows !== 4) fails.push(`the readout has ${r.win.rows} rows, not three speeds and the lap`);
if (r.slow.speeds.some(v => v > r.slow.top)) fails.push('a speed past the top speed is drawn');
if (r.ev.speeds.length !== 3 || !r.ev.lap || r.ev.ay.some(x => !(x > 0.5))) fails.push('the window does not work on an electric car');
if (!/G-G/.test(r.el.title) || /DIAGRAM/.test(r.el.title) || /DIAGRAM/.test(r.el.btn) || /sideways|braking/.test(r.el.read)) fails.push('the window is not in Greek');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the G-G diagram is the lap\'s own physics, changes nothing, and reads in both languages.');
process.exit(fails.length || errors.length ? 1 : 0);
