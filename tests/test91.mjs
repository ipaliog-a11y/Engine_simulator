// Gear spacing and the real cars' own gearboxes (build 169).
//
// WHY THIS EXISTS. Every car with the same number of gears ran the same ratios: one even (geometric) progression
// from 3.35 to 0.82, stretched a little by the gearbox type. A 4-speed spanned what an 8-speed did, the steps never
// shrank towards the top as real ones do, and a Golf and a 911 shared a box. Now the spacing is the textbook's
// progressive design fitted to the published boxes, CLOSE RATIO / STANDARD / WIDE RATIO are the quartiles of those
// boxes, a real car runs its own published ratios and final drive, and the ratios can be set by hand. What must hold:
//   · every spacing gives n ratios, each taller than the last, with the steps shrinking towards the top (φ2 > 1),
//     up to ten gears (a fixed φ2 fails there: the share of the span the progression makes is what is held);
//   · the span grows with the gear count, and CLOSE < STANDARD < WIDE at every count;
//   · the constants are what the published boxes give: the fit and its quartiles, recomputed here from GEARSETS;
//   · every published set belongs to a preset with that many gears, taller gear by gear;
//   · a real car runs its published ratios and final drive; one with no published set its family's average;
//   · CUSTOM ratios and a hand-set final drive reach the 0-100 and the lap; a set out of order is refused;
//   · a STOCK option only on a real car, and the choice survives a save and a reload.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const out = {};
  // 1. the generated boxes
  out.gen = [];
  for (let n = GEARS_MIN; n <= GEARS_MAX; n++) for (const sp of Object.keys(GEAR_SPACING)) {
    const g = genRatios(n, sp), steps = g.slice(1).map((x, i) => g[i] / x);
    out.gen.push({ n, sp, len: g.length, span: g[0] / g[n - 1], top: g[n - 1], falling: g.every((x, i) => i === 0 || x < g[i - 1]),
      shrinking: steps.every((s, i) => i === 0 || s < steps[i - 1]), fit: fitGearbox(g) });
  }
  // 2. the constants, from the distinct published boxes
  const seen = new Set(), boxes = [];
  for (const g of Object.values(GEARSETS)) { const k = g.r.map(x => x.toFixed(3)).join('/'); if (!seen.has(k)) { seen.add(k); boxes.push(g.r); } }
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const b of boxes) { const x = Math.log(b.length - 1), y = Math.log(b[0] / b[b.length - 1]); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const N = boxes.length, c = (N * sxy - sx * sy) / (N * sxx - sx * sx), d = (sy - c * sx) / N;
  const q = (a, p) => { a = a.slice().sort((x, y) => x - y); const i = p * (a.length - 1), lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  const res = boxes.map(b => Math.log(b[0] / b[b.length - 1]) - (d + c * Math.log(b.length - 1))), ph = boxes.map(b => fitGearbox(b).phi2);
  const pr = boxes.map(b => fitGearbox(b).prog);
  out.consts = { N, c, d, res: [.25, .5, .75].map(p => q(res, p)), phi2: [.25, .5, .75].map(p => q(ph, p)), prog: [.25, .5, .75].map(p => q(pr, p)), progAll: pr, C: GEAR_SPAN_C, D: GEAR_SPAN_D,
    sp: ['close', 'std', 'wide'].map(k => GEAR_SPACING[k]) };
  // 3. the published sets against their presets
  out.sets = Object.entries(GEARSETS).map(([name, g]) => { const p = VEHICLE_PRESETS.find(q => q.name === name);
    return { name, found: !!p, gears: p && p.fit.gears, len: g.r.length, falling: g.r.every((x, i) => i === 0 || x < g.r[i - 1]), fd: g.fd, src: !!g.src }; });
  // 4. real cars: their own box, or their family's
  const load = nm => loadVehiclePreset(VEHICLE_PRESETS.find(p => p.name.includes(nm)));
  out.real = ['M3 (E46', '911 Turbo S (992', 'Silverado', 'GR Yaris', 'BMW 330d'].map(nm => { load(nm);
    const g = GEARSETS[vehicle.body.name];
    return { nm, spacing: vehicle.spacing, approx: vehicle.gearsetApprox, same: vehicle.ratios.every((x, i) => Math.abs(x - g.r[i]) < 1e-9), n: vehicle.ratios.length,
      fd: vehicle.finalDrive, fdPub: g.fd, opts: [...document.getElementById('vhSpacing').options].map(o => o.value) }; });
  out.approx = ['Golf GTI', 'Huracán LP610', 'Mustang GT'].map(nm => { load(nm);
    const g = vehicle.ratios, steps = g.slice(1).map((x, i) => g[i] / x);
    return { nm, approx: vehicle.gearsetApprox, n: g.length, falling: g.every((x, i) => i === 0 || x < g[i - 1]), prog: steps[0] > steps[steps.length - 1], fd: vehicle.finalDrive }; });
  // the slider still biases a published final drive: shorter at 0, taller at 100
  load('M3 (E46'); const fd52 = vehicle.finalDrive;
  document.getElementById('vhGearing').value = 0; buildVehicle(); const fd0 = vehicle.finalDrive;
  document.getElementById('vhGearing').value = 100; buildVehicle(); const fd100 = vehicle.finalDrive;
  out.bias = { fd0, fd52, fd100 };
  // 5. CUSTOM and a hand-set final drive
  load('M3 (E46');
  const t0 = perf.t100, lap0 = simulateLap('tech').lap, stockR = vehicle.ratios.slice();
  const custom = stockR.map((x, i) => i === 0 ? x * 1.25 : x);              // a much shorter 1st
  applyVehicleToForm(Object.assign(readVehicleFromForm(), { spacing: 'custom', ratioSet: custom })); buildVehicle();
  out.custom = { used: vehicle.ratios.every((x, i) => x === custom[i]), t100: perf.t100, t0, lap: simulateLap('tech').lap, lap0, factory: isFactoryFit(readVehicleFromForm()) };
  applyVehicleToForm(Object.assign(readVehicleFromForm(), { spacing: 'custom', ratioSet: [2, 3, 1.5, 1.2, 1, 0.8] })); buildVehicle();
  out.badSet = vehicle.ratios.every((x, i) => i === 0 || x < vehicle.ratios[i - 1]);
  applyVehicleToForm(Object.assign(readVehicleFromForm(), { spacing: 'stock', ratioSet: null, finalDriveSet: 4.5 })); buildVehicle();
  out.fdSet = { fd: vehicle.finalDrive, t100: perf.t100 };
  // 6. archetypes: no STOCK; the spacing and its save
  applyChassisFit('coupe'); vehBody = null; fillSpacingSelect(false, 'std'); buildVehicle();
  out.archOpts = [...document.getElementById('vhSpacing').options].map(o => o.value);
  out.byGears = [4, 6, 8, 10].map(n => { document.getElementById('vhGears').value = n; buildVehicle(); return { n, len: vehicle.ratios.length, t100: perf.t100 }; });
  document.getElementById('vhGears').value = 6;
  out.bySpacing = ['close', 'std', 'wide'].map(sp => { document.getElementById('vhSpacing').value = sp; buildVehicle(); return { sp, r1: vehicle.ratios[0], t100: perf.t100 }; });
  document.getElementById('vhSpacing').value = 'custom';
  applyVehicleToForm(Object.assign(readVehicleFromForm(), { spacing: 'custom', ratioSet: genRatios(6, 'close'), finalDriveSet: 3.9 })); buildVehicle();
  const before = JSON.stringify(readVehicleFromForm()), s = serializeBuild('t', '');
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE)); buildVehicle();
  applyBuild(JSON.parse(JSON.stringify(s)));
  out.roundTrip = { same: JSON.stringify(readVehicleFromForm()) === before, fd: vehicle.finalDrive, spacing: vehicle.spacing };
  // a save from before build 169 carries no spacing: an archetype gets STANDARD
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), vehicle: { chassis: 'coupe', drive: 'rwd', gears: 6, gearing: 52 } });
  out.legacy = { spacing: vehicle.spacing, ok: vehicle.ratios.length === 6 };
  return out;
});

