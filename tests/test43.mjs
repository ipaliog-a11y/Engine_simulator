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

// The gap this test exists to close: NOTHING asserted that the straight-line sim and the lap
// solver tell the same story about the same car. They ran independently, so when the lap solver
// lost its rev limiter it happily reported 372 km/h for a car whose own gearing tops out at 259 —
// and every existing test still passed, because each sim was self-consistent.
const TOL = 1.03;   // 3%: the profile is discretised and a descent can nudge a hair past

// ==================================================================== 1. nothing over-revs
console.log('== no sim may exceed the speed the gearing allows ==');
const rows = await page.evaluate(() => {
  const pick = { kei:'1.0 Kei Turbo I3', hatch:'2.0 Turbo Hot-Hatch I4', roadster:'1.6 Sport NA I4',
    coupe:'6.2 Supercharged V8', sedan:'2.0 Turbo Diesel I4', muscle:'5.0 V8 NA Muscle',
    rally:'2.5 Turbo I5 (RS)', gt:'3.0 Turbo I6 (2JZ)', super:'6.5 V12 NA Supercar',
    hyper:'2.0 ITB NA Screamer I4' };
  const out = [];
  for (const [ch, name] of Object.entries(pick)) {
    const pr = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit(ch); buildVehicle();
    const a = simulateAccel(), L = simulateLap('nord');
    const TWO_PI = Math.PI*2, R = vehicle.ratios;
    // The hard ceiling: top gear at the rev limiter. No sim may report more than this.
    const vRed = engine.redline*TWO_PI*vehicle.rTire/60/(R[R.length-1]*vehicle.finalDrive)*3.6;
    out.push({ ch, name, vRed:+vRed.toFixed(1), top:+a.topSpeed.toFixed(1), lapVmax:+L.vMax.toFixed(1),
      q400: a.q400 ? +(a.q400.v*3.6).toFixed(1) : null,
      q1000: a.q1000 ? +(a.q1000.v*3.6).toFixed(1) : null,
      dragLimited: a.topSpeed < vRed - 1 });
  }
  return out;
});
rows.forEach(r => console.log(`  ${r.ch.padEnd(9)} gearing ceiling ${String(Math.round(r.vRed)).padStart(4)}` +
  ` · top ${String(Math.round(r.top)).padStart(4)} · lap max ${String(Math.round(r.lapVmax)).padStart(4)}` +
  ` · traps ${r.q400}/${r.q1000}` + (r.dragLimited ? '  (drag-limited)' : '')));
rows.forEach(r => {
  if (r.top > r.vRed*TOL)     fails.push(`${r.ch}: top speed ${r.top} exceeds the gearing ceiling ${r.vRed}`);
  if (r.lapVmax > r.vRed*TOL) fails.push(`${r.ch}: lap max ${r.lapVmax} exceeds the gearing ceiling ${r.vRed}`);
  if (r.q400 && r.q400 > r.vRed*TOL)   fails.push(`${r.ch}: 400 m trap ${r.q400} exceeds the gearing ceiling ${r.vRed}`);
  if (r.q1000 && r.q1000 > r.vRed*TOL) fails.push(`${r.ch}: 1000 m trap ${r.q1000} exceeds the gearing ceiling ${r.vRed}`);
});

// ==================================================================== 2. the two sims agree
// `topSpeed` is the flat-ground steady state: drive force = drag + rolling resistance. A lap may
// legitimately beat it, but only DOWNHILL, where gravity is doing the extra work — the Nordschleife
// drops 15% in places. So the check is not "never faster than top speed", which would be wrong
// physics; it is "never faster than top speed on a road that isn't falling away".
console.log('\n== the lap may only out-run the flat-ground top speed downhill ==');
const grades = await page.evaluate((names) => names.map(({ch, name}) => {
  const pr = PRESETS.find(x => x.name === name);
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit(ch); buildVehicle();
  const a = simulateAccel(), L = simulateLap('nord');
  const i = L.v.indexOf(Math.max(...L.v));
  return { ch, top:+a.topSpeed.toFixed(1), lapVmax:+L.vMax.toFixed(1),
    gradePct: +(L.track.line[i].sinT*100).toFixed(1) };   // negative = descending
}), rows.map(r => ({ ch:r.ch, name:r.name })));
grades.forEach(g => {
  const over = g.lapVmax > g.top;
  console.log(`  ${g.ch.padEnd(9)} lap max ${String(Math.round(g.lapVmax)).padStart(4)} vs top ` +
    `${String(Math.round(g.top)).padStart(4)} · grade there ${g.gradePct}%` +
    (over ? (g.gradePct < 0 ? '  (over, but downhill — fine)' : '  (OVER ON THE FLAT)') : ''));
  if (over && g.gradePct >= 0)
    fails.push(`${g.ch}: lap reaches ${g.lapVmax} on a ${g.gradePct}% grade but top speed is ${g.top}`);
});

