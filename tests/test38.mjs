import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];

// ---------------------------------------------------------------- 1. variable track width
console.log('== track width varies, and `width` still means the average ==');
const TRACK_DERIVED = await page.evaluate(() => Object.keys(TRACKS).filter(k => TRACKS[k].wvar));
const w = await page.evaluate(() => Object.keys(TRACKS).map(k => {
  const T = buildTrack(k);
  // arc-length weighted average, which is what "average width" has to mean on a closed lap
  const avg = T.pts.reduce((a, q) => a + q.w * q.ds, 0) / T.length;
  // is the width actually correlated with the layout, or just noise? compare the widest
  // fifth of the lap with the narrowest fifth by radius.
  const by = T.pts.slice().sort((a, b) => a.r - b.r);
  const q = Math.floor(by.length / 5);
  const tightW = by.slice(0, q).reduce((a, p) => a + p.w, 0) / q;
  const openW = by.slice(-q).reduce((a, p) => a + p.w, 0) / q;
  // A real circuit's width is measured, not authored: the Indianapolis oval really is one width.
  const constW = !!TRACKS[k].real && TRACKS[k].wprof.every(m => Math.abs(m - 1) < 0.02);
  return { k, label: T.label, constW, nominal: T.width, avg: +avg.toFixed(2), min: +T.wMin.toFixed(1), max: +T.wMax.toFixed(1),
    label_: T.wLabel, tightW: +tightW.toFixed(1), openW: +openW.toFixed(1),
    offTrack: T.line.filter((p, i) => Math.abs(p.off) > T.pts[i].hw + 1e-6).length };
}));
w.forEach(x => console.log(`  ${x.label.padEnd(14)} ${x.label_.padEnd(9)} nominal ${x.nominal} m, measured avg ${x.avg} m | tightest fifth ${x.tightW} m vs most open fifth ${x.openW} m | off track ${x.offTrack} pts`));
w.forEach(x => {
  if (Math.abs(x.avg - x.nominal) > 0.15) fails.push(`${x.label}: quoted ${x.nominal} m is not the average (${x.avg} m)`);
  if (!x.constW && x.max - x.min < 1.5) fails.push(`${x.label}: width barely varies (${x.min}–${x.max} m)`);
  if (x.offTrack) fails.push(`${x.label}: racing line leaves the track at ${x.offTrack} points`);
  if (!x.constW && !/–/.test(x.label_)) fails.push(`${x.label}: readout does not show a width range`);
  // Narrow where it is tight, wide where it is open — that is the whole claim.
  // Only the DERIVED profiles claim to follow the layout. The three hand-built circuits are
  // authored by station, exactly as a real circuit's width is a fact about the place rather than
  // a function of its radius.
  if (TRACK_DERIVED.includes(x.k) && !(x.openW > x.tightW + 0.5))
    fails.push(`${x.label}: derived profile does not make the fast sections wider than the tight ones`);
});

// scaling the nominal width must still scale the whole profile (the old width knob still works)
const scale = await page.evaluate(() => {
  const out = [];
  for (const ww of [8, 12, 16]) { delete trackCache.mixed; TRACKS.mixed.width = ww;
    const T = buildTrack('mixed'); out.push({ ww, min: +T.wMin.toFixed(1), max: +T.wMax.toFixed(1) }); }
  delete trackCache.mixed; TRACKS.mixed.width = 12; return out;
});
console.log('  nominal width scales the profile:', scale.map(s => `${s.ww}m -> ${s.min}-${s.max}`).join(' | '));
for (let i = 1; i < scale.length; i++) if (!(scale[i].min > scale[i - 1].min && scale[i].max > scale[i - 1].max))
  fails.push('scaling the nominal width no longer scales the profile');