console.log('== generated spacing: span (φ2) ==');
for (const n of [4, 6, 8, 10]) console.log(`  ${n} gears: ` + r.gen.filter(g => g.n === n).map(g => `${g.sp} ${g.span.toFixed(2)} (φ2 ${g.fit.phi2.toFixed(3)})`).join(' | '));
for (const g of r.gen) {
  const k = `${g.n}-speed ${g.sp}`, sp = r.consts.sp[['close', 'std', 'wide'].indexOf(g.sp)];
  if (g.len !== g.n || !g.falling) fails.push(`${k}: not ${g.n} ratios each taller than the last`);
  if (!g.shrinking) fails.push(`${k}: the steps do not shrink towards the top`);
  if (Math.abs(g.fit.prog - sp.prog) > 1e-6 || Math.abs(g.fit.res - sp.res) > 1e-6) fails.push(`${k}: the fit does not give back its own span and progression`);
}
for (let n = 4; n <= 10; n++) {
  const [c, s, w] = ['close', 'std', 'wide'].map(sp => r.gen.find(g => g.n === n && g.sp === sp).span);
  if (!(c < s && s < w)) fails.push(`${n} gears: CLOSE ${c.toFixed(2)}, STANDARD ${s.toFixed(2)}, WIDE ${w.toFixed(2)} are not in order`);
  if (n > 4 && !(s > r.gen.find(g => g.n === n - 1 && g.sp === 'std').span)) fails.push(`${n} gears do not span more than ${n - 1}`);
}

