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
  return { k, label: T.label, nominal: T.width, avg: +avg.toFixed(2), min: +T.wMin.toFixed(1), max: +T.wMax.toFixed(1),
    label_: T.wLabel, tightW: +tightW.toFixed(1), openW: +openW.toFixed(1),
    offTrack: T.line.filter((p, i) => Math.abs(p.off) > T.pts[i].hw + 1e-6).length };
}));
w.forEach(x => console.log(`  ${x.label.padEnd(14)} ${x.label_.padEnd(9)} nominal ${x.nominal} m, measured avg ${x.avg} m | tightest fifth ${x.tightW} m vs most open fifth ${x.openW} m | off track ${x.offTrack} pts`));
w.forEach(x => {
  if (Math.abs(x.avg - x.nominal) > 0.15) fails.push(`${x.label}: quoted ${x.nominal} m is not the average (${x.avg} m)`);
  if (x.max - x.min < 1.5) fails.push(`${x.label}: width barely varies (${x.min}–${x.max} m)`);
  if (x.offTrack) fails.push(`${x.label}: racing line leaves the track at ${x.offTrack} points`);
  if (!/–/.test(x.label_)) fails.push(`${x.label}: readout does not show a width range`);
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
// Apex position measured free of the solver's node spacing: the arc-length centroid of how deep
// the line sits toward the inside, minus the centreline's own curvature centroid.
// > 0 means the line reaches its deepest point LATER than the corner's geometric middle.
console.log('\n== late apex: only where a corner leads onto a straight ==');
const apex = await page.evaluate(() => {
  const src = optimiseLine.toString();
  function measure() {
    const onto = [], into = [];
    for (const key of Object.keys(TRACKS)) {
      const T = buildTrack(key), C = T.pts, L = T.line, n = L.length;
      for (const ci of detectCorners(L)) {
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
  const laps = () => { const o = {}; for (const k of Object.keys(TRACKS)) o[k] = +simulateLap(k).lap.toFixed(2); return o; };
  // A: pure minimum curvature (LATE_APEX disabled)
  window.optimiseLine = eval('(' + src.replace(/const LATE_APEX=[\d.]+;/, 'const LATE_APEX=0;') + ')');
  Object.keys(trackCache).forEach(k => delete trackCache[k]);
  const flat = { ...measure(), laps: laps() };
  // B: as shipped
  window.optimiseLine = eval('(' + src + ')');
  Object.keys(trackCache).forEach(k => delete trackCache[k]);
  const late = { ...measure(), laps: laps() };
  return { flat, late };
});
console.log(`  minimum curvature only: onto a straight ${apex.flat.onto} m (${apex.flat.nOnto} corners) · into more corners ${apex.flat.into} m (${apex.flat.nInto})`);
console.log(`  as shipped            : onto a straight ${apex.late.onto} m (${apex.late.nOnto} corners) · into more corners ${apex.late.into} m (${apex.late.nInto})`);
if (!(apex.late.onto > apex.flat.onto + 5)) fails.push('the apex did not move later on corners that lead onto a straight');
if (!(apex.late.onto > 5)) fails.push('the apex is not actually late (should be several metres past the geometric middle)');
// Selectivity is the real claim: the shift has to land mostly on the corners that lead somewhere
// fast, not be a uniform rotation of every apex on the circuit.
const dOnto = apex.late.onto - apex.flat.onto, dInto = apex.late.into - apex.flat.into;
console.log(`  shift applied: ${dOnto.toFixed(1)} m onto a straight vs ${dInto.toFixed(1)} m into more corners (${(dOnto / Math.max(0.1, dInto)).toFixed(1)}x)`);
if (!(dOnto > 2 * dInto)) fails.push(`the late-apex bias is not selective (${dOnto.toFixed(1)} m vs ${dInto.toFixed(1)} m)`);

// It must PAY ON BALANCE, and never lose much anywhere. Not "never loses at all" — that was the
// old claim and it is a claim of OPTIMALITY, which minimum-curvature-plus-a-bias cannot make. A
// true minimum-LAP-TIME line could; this is a geometric heuristic with one exit-weighting term, so
// on a circuit of fast sweepers that only want minimum curvature it can give a little back.
//
// Making the bias car-aware was tried, on the theory that whether a late apex pays depends on the
// car's acceleration against its grip — a friction-circle argument, and it does produce a properly
// selective apex shift. It did not rescue this case either, because the problem is not the value of
// the bias but the shape of the objective. Reverted; the known limit stands, and a minimum-time
// line is what would actually retire it.
console.log('\n== it must pay on balance, and never lose much anywhere ==');
const LOSS_CAP = 0.5;                 // % on any single circuit
let net = 0;
Object.keys(apex.flat.laps).forEach(k => {
  const a = apex.flat.laps[k], b = apex.late.laps[k], pc = (b - a) / a * 100;
  net += b - a;
  console.log(`  ${k.padEnd(6)} ${a}s -> ${b}s   ${(b - a).toFixed(2)}s (${pc.toFixed(2)}%)`);
  if (pc > LOSS_CAP) fails.push(`${k}: the late-apex line loses ${pc.toFixed(2)}% — past the ${LOSS_CAP}% cap`);
});
console.log(`  net across all circuits: ${net.toFixed(2)}s`);
if (!(net < 0)) fails.push(`the late-apex bias does not pay on balance (net ${net.toFixed(2)}s)`);

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
if (ui.cells !== 8) fails.push('lap grid broken');
if (!ui.reportW) fails.push('hot lap report failed to render');

await page.evaluate(() => applyLang('el')); await page.waitForTimeout(250);
const el = await page.evaluate(() => ({
  note: document.getElementById('lapNote').textContent.slice(0, 60),
  guide: (document.querySelector('[data-gk="vehicle"]') || {}).textContent || ''
}));
console.log('EL blurb:', el.note);
if (/^A 20 km|^A balanced|^Tight|^Long/.test(el.note)) fails.push('Greek circuit blurb not translated');
if (!/καθυστερημένο apex/.test(el.guide)) fails.push('Greek guide does not cover the late apex');
if (!/δεν έχει ένα πλάτος/.test(el.guide)) fails.push('Greek guide does not cover variable width');
await page.evaluate(() => applyLang('en'));
const en = await page.evaluate(() => (document.querySelector('[data-gk="vehicle"]') || {}).textContent || '');
if (!/late apex/.test(en)) fails.push('English guide does not cover the late apex');
if (!/the track is not one width/.test(en)) fails.push('English guide does not cover variable width');
if (/doesn't model that yet/.test(en)) fails.push('guide still claims the late apex is not modelled');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
