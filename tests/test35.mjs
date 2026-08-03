import { chromium } from './pw.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const gpx = readFileSync('/root/.claude/uploads/367f578e-6004-580f-ae9f-7158e9c4f5ba/c1cc91f1-D21N_rburgringNordschleifeTrack.gpx', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];

// 1. Parse + project + resample
console.log('== import a real 20 km GPX trace ==');
const imp = await page.evaluate((gpx) => {
  const raw = parseGPX(gpx);
  const def = gpxToTrack(gpx, {});
  const sp = [];
  for (let i = 0; i < def.pts.length; i++) {
    const a = def.pts[i], b = def.pts[(i + 1) % def.pts.length];
    sp.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  sp.sort((a, b) => a - b);
  return { rawPts: raw.length, hasEle: raw.filter(p => p.ele > 0).length,
    ctrl: def.pts.length, label: def.label, gap: +def.closureGap.toFixed(1),
    spMin: +sp[0].toFixed(1), spMed: +sp[(sp.length / 2) | 0].toFixed(1), spMax: +sp[sp.length - 1].toFixed(1),
    minX: Math.min(...def.pts.map(p => p.x)), minY: Math.min(...def.pts.map(p => p.y)), minZ: Math.min(...def.pts.map(p => p.z)) };
}, gpx);
console.log(`  ${imp.rawPts} GPX points (${imp.hasEle} with elevation) → ${imp.ctrl} control points`);
console.log(`  control spacing: min ${imp.spMin} median ${imp.spMed} max ${imp.spMax} m  (source was 2.4 / 27.9 / 421.8)`);
console.log(`  origin normalised to (${imp.minX}, ${imp.minY}, ${imp.minZ}) · closure gap ${imp.gap} m bridged`);
if (imp.rawPts < 500) fails.push('GPX parse lost points');
if (imp.hasEle < 500) fails.push('GPX elevation not parsed');
if (imp.spMax > imp.spMed * 1.6) fails.push(`resampling did not equalise spacing (max ${imp.spMax} vs median ${imp.spMed})`);
if (imp.minX !== 0 || imp.minY !== 0 || imp.minZ !== 0) fails.push('coordinates not re-origined');

// 2. Geometry matches the real circuit's published figures
const geo = await page.evaluate((gpx) => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const t0 = performance.now();
  loadGpxTrack(gpx, 'x');
  const ms = performance.now() - t0;
  const T = buildTrack(trackKey), L = lapResult;
  const zs = T.line.map(q => q.z);
  let net = 0; for (let i = 0; i < T.line.length; i++) net += T.line[(i + 1) % T.line.length].z - T.line[i].z;
  return { km: +(T.length / 1000).toFixed(2), corners: T.corners,
    zRange: +(Math.max(...zs) - Math.min(...zs)).toFixed(0), climb: +L.climb.toFixed(0),
    net: +net.toFixed(3), maxGrade: +(Math.max(...T.line.map(q => Math.abs(q.grade))) * 100).toFixed(1),
    samples: T.line.length, ms: Math.round(ms), lap: +L.lap.toFixed(1), avg: Math.round(L.avg), vMax: Math.round(L.vMax) };
}, gpx);
console.log(`\n  length ${geo.km} km (published 20.8) · elevation ${geo.zRange} m (published ~300) · climb ${geo.climb} m/lap`);
console.log(`  ${geo.corners} corners · steepest ${geo.maxGrade}% · ${geo.samples} samples · imported+solved in ${geo.ms} ms`);
const mm = Math.floor(geo.lap / 60);
console.log(`  lap ${mm}:${(geo.lap - mm * 60).toFixed(1).padStart(4, '0')}  avg ${geo.avg} km/h  max ${geo.vMax} km/h`);
if (Math.abs(geo.km - 20.8) > 1.2) fails.push(`imported length ${geo.km} km is far from the published 20.8 km`);
if (Math.abs(geo.zRange - 300) > 60) fails.push(`elevation range ${geo.zRange} m is far from the published ~300 m`);
if (Math.abs(geo.net) > 0.01) fails.push('imported loop does not close in elevation');
if (geo.ms > 4000) fails.push(`import+solve too slow (${geo.ms} ms)`);
if (geo.corners < 15) fails.push('too few corners detected on a 20 km circuit');
if (geo.lap < 300 || geo.lap > 900) fails.push(`lap time ${geo.lap}s implausible`);

// 3. Report renders for the imported track
const rep = await page.evaluate(async () => {
  await document.fonts.ready;
  const cv = hotLapReportCanvas(2);
  const cs = lapCorners(lapResult);
  return { size: cv.width + 'x' + cv.height, corners: cs.length, named: cs.filter(c => /^Turn \d+$/.test(c.name)).length };
});
console.log(`\n  report ${rep.size}, ${rep.corners} corners (${rep.named} fall back to "Turn n" — imported tracks carry no names)`);
if (rep.size !== '2480x3508') fails.push('report failed for imported track');
if (rep.corners < 15) fails.push('report corner list too short');

// 4. Persistence across a reload
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
const persist = await page.evaluate(() => {
  const keys = Object.keys(TRACKS).filter(k => TRACKS[k].imported);
  const sel = document.getElementById('trkSel');
  return { imported: keys.length, options: sel ? sel.options.length : 0,
    label: keys.length ? TRACKS[keys[0]].label : '', pts: keys.length ? TRACKS[keys[0]].pts.length : 0 };
});
console.log(`  after reload: ${persist.imported} imported track(s) restored, ${persist.options} in the dropdown, ${persist.pts} points`);
if (persist.imported < 1) fails.push('imported track did not persist across reload');
if (persist.options < 4) fails.push('imported track missing from the selector after reload');

// 5. Bad input is handled
const bad = await page.evaluate(() => {
  const out = {};
  try { gpxToTrack('<gpx></gpx>', {}); out.empty = 'no throw'; } catch (e) { out.empty = 'threw'; }
  let flashed = '';
  loadGpxTrack('not xml at all', 'x');
  flashed = document.getElementById('status').textContent;
  return { ...out, flashed };
});
console.log(`  empty GPX: ${bad.empty} · garbage input flashes: "${bad.flashed}"`);
if (bad.empty !== 'threw') fails.push('empty GPX did not throw');
if (!/FAILED/.test(bad.flashed)) fails.push('garbage GPX did not report failure');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
