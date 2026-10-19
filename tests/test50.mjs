// THE SHIFT POINT — the acceleration run has to drive the car the way a driver would.
//
// WHY THIS EXISTS. Until build 81 simulateAccel upshifted on one condition, rpm >= redline, in every
// gear of every car. Found while checking that VGT had not made anything worse: the Golf TDI got
// slower to 100 on a strictly better engine. Its torque collapses long before the 4800 rpm limiter,
// so the run spent its time in exactly the part of the curve the VGT gives up. Two properties that
// any honest shift rule has, and the old one had neither:
//
//   1. TAKING REVS AWAY CANNOT MAKE A CAR QUICKER. A lower redline only removes shift points the
//      driver could already have used. Under the old rule, cutting the TDI's redline from 4800 to
//      3800 made it 29% quicker to 100 km/h while losing 12 hp — that is the shift rule talking.
//   2. 0-100 IS SMOOTH IN FINAL DRIVE, apart from one step per extra shift. A small change of gearing
//      is a small change of time, except where it forces one more shift before 100 km/h — and that
//      step is one shift long. The old rule saw-toothed by +-1.4 s across 3.0-4.8:1.
//
// The rule now is the wheel-torque crossover — upshift when the next gear pulls harder at this road
// speed — which is what simulateLap's bestGear already did. Neither property is asserted directly
// against a formula: both are measured off the real integrator.
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

// A torquey diesel (where the old rule was worst), a turbo petrol, and a peaky NA screamer (where
// the crossover sits right up at the limiter, so the new rule must change almost nothing).
const ENGINES = [
  ['2.0 TDI', { type: 'diesel', cylinders: 4, bore_mm: 81, stroke_mm: 95.5, compression: 16.2,
    redline: 4800, intake: 'turbo', boost_bar: 1.3, turboSize: 'small', vgt: true, injector: 'direct',
    intakeSys: 'efi', intercooler: 'large', exhaust: 'stock' }],
  ['preset: 2.0 Turbo Hot-Hatch I4', null],
  ['preset: 2.0 ITB NA Screamer I4', null],
];

const run = await page.evaluate(ENGINES => {
  const build = (spec, over) => {
    const base = spec.preset ? PRESETS.find(p => p.name === spec.preset).engine : spec.eng;
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, over || {})); buildEngine();
    applyChassisFit('hatch');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('vhDrive', 'fwd'); set('vhTire', 'sport'); set('vhGearbox', 'manual'); set('vhGears', 6); set('vhDiff', 'open');
    buildVehicle(); vehicle.mass = 1375;
  };
  return ENGINES.map(([nm, eng]) => {
    const spec = eng ? { eng } : { preset: nm.replace('preset: ', '') };
    build(spec);
    const rl = engine.redline;
    const full = simulateAccel().t100;
    // 1. Shorter rev range, everything else equal — including the final drive, so this measures the
    //    shift rule and not buildVehicle re-deriving the gearing for a different power peak.
    const fd = vehicle.finalDrive;
    build(spec, { redline: Math.round(rl * 0.8) }); vehicle.finalDrive = fd;
    const cut = simulateAccel().t100;
    // 2. Sweep the final drive.
    build(spec);
    const sweep = [];
    for (let k = 0.80; k <= 1.401; k += 0.05) { vehicle.finalDrive = fd * k; sweep.push(+simulateAccel().t100.toFixed(2)); }
    return { nm, rl, full: +full.toFixed(2), cut: +cut.toFixed(2), sweep, shift: vehicle.shiftTime || GEARBOX.manual.shift };
  });
}, ENGINES);

console.log('engine                            redline   0-100   at 80% redline   change');
for (const r of run)
  console.log(`${r.nm.padEnd(33)} ${String(r.rl).padStart(7)} ${String(r.full).padStart(7)} ${String(r.cut).padStart(16)} ` +
    `${((r.cut / r.full - 1) * 100).toFixed(1).padStart(7)}%`);
// Quantisation is real: a shorter range can force one extra shift before the mark, which a
// different shift point would not. Allow 3% of slack for that, and no more. The old rule failed
// this by 29% on the TDI.
for (const r of run)
  if (r.cut < r.full * 0.97)
    fails.push(`${r.nm}: cutting the redline to 80% made it ${((1 - r.cut / r.full) * 100).toFixed(1)}% QUICKER — the shift rule is leaving time on the table`);

console.log('\n0-100 across final drive 0.80x .. 1.40x of derived:');
for (const r of run) {
  // Largest jump between neighbouring 5% steps of final drive.
  let worst = 0;
  for (let i = 1; i < r.sweep.length; i++) worst = Math.max(worst, Math.abs(r.sweep[i] - r.sweep[i - 1]));
  r.jump = worst;
  console.log(`  ${r.nm.padEnd(33)} ${r.sweep.join(' ')}   worst step ${worst.toFixed(2)} s`);
}
// There IS one genuine discontinuity in 0-100 against gearing, and it is not small: when a taller
// final drive pushes the 100 km/h mark into the next gear, the run has to make one more shift, and
// that costs one shift's drive cut plus the revs and boost lost across it. Measured here it is
// 0.42-0.45 s on a 0.35 s manual. So steps are bounded by ONE SHIFT plus that loss, not by a
// percentage. The old redline rule stepped 1.45 s on the TDI — four shifts' worth, which is no shift
// at all but the run being parked in the wrong part of the curve.
for (const r of run)
  if (r.jump > r.shift + 0.15)
    fails.push(`${r.nm}: 0-100 steps ${r.jump.toFixed(2)} s for a 5% change of final drive — more than one shift (${r.shift} s) can explain`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
