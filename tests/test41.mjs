import { chromium } from './pw.mjs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`file://${repo}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const fails = [];

// ==================================================================== 1. calibration against reality
// The one test that can catch a physics regression the unit tests cannot: does the whole
// acceleration model reproduce cars whose real 0-100 is public knowledge?
// Power, kerb weight, drivetrain, tyre class, diff type AND gearbox are all matched to the real
// car first, so what is left under test is the traction/weight-transfer/gearing model alone.
// (Matching the gearbox matters more than it looks: 350 ms of manual shift twice is 0.7 s of the
// run, so quoting a DSG car's time against a modelled manual measures the gearbox, not traction.)
console.log('== acceleration model vs real cars (power, mass, driveline and gearbox all matched) ==');
const ref = await page.evaluate(() => {
  const REF = [
    ['VW Golf GTI (Mk8)',        245, 1450, 6.2,  'hatch', 'fwd', 'sport', 'open', 'dct'],
    ['Honda Civic Type R (FL5)', 329, 1430, 5.4,  'hatch', 'fwd', 'semi',  'clsd', 'manual'],
    ['Toyota Supra RZ (A80)',    326, 1570, 4.9,  'coupe', 'rwd', 'sport', 'clsd', 'manual'],
    ['BMW M2 (G87)',             460, 1725, 4.1,  'coupe', 'rwd', 'semi',  'clsd', 'auto'],
    ['Subaru WRX STI (GD)',      280, 1470, 5.2,  'rally', 'awd', 'sport', 'clsd', 'manual'],
    ['Suzuki Alto Works',         64,  720, 11.0, 'kei',   'fwd', 'eco',   'open', 'manual']
  ];
  return REF.map(([label, hp, kg, realT, ch, drive, tire, diff, gbx]) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 6, bore_mm: 84, stroke_mm: 90,
      compression: 10, redline: 6800, intake: 'turbo', turboSize: 'medium', boost_bar: 0.5,
      octane: 98, injector: 'port', cam: 'sport' }));
    buildEngine();
    applyChassisFit(ch);
    document.getElementById('vhDrive').value = drive;
    document.getElementById('vhTire').value = tire;
    document.getElementById('vhDiff').value = diff;
    document.getElementById('vhGearbox').value = gbx;
    buildVehicle();
    const scale = hp / engine.score.peakHP, realCurve = buildTorqueCurve;
    window.buildTorqueCurve = () => realCurve().map(p => ({ rpm: p.rpm, tq: p.tq * scale }));
    vehicle.mass = kg;
    const p = simulateAccel();
    window.buildTorqueCurve = realCurve;
    return { label, hp, kg, drive, gbx, real: realT, model: +p.t100.toFixed(2),
      err: +((p.t100 / realT - 1) * 100).toFixed(1) };
  });
});
console.log('car                          hp    kg  drive gearbox   real   model    error');
ref.forEach(r => console.log(`${r.label.padEnd(27)} ${String(r.hp).padStart(4)} ${String(r.kg).padStart(5)} ${r.drive.padEnd(5)} ${r.gbx.padEnd(8)} ${String(r.real + 's').padStart(5)} ${String(r.model + 's').padStart(7)} ${String((r.err > 0 ? '+' : '') + r.err + '%').padStart(8)}`));
const rms = Math.sqrt(ref.reduce((s, r) => s + r.err * r.err, 0) / ref.length);
console.log(`RMS error across the set: ${rms.toFixed(2)}%`);
ref.forEach(r => { if (Math.abs(r.err) > 8) fails.push(`${r.label}: ${r.err}% off the real car`); });
if (rms > 5) fails.push(`acceleration model RMS error ${rms.toFixed(2)}% across the reference set`);
// the set must span drivetrains and diffs, or it proves little
if (new Set(ref.map(r => r.drive)).size < 3) fails.push('reference set does not cover fwd/rwd/awd');

