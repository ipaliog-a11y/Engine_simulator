import { chromium } from './pw.mjs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`file://${repo}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

// ==================================================================== 1. overlap from geometry
// Overlap is not an input. It falls out of duration and lobe separation, and the sign convention
// matters: a stock cam comes out NEGATIVE, which is why a stock engine idles smoothly and cannot
// be made to scavenge however good a header you bolt to it.
console.log('== overlap comes from duration and LSA, and a stock cam has none ==');
const ov = await page.evaluate(() => ['stock', 'sport', 'race'].map(c =>
  ({ c, dur: CAM[c].dur, lsa: CAM[c].lsa, ov: +(CAM[c].dur - 2 * CAM[c].lsa).toFixed(0) })));
ov.forEach(o => console.log(`  ${o.c.padEnd(6)} dur ${o.dur}  LSA ${o.lsa}  ->  overlap ${String(o.ov).padStart(4)}°`));
if (!(ov[0].ov <= 0)) fails.push('a stock cam should have zero or negative overlap');
if (!(ov[2].ov > 55 && ov[2].ov < 95)) fails.push(`a race cam should overlap 60-90 deg, got ${ov[2].ov}`);
if (!(ov[0].ov < ov[1].ov && ov[1].ov < ov[2].ov)) fails.push('overlap must grow with cam size');

// ==================================================================== 2. EGT from the energy balance
// Checked against real measured exhaust temperatures, not against this simulator's own outputs.
// Petrol runs 700-900 C at full load; a diesel is quality-governed and always lean, so it runs far
// cooler; a rotary dumps combustion still in progress into the port and is famously hot.
console.log('\n== exhaust gas temperature must land on real measured values ==');
const egt = await page.evaluate(() => {
  const out = [];
  for (const [n, lo, hi] of [['1.6 Sport NA I4', 650, 900], ['2.0 Turbo Diesel I4', 250, 550],
                             ['1.3 Rotary NA (Renesis)', 900, 1250], ['6.6 V8 Turbodiesel', 250, 550]]) {
    const pr = PRESETS.find(x => x.name === n);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    out.push({ n, full: Math.round(exhaustGasT(1.0) - 273), part: Math.round(exhaustGasT(0.35) - 273), lo, hi });
  }
  return out;
});
egt.forEach(e => {
  console.log(`  ${e.n.padEnd(24)} full load ${String(e.full).padStart(4)} C   light ${String(e.part).padStart(4)} C   (real ${e.lo}-${e.hi})`);
  if (e.full < e.lo || e.full > e.hi) fails.push(`${e.n} EGT ${e.full} C is outside the real ${e.lo}-${e.hi} C band`);
  if (!(e.part < e.full)) fails.push(`${e.n}: EGT must fall at part load`);
});

// ==================================================================== 3. headers are buildable
// A header is CUT for the engine: the tuning relation solved for length at the lowest order that
// gives a primary you can physically route. If this comes out at a metre and a half, the tuning
// order is being ignored — which is exactly the bug that a single-reflection model produces.
console.log('\n== a derived header must be a length someone could actually fabricate ==');
const hdr = await page.evaluate(() => PRESETS.filter(p => !/Rotary|2-Stroke/.test(p.name)).map(p => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine, { exhaust: 'race' })); buildEngine();
  return { n: p.name, L: Math.round(engine.primL * 1000), k: engine.primK,
    D: +(engine.primD * 1000).toFixed(1), sys: +(engine.sysD * 1000).toFixed(0) };
}));
hdr.forEach(h => {
  console.log(`  ${h.n.padEnd(24)} primary ${String(h.L).padStart(3)} mm  k=${h.k}  ${h.D} mm bore  ·  system ${h.sys} mm`);
  if (h.L < 350 || h.L > 900) fails.push(`${h.n}: ${h.L} mm primary is not a buildable header`);
  if (h.sys < 35 || h.sys > 110) fails.push(`${h.n}: ${h.sys} mm system pipe is not a real size`);
});
// The system pipe must scale with the engine, not be a fixed number — a V12 and a kei car do not
// share a tailpipe. This is what a fixed sysD got wrong, at a cost of 0.94 bar of back-pressure.
const kei = hdr.find(h => /Kei/.test(h.n)), v12 = hdr.find(h => /V12/.test(h.n));
if (kei && v12 && !(v12.sys > kei.sys * 1.5))
  fails.push('the exhaust system pipe is not scaling with engine size');

// ==================================================================== 4. back-pressure is sane
console.log('\n== back-pressure must land where real systems measure ==');
const bp = await page.evaluate(() => ['stock', 'sport', 'race'].map(x => {
  const pr = PRESETS.find(p => p.name === '1.6 Sport NA I4');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, { exhaust: x })); buildEngine();
  return { x, bar: +backPressureBar(engine.redline * 0.9, exhaustGasT(1.0)).toFixed(3) };
}));
bp.forEach(b => console.log(`  ${b.x.padEnd(6)} ${b.bar} bar near the power peak`));
if (!(bp[0].bar > bp[1].bar && bp[1].bar > bp[2].bar))
  fails.push('a freer exhaust must have less back-pressure');
if (bp[0].bar > 0.85) fails.push(`stock back-pressure ${bp[0].bar} bar is beyond anything real`);
if (bp[2].bar < 0.005) fails.push(`race back-pressure ${bp[2].bar} bar is implausibly free`);