// ==================================================================== 3. gearing is a trade-off
// The bug did more than print a wrong number: with no limiter, short gearing cost nothing on the
// straight, so the app advised the SHORTEST gearing as the fastest way round the Nordschleife.
// A car geared for 196 km/h cannot be the quickest thing down Döttinger Höhe.
console.log('\n== short gearing must cost lap time on a power circuit ==');
const sweep = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '6.2 Supercharged V8');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('coupe');
  const out = [];
  for (const gearing of [0, 20, 40, 60, 80, 100]) {
    document.getElementById('vhGearing').value = gearing; buildVehicle();
    const a = simulateAccel(), L = simulateLap('nord');
    out.push({ gearing, top: Math.round(a.topSpeed), lap: +L.lap.toFixed(1) });
  }
  return out;
});
sweep.forEach(s => console.log(`  gearing ${String(s.gearing).padStart(3)} · top ${String(s.top).padStart(3)} km/h · lap ${s.lap}s`));
const shortest = sweep[0], best = sweep.reduce((a, x) => x.lap < a.lap ? x : a);
console.log(`  shortest gearing ${shortest.lap}s vs best ${best.lap}s at gearing ${best.gearing}`);
if (best.gearing === shortest.gearing)
  fails.push('the shortest gearing is still the fastest lap — the limiter is not biting');
if (shortest.lap - best.lap < 5)
  fails.push(`short gearing only costs ${(shortest.lap-best.lap).toFixed(1)}s on the Nordschleife — too cheap`);
// and top speed must rise monotonically with taller gearing while the car is rev-limited
for (let i = 1; i < sweep.length; i++)
  if (sweep[i].top < sweep[i-1].top)
    fails.push(`top speed fell from gearing ${sweep[i-1].gearing} to ${sweep[i].gearing}`);

// ==================================================================== 4. drag still binds
// The fix must not turn the limiter into the ONLY ceiling: a weak or draggy car should still be
// stopped by drag well below the speed its gearing would allow.
console.log('\n== a weak car must still be drag-limited, not rev-limited ==');
const weak = rows.filter(r => r.dragLimited);
console.log(`  ${weak.length} of ${rows.length} presets are drag-limited: ${weak.map(r=>r.ch).join(', ') || 'none'}`);
if (!weak.length) fails.push('no car is drag-limited any more — drag has stopped binding');

// ==================================================================== 5. still finishes
console.log('\n== a car that cannot reach 200 km/h must not hang or print nonsense ==');
const slow = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '1.0 Kei Turbo I3');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('kei');
  document.getElementById('vhGearing').value = 0; buildVehicle();
  const t0 = performance.now(); const a = simulateAccel(); const ms = performance.now() - t0;
  return { ms: Math.round(ms), t100: a.t100, t200: a.t200, top: Math.round(a.topSpeed) };
});
console.log(`  kei on the shortest gearing: 0-100 ${slow.t100 ? slow.t100.toFixed(2)+'s' : 'n/a'} · ` +
  `0-200 ${slow.t200 === null ? 'not reached (correct)' : slow.t200.toFixed(2)+'s'} · top ${slow.top} · solved in ${slow.ms}ms`);
if (slow.ms > 2000) fails.push(`acceleration sim took ${slow.ms}ms — the limiter may have stalled the loop`);
if (!slow.t100) fails.push('the kei never reaches 100 km/h');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