// ==================================================================== 2. the traction ceiling
console.log('\n== launch ceiling decomposes the way the guide says it does ==');
const ceil = await page.evaluate(() => ['kei', 'hatch', 'coupe', 'rally'].map(ch => {
  const pr = PRESETS.find(x => x.name === '2.0 Turbo Hot-Hatch I4');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit(ch); buildVehicle();
  const share = vehicle.drive === 'awd' ? 1 : (vehicle.drive === 'rwd' ? 1 - vehicle.fWt : vehicle.fWt);
  const k = vehicle.cg / vehicle.wb, sgn = vehicle.drive === 'rwd' ? 1 : (vehicle.drive === 'awd' ? 0 : -1);
  const dT = vehicle.diffTraction;
  return { label: vehicle.chLabel, drive: vehicle.drive, mu: +vehicle.mu.toFixed(2), dT: +dT.toFixed(2),
    share: +share.toFixed(2), g: +(vehicle.mu * dT * share / (1 - sgn * vehicle.mu * dT * k)).toFixed(2) };
}));
ceil.forEach(c => console.log(`  ${c.label.padEnd(15)} ${c.drive}  mu ${c.mu} x diff ${c.dT} x driven-axle share ${c.share} = ${c.g} g`));
const kei = ceil.find(c => c.label === 'KEI CAR');
if (!(kei.g > 0.25 && kei.g < 0.45)) fails.push(`kei launch ceiling ${kei.g} g is not credible`);
// a front-driver must be capped below a rear-driver, which must be capped below AWD
const byDrive = Object.fromEntries(ceil.map(c => [c.drive, c.g]));
if (!(byDrive.fwd < byDrive.rwd && byDrive.rwd < byDrive.awd))
  fails.push('drivetrain traction ceilings are not ordered fwd < rwd < awd');

// ==================================================================== 3. grip beats power when capped
console.log('\n== on a traction-capped car, grip is worth more than power ==');
const fix = await page.evaluate(() => {
  const base = { cylinders: 3, bore_mm: 73, stroke_mm: 79.6, compression: 9.5, redline: 7000,
    intake: 'turbo', turboSize: 'small', turboConfig: 'single', injector: 'port', octane: 98 };
  const run = (bar, mods) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, { boost_bar: bar })); buildEngine();
    applyChassisFit('kei');
    Object.entries(mods).forEach(([k, v]) => { const e = document.getElementById(k); if (e) e.value = v; });
    buildVehicle();
    return { hp: engine.score.peakHP, t: +perf.t100.toFixed(2) };
  };
  return {
    weak: run(0.7, {}), strong: run(2.5, {}),
    lsd: run(2.5, { vhDiff: 'clsd' }),
    tyres: run(2.5, { vhDiff: 'clsd', vhTire: 'sport' }),
    slicks: run(2.5, { vhDiff: 'clsd', vhTire: 'slick' }),
    awd: run(2.5, { vhDiff: 'clsd', vhTire: 'slick', vhDrive: 'awd' })
  };
});
console.log(`  ${fix.weak.hp} hp factory kei: ${fix.weak.t}s`);
console.log(`  ${fix.strong.hp} hp factory kei: ${fix.strong.t}s   <- ${(fix.strong.hp / fix.weak.hp).toFixed(1)}x the power buys ${(fix.weak.t - fix.strong.t).toFixed(2)}s`);
console.log(`  ${fix.strong.hp} hp + LSD: ${fix.lsd.t}s · + sport tyres: ${fix.tyres.t}s · + slicks: ${fix.slicks.t}s · + AWD: ${fix.awd.t}s`);
// doubling the power on a capped car must do almost nothing...
if (fix.weak.t - fix.strong.t > 0.5) fails.push('the kei is not actually traction-capped — power still helps it');
// ...while grip must transform it
if (!(fix.lsd.t < fix.strong.t - 1)) fails.push('an LSD does not help a traction-capped car');
if (!(fix.slicks.t < fix.lsd.t - 1)) fails.push('tyres do not help a traction-capped car');
if (!(fix.awd.t < fix.slicks.t)) fails.push('AWD does not help a traction-capped car');
if (!(fix.strong.t - fix.awd.t > 4)) fails.push('fixing traction should transform this car, not nudge it');