// ---------------------------------------------------------------- 2. late apex
// Until build 115 a fitted bias (3 x how open the next 90 m were) bent a minimum-curvature line into a
// late apex. The line each car drives is now its minimum-TIME line, refined from the lap itself, so the
// late apex has to come out of the physics: where a corner leads onto a straight the exit speed is
// carried down it, and the line should give up entry radius for exit radius. Compared against the same
// car's minimum-curvature line (same width allowance), so only the refinement is being measured.
// Apex position measured free of the solver's node spacing: the arc-length centroid of how deep
// the line sits toward the inside, minus the centreline's own curvature centroid.
// > 0 means the line reaches its deepest point LATER than the corner's geometric middle.
console.log('\n== late apex: only where a corner leads onto a straight ==');
const apex = await page.evaluate(() => {
  function measure(lineOf) {
    const onto = [], into = [];
    for (const key of Object.keys(TRACKS)) {
      const T = buildTrack(key), C = T.pts, L = lineOf(T, key), n = L.length;
      for (const ci of detectCorners(T.line)) {
        let a = ci, b = ci;
        for (let k = 1; k < n / 2; k++) { const i = (ci - k + n) % n; if (C[i].r > 250) break; a = i; }
        for (let k = 1; k < n / 2; k++) { const i = (ci + k) % n; if (C[i].r > 250) break; b = i; }
        const len = ((b - a) + n) % n + 1; if (len < 6) continue;
        let sum = 0; for (let k = 0; k < len; k++) sum += L[(a + k) % n].off;
        const sgn = sum < 0 ? -1 : 1;
        let s = 0, gN = 0, gD = 0, aN = 0, aD = 0;
        for (let k = 0; k < len; k++) {
          const i = (a + k) % n, ds = C[i].ds, kap = 1 / Math.max(1, C[i].r), dep = Math.max(0, L[i].off * sgn) ** 3;
          gN += kap * s * ds; gD += kap * ds; aN += dep * s * ds; aD += dep * ds; s += ds;
        }
        let k2 = 1, ahead = 0; while (k2 < n && C[(b + k2) % n].r < 250) k2++;
        for (; k2 < n; k2++) { const i = (b + k2) % n; if (C[i].r < 250) break; ahead += C[i].ds; }
        if (gD > 0 && aD > 0) (ahead > 180 ? onto : into).push(aN / aD - gN / gD);
      }
    }
    const mean = z => z.length ? +(z.reduce((p, q) => p + q, 0) / z.length).toFixed(1) : 0;
    return { onto: mean(onto), into: mean(into), nOnto: onto.length, nInto: into.length };
  }
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const minCurv = {}, lapsOf = lineOf => { const o = {}; for (const k of Object.keys(TRACKS)) o[k] = +simulateLap(k, { line: lineOf(buildTrack(k), k) }).lap.toFixed(2); return o; };
  const curvLine = (T, k) => minCurv[k] || (minCurv[k] = optimiseLine(T, carHalfWidth(), null));
  const flat = { ...measure(curvLine), laps: lapsOf(curvLine) };
  const late = { ...measure(lineFor), laps: lapsOf(lineFor) };
  return { flat, late };
});
console.log(`  real circuits, minimum curvature: onto a straight ${apex.flat.onto} m (${apex.flat.nOnto} corners) · into more corners ${apex.flat.into} m (${apex.flat.nInto})`);
console.log(`  real circuits, minimum time     : onto a straight ${apex.late.onto} m · into more corners ${apex.late.into} m`);
// On real circuits the corners differ in every way at once, so the clean test is a controlled one: a
// rectangle whose four identical 25 m corners lead alternately onto a 750 m straight and a 150 m one.
// The exit speed onto the long side is carried 5x as far, so the minimum-time line must apex LATER
// there than onto the short side, relative to where minimum curvature puts each.
const rect = await page.evaluate(() => {
  const R = 25, W = 800, H = 200, pts = [];
  const side = (x0, y0, x1, y1) => { const L = Math.hypot(x1 - x0, y1 - y0), N = Math.max(1, Math.round(L / 40)); for (let k = 0; k < N; k++) pts.push({ x: x0 + (x1 - x0) * k / N, y: y0 + (y1 - y0) * k / N, z: 0 }); };
  const arc = (cx, cy, a0) => { for (let k = 0; k < 4; k++) { const a = a0 + k * Math.PI / 8; pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), z: 0 }); } };
  side(R, 0, W - R, 0); arc(W - R, R, -Math.PI / 2); side(W, R, W, H - R); arc(W - R, H - R, 0); side(W - R, H, R, H); arc(R, H - R, Math.PI / 2); side(0, H - R, 0, R); arc(R, R, Math.PI);
  TRACKS.__r = { label: 'RECT', width: 12, names: [], blurb: '', pts }; delete trackCache.__r;
  const T = buildTrack('__r'), n = T.pts.length, A = optimiseLine(T, carHalfWidth(), null), Bl = lineFor(T, '__r');
  const apexAt = (L, cx, cy) => { let im = 0, dm = 1e9; for (let i = 0; i < n; i++) { const d = Math.hypot(T.pts[i].x - cx, T.pts[i].y - cy); if (d < dm) { dm = d; im = i; } }
    let N = 0, D = 0; for (let k = -30; k <= 30; k++) { const i = (im + k + n) % n, d = Math.max(0, L[i].off) ** 3; N += d * T.pts[i].ds * k; D += d * T.pts[i].ds / 1; } return N / D * T.pts[im].ds; };
  const shift = (cx, cy) => apexAt(Bl, cx, cy) - apexAt(A, cx, cy);
  const out = { long: (shift(W, H) + shift(0, 0)) / 2, short: (shift(W, 0) + shift(0, H)) / 2,
    lapA: simulateLap('__r', { line: A }).lap, lapB: simulateLap('__r', { line: Bl }).lap };
  delete TRACKS.__r; delete trackCache.__r; return out;
});
console.log(`  rectangle: apex moved ${rect.long.toFixed(1)} m onto the long straights, ${rect.short.toFixed(1)} m onto the short ones · lap ${rect.lapA.toFixed(2)} -> ${rect.lapB.toFixed(2)} s`);
if (!(rect.long > 0.5)) fails.push(`the minimum-time line does not apex later onto a long straight (${rect.long.toFixed(1)} m)`);
if (!(rect.long > rect.short + 1)) fails.push(`the apex is not later onto the long straight than onto the short one (${rect.long.toFixed(1)} vs ${rect.short.toFixed(1)} m)`);
if (!(rect.lapB < rect.lapA)) fails.push('on the rectangle the minimum-time line is not quicker than minimum curvature');

