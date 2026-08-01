import { chromium } from './pw.mjs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`file://${repo}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];

// 1. Geometry: closed loops must return to their starting height; 3D length ≥ 2D
console.log('== elevation geometry ==');
const geo = await page.evaluate(() => Object.keys(TRACKS).map(k => {
  const T = buildTrack(k), L = T.line;
  let net = 0, climb = 0, d2 = 0, d3 = 0;
  for (let i = 0; i < L.length; i++) {
    const dz = L[(i + 1) % L.length].z - L[i].z;
    net += dz; if (dz > 0) climb += dz; d2 += L[i].ds; d3 += L[i].ds3;
  }
  const zs = L.map(q => q.z);
  return { label: T.label, net: +net.toFixed(4), climb: +climb.toFixed(1),
    range: +(Math.max(...zs) - Math.min(...zs)).toFixed(1),
    maxGrade: +(Math.max(...L.map(q => Math.abs(q.grade))) * 100).toFixed(1),
    d2: Math.round(d2), d3: Math.round(d3) };
}));
geo.forEach(g => console.log(`  ${g.label.padEnd(14)} net ${g.net} m | range ${g.range} m | climb/lap ${g.climb} m | steepest ${g.maxGrade}% | 2D ${g.d2} → 3D ${g.d3} m`));
geo.forEach(g => {
  if (Math.abs(g.net) > 0.01) fails.push(`${g.label}: closed loop does not return to its start height (net ${g.net} m)`);
  if (g.d3 < g.d2) fails.push(`${g.label}: 3D length shorter than 2D`);
  if (g.maxGrade > 20) fails.push(`${g.label}: implausible gradient ${g.maxGrade}%`);
  if (g.range < 5) fails.push(`${g.label}: no elevation`);
});

// 2. Controlled case: constant-radius circle, elevation can only cost time
console.log('\n== controlled: 150 m circle, sinusoidal elevation ==');
const circ = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const N = 24, R = 150, out = [];
  for (const amp of [0, 5, 10, 20, 40]) {
    const pts = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push({ x: 400 + R * Math.cos(a), y: 400 + R * Math.sin(a), z: amp * Math.sin(a * 2) }); }
    TRACKS.__c = { label: 'CIRCLE', width: 12, names: [], blurb: '', pts };
    delete trackCache.__c;
    const L = simulateLap('__c');
    out.push({ amp, lap: +L.lap.toFixed(3), vMin: +L.vMin.toFixed(1), vMax: +L.vMax.toFixed(1) });
  }
  delete TRACKS.__c;
  return out;
});
circ.forEach(x => console.log(`  amp ${String(x.amp).padStart(2)} m: lap ${x.lap}s  vMin ${x.vMin}  vMax ${x.vMax} km/h`));
for (let i = 1; i < circ.length; i++) {
  if (circ[i].lap <= circ[i - 1].lap) fails.push(`circle: amp ${circ[i].amp} m not slower than ${circ[i - 1].amp} m`);
  if (circ[i].vMin >= circ[i - 1].vMin) fails.push(`circle: min speed did not fall with elevation`);
  if (circ[i].vMax <= circ[i - 1].vMax) fails.push(`circle: max speed did not rise with elevation`);
}