// ==================================================================== 5. the waves swing BOTH ways
// The point of deriving this rather than asserting it. EXHAUST.topGain was a bonus that could only
// ever help. A real pressure wave standing at the valve is either above atmosphere or below it, so
// a badly matched pipe has to COST volumetric efficiency somewhere in the range.
console.log('\n== wave action must be able to hurt, not only help ==');
const swing = await page.evaluate(() => {
  const pr = PRESETS.find(p => p.name === '2.0 ITB NA Screamer I4');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  let rlo = 9, rhi = -9, slo = 9, shi = -9;
  const T = exhaustGasT(1.0);
  for (let n = 1500; n <= engine.redline; n += 50) {
    const r = intakeRamGain(n, 313), s = scavengeGain(n, T);
    rlo = Math.min(rlo, r); rhi = Math.max(rhi, r); slo = Math.min(slo, s); shi = Math.max(shi, s);
  }
  return { rlo: +(rlo * 100).toFixed(1), rhi: +(rhi * 100).toFixed(1),
           slo: +(slo * 100).toFixed(1), shi: +(shi * 100).toFixed(1) };
});
console.log(`  intake ram      ${swing.rlo}% .. +${swing.rhi}%`);
console.log(`  exhaust scavenge ${swing.slo}% .. +${swing.shi}%`);
if (!(swing.rlo < -0.5)) fails.push('intake ram never goes negative — it is still a free bonus');
if (!(swing.rhi > 5 && swing.rhi < 25)) fails.push(`peak ram ${swing.rhi}% is outside the real 8-20% band`);
if (!(swing.slo < -0.5)) fails.push('scavenging never goes negative — reversion is not modelled');
if (!(swing.shi > 4 && swing.shi < 25)) fails.push(`peak scavenging ${swing.shi}% is outside the real band`);

// ==================================================================== 6. runner length moves the peak
// This is what replaces CAM.peakShift: the powerband position is now a consequence of a length you
// chose, not a constant asserting it.
console.log('\n== a longer runner must move the ram peak DOWN the rev range ==');
const run = await page.evaluate(() => ['long', 'medium', 'short'].map(r => {
  const pr = PRESETS.find(p => p.name === '1.6 Sport NA I4');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, { runner: r })); buildEngine();
  return { r, L: Math.round(engine.runnerL * 1000), at: engine.ramPeakRpm, g: +(engine.ramPeakGain * 100).toFixed(1) };
}));
run.forEach(r => console.log(`  ${r.r.padEnd(6)} ${String(r.L).padStart(3)} mm  ->  peak ram ${String(r.at).padStart(5)} rpm  +${r.g}%`));
if (!(run[0].at < run[1].at)) fails.push('a long runner must ram lower down than a medium one');
if (!(run[0].L > run[1].L && run[1].L > run[2].L)) fails.push('runner lengths are not ordered');

// ==================================================================== 7. late IVC guts the bottom end
// What CAM.lowLoss stood for, now pure crank-slider geometry: a big cam shuts the intake valve well
// after BDC and the piston pushes the charge back out at low rpm.
console.log('\n== a big cam must trap less charge, and VVT must give some back ==');
const trap = await page.evaluate(() => {
  const pr = PRESETS.find(p => p.name === '1.6 Sport NA I4');
  const f = (cam, vvt) => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, { cam, vvt })); buildEngine(); return +engine.trapFrac.toFixed(3); };
  return { stock: f('stock', false), race: f('race', false), raceVVT: f('race', true) };
});
console.log(`  stock cam, no VVT  ${trap.stock}   race cam, no VVT  ${trap.race}   race cam + VVT  ${trap.raceVVT}`);
if (!(trap.race < trap.stock)) fails.push('a longer-duration cam must trap LESS charge at low rpm');
if (!(trap.raceVVT > trap.race)) fails.push('VVT must recover some of the late-IVC loss');
if (trap.race < 0.75 || trap.race > 0.95) fails.push(`race-cam trapping ${trap.race} is outside a believable band`);

// ==================================================================== 8. no preset peaks at the limiter
// The outcome this whole conversion existed to deliver. Real engines peak at 90-98% of redline;
// four presets used to peak at exactly 100%, then two after the valvetrain conversion.
console.log('\n== no preset may make peak power at the exact rev limiter ==');
const lim = await page.evaluate(() => PRESETS.map(pr => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  const c = buildTorqueCurve();
  let bp = 0, bhp = -1;
  c.forEach(pt => { const hp = pt.tq * pt.rpm / 7127; if (hp > bhp) { bhp = hp; bp = pt.rpm; } });
  return { n: pr.name, frac: +(bp / engine.redline).toFixed(3) };
}));
const atLimit = lim.filter(x => x.frac > 0.985);
lim.forEach(x => console.log(`  ${x.n.padEnd(28)} peak power at ${(x.frac * 100).toFixed(0)}% of redline` + (x.frac > 0.985 ? '   <== AT LIMITER' : '')));
// Budget 1, and the one that remains is named and explained rather than tolerated silently.
// The 2.0 Turbo Hot-Hatch is a TURBO engine, and what sets a turbo's peak position is boost taper
// as the compressor runs out of map — turbo-map physics, which is conversion 4 and not yet done.
// Every naturally-aspirated preset now rolls off inside its own rev range for a stated reason.
// This budget must not grow, and conversion 4 should take it to zero.
const AT_LIMITER_BUDGET = 1;
if (atLimit.length && !atLimit.every(x => /Turbo|Supercharged/.test(x.n)))
  fails.push('a naturally-aspirated preset peaks at the limiter — nothing in the model excuses that');
if (atLimit.length > AT_LIMITER_BUDGET)
  fails.push(`${atLimit.length} preset(s) still peak at the limiter (budget ${AT_LIMITER_BUDGET}): ${atLimit.map(x => x.n).join(', ')}`);

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