// A minimum-time line can make the claim a heuristic could not: it is never slower than where it
// started, on any circuit.
console.log('\n== the minimum-time line against minimum curvature, same car ==');
let net = 0;
Object.keys(apex.flat.laps).forEach(k => {
  const a = apex.flat.laps[k], b = apex.late.laps[k], pc = (b - a) / a * 100;
  net += b - a;
  console.log(`  ${k.padEnd(6)} ${a}s -> ${b}s   ${(b - a).toFixed(2)}s (${pc.toFixed(2)}%)`);
  if (b > a + 0.02) fails.push(`${k}: the minimum-time line is slower than minimum curvature (${pc.toFixed(2)}%)`);
});
console.log(`  net across all circuits: ${net.toFixed(2)}s`);
if (!(net < 0)) fails.push(`the minimum-time line does not pay (net ${net.toFixed(2)}s)`);

// ---------------------------------------------------------------- 3. invariants that must hold
const inv = await page.evaluate(() => {
  const sig = () => buildTrack('mixed').line.map(q => q.off.toFixed(4)).join(',');
  const a = sig();
  const pr = PRESETS.find(x => x.name === '6.5 V12 NA Supercar');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('super'); buildVehicle(); simulateLap('mixed');
  const carIndependent = a === sig();
  // an imported trace gets a derived width profile rather than a flat ribbon
  const gpx = '<gpx><trk><trkseg>' + Array.from({ length: 260 }, (_, i) => {
    const t = i / 260 * 2 * Math.PI, r = 0.010 + 0.006 * Math.cos(3 * t);
    return `<trkpt lat="${(50 + r * Math.sin(t)).toFixed(6)}" lon="${(7 + r * Math.cos(t) * 1.5).toFixed(6)}"><ele>${(200 + 20 * Math.sin(2 * t)).toFixed(1)}</ele></trkpt>`;
  }).join('') + '</trkseg></trk></gpx>';
  const def = gpxToTrack(gpx, { name: 'WIDTHTEST' });
  TRACKS.__wt = def; delete trackCache.__wt;
  const T = buildTrack('__wt');
  const res = { carIndependent, imported: { hasVar: !!def.wvar, min: +T.wMin.toFixed(1), max: +T.wMax.toFixed(1), label: T.wLabel,
    avg: +(T.pts.reduce((a2, q) => a2 + q.w * q.ds, 0) / T.length).toFixed(2), nominal: T.width } };
  delete TRACKS.__wt; delete trackCache.__wt;
  return res;
});
console.log('\nline still independent of the car:', inv.carIndependent);
console.log(`imported GPX gets a modelled width profile: ${inv.imported.label} (avg ${inv.imported.avg} m, nominal ${inv.imported.nominal} m)`);
if (!inv.carIndependent) fails.push('racing line changed with the vehicle');
if (!inv.imported.hasVar) fails.push('imported tracks do not get a width profile');
if (inv.imported.max - inv.imported.min < 1) fails.push('imported width profile does not vary');
if (Math.abs(inv.imported.avg - inv.imported.nominal) > 0.15) fails.push('imported width profile is not normalised to the nominal width');