const C = r.consts;
console.log(`\n== the constants, from ${C.N} distinct published boxes ==`);
console.log(`  ln(span) = ${C.d.toFixed(3)} + ${C.c.toFixed(3)}·ln(n−1) (in the model ${C.D} + ${C.C}); residual quartiles ${C.res.map(x => x.toFixed(3)).join(' / ')}; progressive share quartiles ${C.prog.map(x => x.toFixed(3)).join(' / ')} (φ2 ${C.phi2.map(x => x.toFixed(3)).join(' / ')})`);
if (Math.abs(C.c - C.C) > 0.001 || Math.abs(C.d - C.D) > 0.001) fails.push('the span law in the model is not the fit to the published boxes');
C.sp.forEach((sp, i) => {
  if (Math.abs(sp.res - C.res[i]) > 0.001) fails.push(`${sp.label}: span residual ${sp.res}, the published boxes' quartile is ${C.res[i].toFixed(3)}`);
  if (Math.abs(sp.prog - C.prog[i]) > 0.001) fails.push(`${sp.label}: progressive share ${sp.prog}, the published boxes' quartile is ${C.prog[i].toFixed(3)}`);
});
if (C.N < 25) fails.push('fewer than 25 published boxes behind the constants');

console.log(`\n== published sets: ${r.sets.length} cars ==`);
for (const s of r.sets) {
  if (!s.found) fails.push(`${s.name}: no such preset`);
  else if (s.gears !== s.len) fails.push(`${s.name}: ${s.len} published ratios on a ${s.gears}-speed preset`);
  if (!s.falling) fails.push(`${s.name}: published ratios out of order`);
  if (!s.src) fails.push(`${s.name}: no source given`);
  if (s.fd != null && !(s.fd >= 2.2 && s.fd <= 6.0)) fails.push(`${s.name}: final drive ${s.fd} outside 2.2-6.0`);
}

