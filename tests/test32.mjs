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
  return { k, label: T.label, half, wMin: +T.wMin.toFixed(1), wMax: +T.wMax.toFixed(1), wLabel: T.wLabel, off_track,
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
  if (g.wMax - g.wMin < 1) fails.push(`${g.label}: width does not actually vary`);
});

// 2. Optimised line beats the centreline on every circuit
console.log('\n== centreline vs optimised ==');
const ab = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const out = [];
  for (const k of Object.keys(TRACKS)) {
    const T = buildTrack(k);
    const saved = T.line.map(q => ({ ...q })), savedLen = T.line.length_;
    // optimised line, elevation zeroed
    let a0 = 0;
    T.line.forEach(q => { q.ds3 = q.ds; q.z = 0; q.grade = 0; q.sinT = 0; q.cosT = 1; q.kv = 0; q.s = a0; a0 += q.ds; });
    T.line.length_ = a0;
    const opt = simulateLap(k);
    T.line.forEach((q, i) => Object.assign(q, saved[i])); T.line.length_ = savedLen;
    // Compare line SHAPE only: flatten onto the centreline and zero the elevation on both sides,
    // so gradient can't confound the result (and keep ds3 consistent with ds).
    let acc = 0;
    T.line.forEach((q, i) => { q.x = T.pts[i].x; q.y = T.pts[i].y; q.off = 0; q.r = T.pts[i].r;
      q.ds = T.pts[i].ds; q.ds3 = T.pts[i].ds; q.z = 0; q.grade = 0; q.sinT = 0; q.cosT = 1; q.kv = 0;
      q.s = acc; acc += q.ds; });
    T.line.length_ = acc;
    const cen = simulateLap(k);
    T.line.forEach((q, i) => Object.assign(q, saved[i])); T.line.length_ = savedLen;
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

// 4. Determinism: line depends only on geometry, not on the car
const det = await page.evaluate(() => {
  const sig = () => buildTrack('mixed').line.map(q => q.off.toFixed(4)).join(',');
  const a = sig();
  const pr = PRESETS.find(x => x.name === '6.5 V12 NA Supercar');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('super'); buildVehicle(); simulateLap('mixed');
  return { same: a === sig() };
});
console.log('\nline independent of the car:', det.same);
if (!det.same) fails.push('racing line changed with the vehicle');

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
if (!(li.tech < hv.tech)) fails.push('light car no longer wins the technical circuit');
if (!(hv.fast < li.fast)) fails.push('powerful car no longer wins the fast circuit');

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
if (ui.cells !== 8) fails.push('lap grid broken');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