// ---------------------------------------------------------------- 4. UI + reports
await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
});
await page.click('#tabTrack'); await page.waitForTimeout(500);
const ui = await page.evaluate(() => {
  // the map footer must quote the range, and the report must render without throwing
  const cv = document.getElementById('engineCanvas'), g = cv.getContext('2d');
  const before = g.getImageData(0, 0, cv.width, cv.height).data.reduce((a, b) => a + b, 0);
  const rpt = hotLapReportCanvas(1);
  return { footer: lapResult.track.wLabel, cells: document.querySelectorAll('#lapGrid .perf-cell').length,
    reportW: rpt ? rpt.width : 0, painted: before > 0 };
});
console.log(`\nUI: footer width "${ui.footer}" · ${ui.cells} lap cells · report ${ui.reportW}px wide · map painted ${ui.painted}`);
if (!/–/.test(ui.footer)) fails.push('map footer does not show the width range');
if (ui.cells !== 9) fails.push('lap grid broken');
if (!ui.reportW) fails.push('hot lap report failed to render');

await page.evaluate(() => applyLang('el')); await page.waitForTimeout(250);
const el = await page.evaluate(() => ({
  note: document.getElementById('lapNote').textContent.slice(0, 60),
  guide: document.getElementById('guidePanel').textContent
}));
console.log('EL blurb:', el.note);
if (/^A 20 km|^A balanced|^Tight|^Long/.test(el.note)) fails.push('Greek circuit blurb not translated');
if (!/καθυστερημένο apex/.test(el.guide)) fails.push('Greek guide does not cover the late apex');
if (!/δεν έχει ένα πλάτος/.test(el.guide)) fails.push('Greek guide does not cover variable width');
await page.evaluate(() => applyLang('en'));
const en = await page.evaluate(() => document.getElementById('guidePanel').textContent);
if (!/late apex/.test(en)) fails.push('English guide does not cover the late apex');
if (!/the track is not one width/.test(en)) fails.push('English guide does not cover variable width');
if (/doesn't model that yet/.test(en)) fails.push('guide still claims the late apex is not modelled');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
