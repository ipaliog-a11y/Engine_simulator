import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
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
const fastestTop = sweep.reduce((a, x) => x.top > a.top ? x : a);
console.log(`  shortest gearing ${shortest.lap}s vs best ${best.lap}s at gearing ${best.gearing}`);
console.log(`  top speed peaks at gearing ${fastestTop.gearing} (${fastestTop.top} km/h)`);

// REWRITTEN when the final drive stopped being a slider.
//
// This block used to assert that top speed rises MONOTONICALLY with the gearing slider, and that
// the shortest setting costs 5+ seconds on the Nordschleife. Both were true only because the
// slider set the final drive outright — lerp(4.9, 2.6, gearing/100) — so every car got the same
// ratio regardless of its redline and the short end was absurdly, unusably short for most engines.
//
// The final drive is now derived (peak power placed at the drag-limited top speed) and the slider
// biases about it. Two consequences, and both are better physics:
//   · Top speed has an INTERIOR OPTIMUM. Gearing taller than optimal does not keep raising top
//     speed, it lowers it, because the engine can no longer reach the power it needs at that road
//     speed. A monotonic rise was only ever visible because the baseline started far too short.
//   · Mis-gearing costs far less on a 20 km circuit, because the slider can no longer produce an
//     absurd ratio. On the Nordschleife a short-geared car trades top speed it rarely uses for
//     acceleration it uses constantly, so the shortest setting being competitive is correct.
// What is asserted now is the optimum itself, which is a stronger claim than monotonicity.
if (!(fastestTop.gearing > sweep[0].gearing && fastestTop.gearing < sweep[sweep.length - 1].gearing))
  fails.push(`top speed should peak at an interior gearing, not at an end (peaked at ${fastestTop.gearing})`);
for (const s2 of sweep)
  if (s2.top > fastestTop.top) fails.push('top-speed optimum search is inconsistent');
// Falling off on BOTH sides is what makes it an optimum rather than a plateau.
if (!(sweep[0].top < fastestTop.top - 5))
  fails.push(`short gearing should cost top speed (${sweep[0].top} vs ${fastestTop.top})`);
// (4 km/h: since build 116 the power curves are flatter over the top, so over-gearing costs a little less)
if (!(sweep[sweep.length - 1].top <= fastestTop.top - 4))
  fails.push(`tall gearing should cost top speed too (${sweep[sweep.length-1].top} vs ${fastestTop.top})`);
// Gearing still has to MATTER somewhere, or the slider is inert.
const topSpread = fastestTop.top - Math.min(...sweep.map(x => x.top));
if (!(topSpread > 15)) fails.push(`gearing barely moves top speed (${topSpread} km/h across the slider)`);

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
