import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// 1. The line stays on the track, and actually uses the width
console.log('== line geometry ==');
// NB: the track width VARIES around the lap, so "on the track" is a per-point test against that
// point's own half-width, not against a single constant.
const geo = await page.evaluate(() => Object.keys(TRACKS).map(k => {
  const T = buildTrack(k), L = T.line, half = T.width / 2;
  const offs = L.map(q => q.off);
  const worst = Math.max(...offs.map(Math.abs));
  const off_track = L.filter((q, i) => Math.abs(q.off) > T.pts[i].hw + 1e-6).length;
  // sign changes = the line crossing the track, i.e. genuinely working the width
  let cross = 0; for (let i = 0; i < L.length; i++) { const a = offs[i], b = offs[(i + 1) % L.length]; if (a * b < 0 && Math.abs(a - b) > 0.5) cross++; }
  // A real circuit's width is measured, not authored: the Indianapolis oval really is one width.
  const constW = !!TRACKS[k].real && TRACKS[k].wprof.every(m => Math.abs(m - 1) < 0.02);
  return { k, label: T.label, constW, half, wMin: +T.wMin.toFixed(1), wMax: +T.wMax.toFixed(1), wLabel: T.wLabel, off_track,
    wAvg: +(T.pts.reduce((a, q) => a + q.w * q.ds, 0) / T.length).toFixed(2),
    worst: +worst.toFixed(2), avg: +(offs.reduce((a, b) => a + Math.abs(b), 0) / offs.length).toFixed(2), cross, len: Math.round(L.length_), cen: Math.round(T.length) };
}));
geo.forEach(g => console.log(`  ${g.label.padEnd(14)} ${g.wLabel} (avg ${g.wAvg}, nominal ${g.half * 2}) | max |off| ${g.worst}m | avg ${g.avg}m | crosses ${g.cross}x | off track ${g.off_track} pts | line ${g.len}m vs centre ${g.cen}m`));
geo.forEach(g => {
  if (g.off_track) fails.push(`${g.label}: line leaves the track at ${g.off_track} points`);
  if (g.avg < g.half * 0.25) fails.push(`${g.label}: line barely uses the width`);
  if (g.cross < 4) fails.push(`${g.label}: line does not cross the track (no out-in-out)`);
  // `width` is documented as the AVERAGE width — the profile is normalised so that stays true.
  if (Math.abs(g.wAvg - g.half * 2) > 0.15) fails.push(`${g.label}: quoted width ${g.half * 2}m is not the arc-length average (${g.wAvg}m)`);
  if (!g.constW && g.wMax - g.wMin < 1) fails.push(`${g.label}: width does not actually vary`);
});

// 2. Optimised line beats the centreline on every circuit
console.log('\n== centreline vs optimised ==');
const ab = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  // Compare line SHAPE only: the same car on its own racing line and on the centreline, elevation
  // zeroed on both (so gradient cannot confound it), each line's radius measured the same way.
  const flat = (pts, offs) => { const n = pts.length, L = pts.map((q, i) => ({ x: q.x, y: q.y, z: 0, off: offs ? offs[i] : 0, grade: 0, sinT: 0, cosT: 1, kv: 0 }));
    let s = 0;
    for (let i = 0; i < n; i++) { const q = L[(i + 1) % n]; L[i].ds = Math.hypot(q.x - L[i].x, q.y - L[i].y); L[i].ds3 = L[i].ds; L[i].s = s; s += L[i].ds; }
    for (let i = 0; i < n; i++) { const a = L[(i - 1 + n) % n], b = L[i], d = L[(i + 1) % n];
      const ab = Math.hypot(b.x - a.x, b.y - a.y), bd = Math.hypot(d.x - b.x, d.y - b.y), da = Math.hypot(a.x - d.x, a.y - d.y);
      const k = 4 * Math.abs((b.x - a.x) * (d.y - a.y) - (d.x - a.x) * (b.y - a.y)) / 2 / (ab * bd * da); b.r = k > 1e-5 ? 1 / k : 1e6; }
    L.length_ = s; return L; };
  const out = [];
  for (const k of Object.keys(TRACKS)) {
    const T = buildTrack(k), car = lineFor(T, k);
    const opt = simulateLap(k, { line: flat(car, car.map(q => q.off)) }), cen = simulateLap(k, { line: flat(T.pts) });
    out.push({ label: T.label, cen: +cen.lap.toFixed(2), opt: +opt.lap.toFixed(2), gain: +(cen.lap - opt.lap).toFixed(2), pct: +((cen.lap - opt.lap) / cen.lap * 100).toFixed(1), cAvg: Math.round(cen.avg), oAvg: Math.round(opt.avg) });
  }
  return out;
});
ab.forEach(x => console.log(`  ${x.label.padEnd(14)} ${x.cen}s → ${x.opt}s   gain ${x.gain}s (${x.pct}%)   avg ${x.cAvg}→${x.oAvg} km/h`));
ab.forEach(x => {
  if (x.opt >= x.cen) fails.push(`${x.label}: racing line is not faster than the centreline`);
  if (x.pct > 15) fails.push(`${x.label}: implausibly large gain (${x.pct}%)`);
  // NB: average speed is not a valid invariant here — the racing line is shorter than the
  // centreline, so at a similar lap time its average speed is arithmetically lower. Lap time is
  // the thing that must improve.

});