console.log('\n== real cars ==');
for (const x of r.real) console.log(`  ${x.nm.padEnd(18)} ${x.spacing} ${x.n} gears, published ratios ${x.same ? 'yes' : 'NO'}, final ${x.fd.toFixed(3)} (published ${x.fdPub}); options ${x.opts.join('/')}`);
for (const x of r.real) {
  if (x.spacing !== 'stock' || x.approx || !x.same) fails.push(`${x.nm}: does not run its published ratios`);
  if (x.fdPub != null && Math.abs(x.fd / x.fdPub - 1) > 1e-9) fails.push(`${x.nm}: final ${x.fd.toFixed(3)}, published ${x.fdPub}`);
  if (!x.opts.includes('stock')) fails.push(`${x.nm}: no STOCK option on a real car`);
}
if (r.real.find(x => x.nm === 'Silverado').n !== 10) fails.push('the Duramax does not run its ten-speed');
for (const x of r.approx) {
  console.log(`  ${x.nm.padEnd(18)} family average: ${x.n} gears, final ${x.fd.toFixed(2)} (matched)`);
  if (!x.approx || !x.falling || !x.prog) fails.push(`${x.nm}: no progressive family-average box`);
}
console.log(`  M3 final drive with the slider at 0 / 52 / 100: ${r.bias.fd0.toFixed(2)} / ${r.bias.fd52.toFixed(2)} / ${r.bias.fd100.toFixed(2)}`);
if (!(r.bias.fd0 > r.bias.fd52 && r.bias.fd52 > r.bias.fd100)) fails.push('the GEARING slider does not bias a published final drive');

console.log('\n== custom ==');
console.log(`  M3 with a 25% shorter 1st: 0-100 ${r.custom.t0.toFixed(2)} -> ${r.custom.t100.toFixed(2)} s, tech lap ${r.custom.lap0.toFixed(2)} -> ${r.custom.lap.toFixed(2)} s; factory fit: ${r.custom.factory}`);
if (!r.custom.used) fails.push('custom ratios are not the ones the car runs');
if (!(Math.abs(r.custom.t100 - r.custom.t0) > 0.01)) fails.push('custom ratios do not reach the 0-100');
if (!(Math.abs(r.custom.lap - r.custom.lap0) > 0.001)) fails.push('custom ratios do not reach the lap');
if (r.custom.factory) fails.push('a custom box still reads as factory fit');
if (!r.badSet) fails.push('a custom set out of order was run');
console.log(`  hand-set final drive 4.5: runs ${r.fdSet.fd.toFixed(2)}`);
if (Math.abs(r.fdSet.fd - 4.5) > 1e-9) fails.push('a hand-set final drive is not the one the car runs');

console.log('\n== archetype ==');
console.log(`  options ${r.archOpts.join('/')}; by gears: ` + r.byGears.map(g => `${g.n}: ${g.t100.toFixed(2)} s`).join(', ') + '; by spacing: ' + r.bySpacing.map(g => `${g.sp} 1st ${g.r1.toFixed(2)}`).join(', '));
if (r.archOpts.includes('stock')) fails.push('an archetype offers STOCK');
if (r.byGears.some(g => g.len !== g.n)) fails.push('the gear count does not reach the box (4 to 10)');
if (!(r.bySpacing[0].r1 < r.bySpacing[1].r1 && r.bySpacing[1].r1 < r.bySpacing[2].r1)) fails.push('the spacing does not reach the box');
console.log(`  save and reload: ${r.roundTrip.same ? 'same' : 'DIFFERENT'} (${r.roundTrip.spacing}, final ${r.roundTrip.fd}); a save from before: ${r.legacy.spacing}`);
if (!r.roundTrip.same || r.roundTrip.fd !== 3.9 || r.roundTrip.spacing !== 'custom') fails.push('the custom box does not survive a save and reload');
if (r.legacy.spacing !== 'std' || !r.legacy.ok) fails.push('a save without a spacing does not come back STANDARD');

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
