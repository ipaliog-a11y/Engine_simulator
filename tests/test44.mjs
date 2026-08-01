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

// The valvetrain is the first v1.0 conversion: quantities derived from geometry and mechanics
// instead of coefficients fitted until the outputs matched. So this test checks the DERIVATIONS
// against independent reality — real valve masses, real head geometry, published gas dynamics —
// rather than checking that our own presets come out at some remembered number. A test that only
// pins today's outputs would happily bless a wrong derivation.

// ==================================================================== 1. valve mass vs real valves
console.log('== a derived valve should weigh what a real valve weighs ==');
const mass = await page.evaluate(() => [31, 35, 39, 46, 52].map(D => ({
  D, steel: +(valveMass(D, 'steel') * 1000).toFixed(0), ti: +(valveMass(D, 'titanium') * 1000).toFixed(0) })));
// Published intake-valve masses span roughly these bands across passenger-car sizes.
const REAL = { 31: [50, 75], 35: [62, 92], 39: [76, 110], 46: [100, 140], 52: [125, 175] };
mass.forEach(m => {
  const [lo, hi] = REAL[m.D], ok = m.steel >= lo && m.steel <= hi;
  console.log(`  ${m.D} mm: ${m.steel} g steel (real ${lo}-${hi}) · ${m.ti} g titanium` + (ok ? '' : '   <-- OUT OF RANGE'));
  if (!ok) fails.push(`${m.D} mm valve derived at ${m.steel} g, outside the real ${lo}-${hi} g band`);
});
// Titanium is a material property, not a fudge: density ratio 4500/7800.
const tiRatio = mass[2].ti / mass[2].steel;
console.log(`  titanium / steel = ${tiRatio.toFixed(3)} (density ratio 4500/7800 = 0.577)`);
if (Math.abs(tiRatio - 0.577) > 0.02) fails.push(`titanium mass ratio ${tiRatio.toFixed(3)} is not the density ratio`);

// ==================================================================== 2. head geometry
console.log('\n== four valves must beat two, and five must NOT beat four ==');
const pack = await page.evaluate(() => Object.entries(VALVE_PACK).map(([v, p]) =>
  ({ v: +v, ratio: +(p.n * p.dOverB * p.dOverB).toFixed(3) })));
pack.forEach(p => console.log(`  ${p.v}-valve: intake area / bore area = ${p.ratio}`));
const g = v => pack.find(p => p.v === v).ratio;
if (!(g(4) > g(2) * 1.15)) fails.push('four valves do not give meaningfully more area than two');
if (!(g(5) < g(4))) fails.push('five valves come out better than four — real heads do not, which is why five-valve died');

// ==================================================================== 3. the Taylor curve
console.log('\n== inlet Mach index reproduces the published VE correlation ==');
const taylor = await page.evaluate(() => [0.3, 0.5, 0.6, 0.7, 0.9].map(Z => ({ Z, ve: +veMachLoss(Z).toFixed(3) })));
taylor.forEach(t => console.log(`  Z=${t.Z}  VE x${t.ve}`));
const at = Z => taylor.find(t => t.Z === Z).ve;
if (at(0.3) < 0.999 || at(0.5) < 0.999) fails.push('VE is being penalised below the Z=0.5 knee, where Taylor shows it flat');
if (Math.abs(at(0.7) - 0.75) > 0.05) fails.push(`at Z=0.7 Taylor gives ~0.75, model gives ${at(0.7)}`);
if (Math.abs(at(0.9) - 0.45) > 0.06) fails.push(`at Z=0.9 Taylor gives ~0.45, model gives ${at(0.9)}`);