// 3. Gradient must actually cost time uphill — a car that can't climb must slow down
console.log('\n== a steep climb must slow the car ==');
const climb = await page.evaluate(() => {
  // weak car, straight-ish big circle, one steep climb
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 3, bore_mm: 73, stroke_mm: 79.6, intake: 'na', redline: 6500 })); buildEngine();
  applyChassisFit('kei'); buildVehicle();
  const N = 24, R = 300, out = [];
  for (const amp of [0, 30, 90]) {
    const pts = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push({ x: 500 + R * Math.cos(a), y: 500 + R * Math.sin(a), z: amp * Math.sin(a) }); }
    TRACKS.__k = { label: 'K', width: 12, names: [], blurb: '', pts };
    delete trackCache.__k;
    const L = simulateLap('__k'), line = L.track.line;
    let up = 0; for (let i = 0; i < line.length; i++) if (line[i].grade > line[up].grade) up = i;
    out.push({ amp, lap: +L.lap.toFixed(2), grade: +(line[up].grade * 100).toFixed(1), vAtSteepest: Math.round(L.v[up] * 3.6) });
  }
  delete TRACKS.__k;
  return out;
});
climb.forEach(x => console.log(`  amp ${String(x.amp).padStart(2)} m (steepest ${x.grade}%): lap ${x.lap}s, speed at the steepest climb ${x.vAtSteepest} km/h`));
for (let i = 1; i < climb.length; i++) {
  if (climb[i].lap <= climb[i - 1].lap) fails.push(`weak car: steeper climb did not cost time`);
  if (climb[i].vAtSteepest >= climb[i - 1].vAtSteepest) fails.push(`weak car: speed on the climb did not fall`);
}

// 4. Vertical curvature sign: a crest must unload, a compression must load
console.log('\n== crest vs compression ==');
const kv = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle();
  const N = 24, R = 150, out = [];
  // sign +1 puts a crest at the same station a compression sits at for -1
  for (const sign of [1, -1]) {
    const pts = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push({ x: 400 + R * Math.cos(a), y: 400 + R * Math.sin(a), z: sign * 14 * Math.cos(a * 3) }); }
    TRACKS.__v = { label: 'V', width: 12, names: [], blurb: '', pts };
    delete trackCache.__v;
    const L = simulateLap('__v'), line = L.track.line;
    // speed where the profile is most convex (crest) and most concave (compression)
    let cr = 0, co = 0;
    for (let i = 0; i < line.length; i++) { if (line[i].kv < line[cr].kv) cr = i; if (line[i].kv > line[co].kv) co = i; }
    out.push({ sign, vCrest: +(L.v[cr] * 3.6).toFixed(1), vComp: +(L.v[co] * 3.6).toFixed(1) });
  }
  delete TRACKS.__v;
  return out;
});
kv.forEach(x => console.log(`  profile ×${x.sign}: speed at the crest ${x.vCrest} km/h, at the compression ${x.vComp} km/h`));
kv.forEach(x => { if (x.vComp <= x.vCrest) fails.push(`compression is not faster than the crest (profile ×${x.sign})`); });

// 5. Report + UI carry elevation
const ui = await page.evaluate(async () => {
  await document.fonts.ready;
  const pr = PRESETS.find(x => x.name === '3.0 Turbo I6 (2JZ)');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe'); buildVehicle(); trackKey = 'mixed'; refreshLap();
  const cs = lapCorners(lapResult);
  const cv = hotLapReportCanvas(2);
  return { head: document.getElementById('lapHead') ? '' : '', climb: +lapResult.climb.toFixed(1),
    zRange: +(lapResult.zMax - lapResult.zMin).toFixed(1),
    grades: cs.map(c => +c.grade.toFixed(1)),
    uphill: cs.filter(c => c.grade > 1).length, downhill: cs.filter(c => c.grade < -1).length,
    canvas: cv.width + 'x' + cv.height };
});
console.log(`\nreport: ${ui.canvas} | climb ${ui.climb} m/lap | range ${ui.zRange} m`);
console.log(`  corner grades: ${ui.grades.join(', ')}`);
console.log(`  ${ui.uphill} uphill corners, ${ui.downhill} downhill`);
if (ui.canvas !== '2480x3508') fails.push('report canvas wrong size');
if (ui.climb < 5) fails.push('climb per lap not computed');
if (ui.uphill < 1 || ui.downhill < 1) fails.push('corner grades look wrong (need both uphill and downhill)');

await page.click('#tabTrack'); await page.waitForTimeout(300);
const head = await page.evaluate(() => document.getElementById('lapHead').textContent);
console.log('  lap head:', head.trim());
if (!/m elevation/.test(head)) fails.push('TRACK panel does not show elevation');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