// 3. Causal check: on the SAME circuit, more width must be worth more time
console.log('\n== width sensitivity (Riverside, same car) ==');
const wid = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const out = [];
  for (const w of [6, 10, 14, 18]) {
    delete trackCache.mixed; TRACKS.mixed.width = w;
    out.push({ w, lap: +simulateLap('mixed').lap.toFixed(2) });
  }
  delete trackCache.mixed; TRACKS.mixed.width = 12;
  return out;
});
wid.forEach(x => console.log(`  ${String(x.w).padStart(2)}m wide: ${x.lap}s`));
for (let i = 1; i < wid.length; i++) if (wid[i].lap >= wid[i - 1].lap) fails.push(`width ${wid[i].w}m is not quicker than ${wid[i - 1].w}m`);

// 4. Determinism. The map's reference line (minimum curvature over the whole width) depends only on the
// circuit. Since build 115 the line each car DRIVES is its own minimum-time line: the same car must get
// the same line every time, and a very different car a different one.
const det = await page.evaluate(() => {
  const sig = L => L.map(q => q.off.toFixed(4)).join(',');
  const ref = sig(buildTrack('mixed').line);
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine(); applyChassisFit('coupe'); buildVehicle();
  const a1 = sig(simulateLap('mixed').track.line); delete buildTrack('mixed').lines; const a2 = sig(simulateLap('mixed').track.line);
  const pv = PRESETS.find(x => x.name === '6.5 V12 NA Supercar');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pv.engine)); buildEngine(); applyChassisFit('super'); buildVehicle();
  const b = sig(simulateLap('mixed').track.line);
  return { refSame: ref === sig(buildTrack('mixed').line), carSame: a1 === a2, carsDiffer: a1 !== b };
});
console.log(`\nreference line independent of the car: ${det.refSame} · same car, same line: ${det.carSame} · another car, another line: ${det.carsDiffer}`);
if (!det.refSame) fails.push('the reference line changed with the vehicle');
if (!det.carSame) fails.push('the same car got a different racing line');
if (!det.carsDiffer) fails.push('a very different car drives the same line');

// 5. Circuit character still holds after the change
const ch = await page.evaluate(() => {
  const o = {};
  for (const [nm, chas] of [['2.0 ITB NA Screamer I4', 'roadster'], ['6.2 Supercharged V8', 'muscle']]) {
    const pr = PRESETS.find(x => x.name === nm);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit(chas); buildVehicle();
    o[nm] = { tech: +simulateLap('tech').lap.toFixed(2), fast: +simulateLap('fast').lap.toFixed(2) };
  }
  return o;
});
const li = ch['2.0 ITB NA Screamer I4'], hv = ch['6.2 Supercharged V8'];
console.log(`\ncharacter: light ${li.tech}s/${li.fast}s  heavy ${hv.tech}s/${hv.fast}s`);
// relative since build 109, and the outright "light car wins the technical circuit" dropped in build 114:
// see test30
if (!((hv.fast - li.fast) < (hv.tech - li.tech) - 0.5)) fails.push('the fast circuit no longer favours the powerful car more than the technical one does');

// 6. Spool still loses on a lap (the diff trade must survive the new line)
const sp = await page.evaluate(() => ['clsd', 'spool'].map(d => {
  const pr = PRESETS.find(x => x.name === '6.2 Supercharged V8');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('muscle'); document.getElementById('vhDiff').value = d; buildVehicle();
  return { d, t100: +perf.t100.toFixed(2), lap: +simulateLap('tech').lap.toFixed(2) };
}));
console.log('diff trade:', sp.map(x => `${x.d} 0-100 ${x.t100}s lap ${x.lap}s`).join(' | '));
if (!(sp[1].t100 < sp[0].t100)) fails.push('spool no longer wins the standing start');
if (!(sp[1].lap > sp[0].lap)) fails.push('spool no longer loses on a lap');

// 7. UI still renders
await page.click('#tabTrack'); await page.waitForTimeout(400);
const ui = await page.evaluate(() => ({ head: document.getElementById('lapHead').textContent, cells: document.querySelectorAll('#lapGrid .perf-cell').length }));
console.log('\nUI:', ui.head.trim(), '|', ui.cells, 'cells');
if (ui.cells !== 10) fails.push('lap grid broken');   // 8 + balance (build 157) + brake temperature

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