// ==================================================================== 4. float responds to design
console.log('\n== valve float must follow the spring, the mass and the cam ==');
const float = await page.evaluate(() => {
  const base = { cylinders: 8, bore_mm: 93, stroke_mm: 92.7, redline: 7500, layout: 'v', compression: 11 };
  const F = o => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, o)); buildEngine();
    return { float: Math.round(engine.floatRpm), mass: Math.round(engine.valveMass_g), D: +engine.ivDia_mm.toFixed(1) }; };
  return {
    stockSpring: F({ valves: 2, valveSpring: 'stock' }),
    raceSpring:  F({ valves: 2, valveSpring: 'race' }),
    steel:       F({ valves: 4, valveSpring: 'race', valveMat: 'steel' }),
    titanium:    F({ valves: 4, valveSpring: 'race', valveMat: 'titanium' }),
    stockCam:    F({ valves: 4, valveSpring: 'perf', cam: 'stock' }),
    raceCam:     F({ valves: 4, valveSpring: 'perf', cam: 'race' }),
    twoValve:    F({ valves: 2, valveSpring: 'perf' }),
    fourValve:   F({ valves: 4, valveSpring: 'perf' }),
  };
});
Object.entries(float).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} float ${String(v.float).padStart(6)} rpm · ${v.D} mm valve · ${v.mass} g`));
if (!(float.raceSpring.float > float.stockSpring.float * 1.2))
  fails.push('a race spring barely raises the float rpm');
if (!(float.titanium.float > float.steel.float * 1.15))
  fails.push('titanium valves barely raise the float rpm, though they weigh 42% less');
if (!(float.fourValve.float > float.twoValve.float * 1.15))
  fails.push('four small valves should float much later than one big one');

// Cam profile: test the three physical relationships ONE AT A TIME, against valveFloatRpm directly.
// Comparing whole cam profiles does not work — a race lobe has more lift AND more duration AND a
// harsher ramp, and they push in opposite directions. (An earlier version of this test asserted
// "a race cam floats earlier" as though that were obvious. It is not: the longer duration lowers
// peak acceleration through (2*pi/theta)^2 faster than the extra lift raises it, so at equal
// spring load a long race lobe actually floats LATER. The composite has no fixed sign; the parts do.)
console.log('\n== each cam variable on its own must move float the way mechanics says ==');
const cam = await page.evaluate(() => {
  const spr = VALVE_SPRING.perf, m = 0.072;
  const f = (lift, dur, accel) => Math.round(valveFloatRpm(lift, dur, spr, m, accel, 2));
  return { baseline: f(9, 250, 0.9), moreLift: f(12, 250, 0.9),
    longerDur: f(9, 300, 0.9), harsherRamp: f(9, 250, 1.05) };
});
console.log(`  baseline (9 mm, 250 deg, ramp 0.90) ....... ${cam.baseline} rpm`);
console.log(`  more lift      (12 mm) .................... ${cam.moreLift} rpm`);
console.log(`  longer duration (300 deg) ................. ${cam.longerDur} rpm`);
console.log(`  harsher ramp   (1.05) ..................... ${cam.harsherRamp} rpm`);
if (!(cam.moreLift < cam.baseline))
  fails.push('more lift at the same duration must float EARLIER — the nose acceleration scales with lift');
if (!(cam.longerDur > cam.baseline))
  fails.push('longer duration at the same lift must float LATER — acceleration falls as 1/theta^2');
if (!(cam.harsherRamp < cam.baseline))
  fails.push('a harsher ramp at the same lift and duration must float EARLIER');

// ==================================================================== 5. the defect this fixes
// Four presets used to make peak power at the exact rev limiter, which no real engine does,
// because the old valve-float term only fired ABOVE the redline and so never ran at all.
console.log('\n== no engine may make peak power at the exact rev limiter without a reason ==');
const peaks = await page.evaluate(() => PRESETS.map(pr => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  const c = buildTorqueCurve(), pts = c.map(q => ({ rpm: q.rpm, hp: q.tq * q.rpm / 7127 }));
  const pk = pts.reduce((a, x) => x.hp > a.hp ? x : a);
  return { name: pr.name, pct: Math.round(100 * pk.rpm / engine.redline),
    valves: engine.valves, poppet: !!engine.ivDia_mm,
    Zred: engine.ivDia_mm ? +inletMachZ(engine.redline, 320).toFixed(2) : null,
    float: Math.round(engine.floatRpm || 0), redline: engine.redline };
}));
peaks.forEach(p => console.log(`  ${p.name.slice(0, 24).padEnd(25)} peak at ${String(p.pct + '%').padStart(5)} of redline` +
  (p.poppet ? ` · ${p.valves}v · Z=${p.Zred} · float ${p.float}` : ' · no poppet valves')));
const atLimiter = peaks.filter(p => p.pct >= 100);
console.log(`  ${atLimiter.length} preset(s) still peak at the limiter: ${atLimiter.map(p => p.name).join(', ') || 'none'}`);
// Two remain — both well-designed four-valve high-revvers that genuinely are neither port-choked
// nor float-limited. Their peak position is set by intake wave tuning and trapping, which is the
// NEXT conversion, not this one. The budget records that honestly and must not silently grow.
const AT_LIMITER_BUDGET = 2;
if (atLimiter.length > AT_LIMITER_BUDGET)
  fails.push(`${atLimiter.length} presets peak at the limiter, budget is ${AT_LIMITER_BUDGET}: ` +
    atLimiter.map(p => p.name).join(', '));

// a 2-valve big-bore engine must be visibly port-choked; that is why it cannot rev
const twoV = peaks.filter(p => p.poppet && p.valves === 2);
twoV.forEach(p => { console.log(`  2-valve check: ${p.name} Z=${p.Zred} at redline`);
  if (!(p.Zred > 0.5)) fails.push(`${p.name} is 2-valve big-bore but shows no inlet restriction (Z=${p.Zred})`); });

// ==================================================================== 6. engines without poppet valves
console.log('\n== a rotary and a piston-ported two-stroke have no valvetrain to model ==');
const noValves = peaks.filter(p => !p.poppet).map(p => p.name);
console.log(`  skipped correctly: ${noValves.join(', ')}`);
if (noValves.length < 3) fails.push('rotary and two-stroke should have no derived poppet valvetrain');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
