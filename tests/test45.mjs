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

// ==================================================================== 1. Crr vs published data
// Rolling resistance is not constant: hysteresis grows with how fast the carcass is deformed, so
// Crr climbs roughly with v^2. Checked against Michelin passenger-tyre figures, not against this
// simulator's own outputs.
console.log('== rolling resistance must follow the published Crr-vs-speed curve ==');
const crr = await page.evaluate(() => [0, 80, 120, 160, 200, 300].map(kmh =>
  ({ kmh, crr: +crrAt(0.010, kmh / 3.6).toFixed(4) })));
const REAL = { 80: 0.010, 160: 0.013, 200: 0.016 };     // Michelin, touring tyre
crr.forEach(c => {
  const r = REAL[c.kmh];
  console.log(`  ${String(c.kmh).padStart(3)} km/h -> Crr ${c.crr.toFixed(4)}` + (r ? `   (real ${r})` : ''));
  if (r && Math.abs(c.crr - r) > 0.0006) fails.push(`Crr at ${c.kmh} km/h is ${c.crr}, real is ${r}`);
});
const at = k => crr.find(c => c.kmh === k).crr;
if (!(at(300) > at(80) * 2)) fails.push('Crr barely grows with speed — the v^2 hysteresis term is not biting');
if (!(at(0) < at(80))) fails.push('Crr at a standstill should be below the 80 km/h reference value');

// ==================================================================== 2. it reaches the solvers
// Proving this needs care. Monkey-patching crrAt does nothing (it is a const at script scope, not
// a window property), and a rev-limited car cannot show a Crr effect at all because its top speed
// is set by gearing. So: take a car that really is DRAG-limited, solve its terminal velocity twice
// in closed form — once with constant Crr, once with Crr(v) — and check which one the sim agrees
// with. Only the speed-dependent answer should match.
console.log('\n== the speed-dependent Crr must actually reach the top-speed solver ==');
const reach = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '1.0 Kei Turbo I3');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('kei'); document.getElementById('vhGearing').value = 100; buildVehicle();
  const R = vehicle.ratios, tot = R[R.length - 1] * vehicle.finalDrive;
  const vRed = engine.redline * Math.PI * 2 * vehicle.rTire / 60 / tot * 3.6;
  const top = simulateAccel().topSpeed, v = top / 3.6;
  // Best wheel force available at exactly that speed, across all gears — the same quantity the
  // top-speed scan balances against resistance.
  const curve = buildTorqueCurve();
  const tqAt = rpm => { if (rpm <= curve[0].rpm) return curve[0].tq;
    for (let i = 1; i < curve.length; i++) if (rpm <= curve[i].rpm) {
      const a = curve[i-1], b = curve[i]; return a.tq + (b.tq-a.tq)*(rpm-a.rpm)/(b.rpm-a.rpm); }
    return curve[curve.length-1].tq; };
  let F = 0;
  for (const g of R) { const t = g * vehicle.finalDrive;
    const rpm = v * t / vehicle.rTire * 60 / (2*Math.PI);
    if (rpm > engine.redline) continue;
    F = Math.max(F, tqAt(Math.max(engine.idleRpmEff, rpm)) * t * vehicle.driveEff / vehicle.rTire); }
  const drag = 0.5 * AIR_RHO * vehicle.cdA * v * v;
  return { top: +top.toFixed(1), vRed: +vRed.toFixed(1), F: Math.round(F), drag: Math.round(drag),
    rollConst: Math.round(vehicle.crr * vehicle.mass * G),
    rollVary:  Math.round(crrAt(vehicle.crr, v) * vehicle.mass * G) };
});
const needConst = reach.drag + reach.rollConst, needVary = reach.drag + reach.rollVary;
console.log(`  drag-limited at ${reach.top} km/h (gearing ceiling ${reach.vRed}, well clear)`);
console.log(`  wheel force there ${reach.F} N  ·  needs ${needConst} N with constant Crr  ·  ${needVary} N with Crr(v)`);
if (reach.top >= reach.vRed - 1)
  fails.push('the test car came out rev-limited, so it cannot demonstrate anything about Crr');
if (!(reach.rollVary > reach.rollConst * 1.3))
  fails.push(`rolling resistance at ${reach.top} km/h is ${reach.rollVary} N vs ${reach.rollConst} N static — the v^2 term is not doing anything`);
// The scan stops at the last speed the car can still hold, so available force must clear the
// speed-dependent requirement but NOT by the margin a constant Crr would have left.
if (reach.F < needVary)
  fails.push(`at its own top speed the car cannot overcome Crr(v) resistance (${reach.F} < ${needVary} N)`);
if (reach.F - needVary > reach.rollVary - reach.rollConst)
  fails.push('force margin at top speed is bigger than the Crr(v) penalty — the solver is still using a constant Crr');

// ==================================================================== 3. speed rating
// Deliberately NOT a silent top-speed cap. Four of the cars in aero.mjs stop short of their
// drag-limited speed because of a manufacturer governor; capping them with a tyre rating would
// give the right number through the wrong mechanism. The rating is reported, and exceeding it is
// called out, but the physics is left alone.
console.log('\n== a tyre rating warns, and must NOT quietly cap top speed ==');
const rating = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '6.5 V12 NA Supercar');
  const run = r => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit('super'); if (r) document.getElementById('vhRating').value = r; buildVehicle();
    return { top: Math.round(simulateAccel().topSpeed), rated: vehicle.ratedKmh, code: vehicle.speedRating }; };
  return { high: run('YY'), low: run('H') };
});
console.log(`  (Y) 340+ rated: top ${rating.high.top} km/h, rated ${rating.high.rated}`);
console.log(`  H 210 rated:    top ${rating.low.top} km/h, rated ${rating.low.rated}` +
  (rating.low.top > rating.low.rated ? '  <-- exceeds, and is flagged' : ''));
if (rating.low.top !== rating.high.top)
  fails.push('fitting a lower-rated tyre changed the top speed — the rating must not act as a hidden cap');
if (!(rating.low.top > rating.low.rated))
  fails.push('an H-rated tyre on a 350 km/h supercar should be flagged as exceeded');
const warned = await page.evaluate(() => {
  const el = document.querySelector('#perfGrid') || document.body;
  return /TYRE SPEED RATING EXCEEDED/i.test(el.textContent || '');
});
console.log(`  warning shown in the performance panel: ${warned}`);
if (!warned) fails.push('the performance panel does not surface the exceeded rating');

// ==================================================================== 4. compound defaults
console.log('\n== each compound carries the rating it is really sold in ==');
const comp = await page.evaluate(() => Object.entries(TIRE_TYPE).map(([k, t]) =>
  ({ k, rating: t.rating, kmh: SPEED_RATING[t.rating].kmh, crr: t.crr })));
comp.forEach(c => console.log(`  ${c.k.padEnd(7)} ${String(c.rating).padStart(2)} = ${c.kmh} km/h · Crr ${c.crr}`));
const get = k => comp.find(c => c.k === k);
if (!(get('drag').kmh < get('eco').kmh))
  fails.push('a drag radial should be rated LOWER than a touring tyre — soft sidewall, not built for sustained speed');
if (!(get('semi').kmh > get('street').kmh))
  fails.push('a semi-slick should out-rate a street tyre');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