// ==================================================================== 4. torque-scaled asymmetry
console.log('\n== the open diff recovers in tall gears, and the launch is untouched ==');
const asym = await page.evaluate(() => {
  const o = DIFF.open, c = DIFF.clsd, s = DIFF.spool;
  return {
    openLaunch: +diffTractionAt(o, 0, 0.5, 1).toFixed(3),
    openTall: +diffTractionAt(o, 0, 0.5, 0.2).toFixed(3),
    clsdLaunch: +diffTractionAt(c, 0, 0.5, 1).toFixed(3),
    clsdTall: +diffTractionAt(c, 0, 0.5, 0.2).toFixed(3),
    spoolLaunch: +diffTractionAt(s, 0, 0.5, 1).toFixed(3),
    spoolTall: +diffTractionAt(s, 0, 0.5, 0.2).toFixed(3),
    // cornering behaviour must be unchanged
    openCorner: +diffTractionAt(o, 8, 0.5, 1).toFixed(3),
    legacy: +lapDiffTraction(o, 8, 0.5).toFixed(3)
  };
});
console.log(`  open  ${asym.openLaunch} at launch -> ${asym.openTall} in a tall gear`);
console.log(`  LSD   ${asym.clsdLaunch} -> ${asym.clsdTall} · spool ${asym.spoolLaunch} -> ${asym.spoolTall}`);
// The launch figure is the quoted DIFF.traction, exactly — that is what keeps the drag-strip
// model and every saved build identical.
if (Math.abs(asym.openLaunch - 0.78) > 1e-6) fails.push('open diff launch traction is no longer the quoted figure');
if (!(asym.openTall > asym.openLaunch + 0.1)) fails.push('open diff does not recover in a tall gear');
if (Math.abs(asym.spoolTall - asym.spoolLaunch) > 1e-6) fails.push('a spool should not care about gearing — it is welded');
if (!(asym.clsdTall - asym.clsdLaunch < asym.openTall - asym.openLaunch))
  fails.push('an LSD should gain less from tall gearing than an open diff');
if (Math.abs(asym.openCorner - asym.legacy) > 1e-6) fails.push('cornering diff behaviour changed');

// ==================================================================== 5. the diff trade survives
const trade = await page.evaluate(() => ['open', 'clsd', 'spool'].map(d => {
  const pr = PRESETS.find(x => x.name === '6.2 Supercharged V8');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('muscle'); document.getElementById('vhDiff').value = d; buildVehicle();
  return { d, t100: +perf.t100.toFixed(2), lap: +simulateLap('tech').lap.toFixed(2) };
}));
console.log('\ndiff trade:', trade.map(t => `${t.d} 0-100 ${t.t100}s lap ${t.lap}s`).join(' | '));
const T = Object.fromEntries(trade.map(t => [t.d, t]));
if (!(T.spool.t100 < T.clsd.t100)) fails.push('spool no longer wins the standing start');
if (!(T.spool.lap > T.clsd.lap)) fails.push('spool no longer loses on a lap');
if (!(T.open.t100 > T.clsd.t100)) fails.push('open diff no longer loses off the line');

// ==================================================================== 6. guide + no dead code
const guide = await page.evaluate(() => (document.querySelector('[data-gk="vehicle"]') || {}).textContent || '');
if (!/only drives the front axle|drives the front axle/.test(guide)) fails.push('English guide does not explain the FWD traction ceiling');
if (!/0\.33/.test(guide)) fails.push('English guide does not quote the measured ceiling');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(250);
const guideEl = await page.evaluate(() => (document.querySelector('[data-gk="vehicle"]') || {}).textContent || '');
if (!/προσθιοκίνητο/.test(guideEl)) fails.push('Greek guide does not explain the FWD traction ceiling');
await page.evaluate(() => applyLang('en'));
const dead = await page.evaluate(() => typeof muLong);
if (dead !== 'undefined') fails.push('muLong is still defined');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
