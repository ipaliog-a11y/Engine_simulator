// Exhaust pulse energy at the turbine.
//
// WHY THIS EXISTS. The turbine was a nozzle fed by the MEAN manifold flow. A real one is fed by each
// cylinder's blowdown, and the same mass does more work arriving in bursts, because nozzle work rises
// with pressure ratio. Without that the turbine was under-credited exactly at low flow, which is why
// turbine housing sizing could not find a housing that spooled early without choking the top end.
//
// The model is two states defined by MASS (blowdown share f_b in duty phi, the rest in 1 - phi), so
// these checks are structural: mass conserved, work only ever added, the gain fading as flow rises,
// a tight manifold and divided scrolls keeping more of it, ported engines left on the mean. Plus the
// solver it all rests on, against the bisection it replaced.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const load = (nm, over) => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === nm).engine, over || {})); buildEngine(); };
  const out = {};

  // 1. the solver: same root as the 60-step bisection it replaced
  const ref = (mdot, area, T0) => { if (!(area > 0) || !(mdot > 0)) return 1;
    const f = pr => area * (pr * 101325) / Math.sqrt(Math.max(300, T0)) * nozzleFlux(pr) - mdot;
    let lo = 1.0001, hi = 8; if (f(hi) < 0) return hi; if (f(lo) > 0) return 1;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return lo; };
  let worst = 0, n = 0;
  for (const area of [5e-5, 2e-4, 6e-4, 1.5e-3]) for (const T of [600, 900, 1200])
    for (let m = 0.001; m < 1.2; m *= 1.15) { worst = Math.max(worst, Math.abs(turbineManifoldPR(m, area, T) - ref(m, area, T))); n++; }
  out.solver = { worst, n };

  // 2-3. on the 2.0 hot hatch: gain >= 1 everywhere, fading as flow rises; mass conserved
  load('2.0 Turbo Hot-Hatch I4');
  const e = engine, A = e.turbineArea;
  out.gain = [1500, 2500, 3500, 5000, 7000].map(rpm => {
    const map = 1 + boostAvail(rpm), mEx = airFlowAt(rpm, map) * 1.06 / (e.turbUnits || 1), T = egtAt(rpm, map);
    const pr = turbineManifoldPR(mEx, A, T), s = pulseShape(mEx, A, T, map, pr);
    const mHi = mEx * (1 + s.keep * (s.fb / s.phi - 1)), mLo = mEx * (1 + s.keep * ((1 - s.fb) / (1 - s.phi) - 1));
    return { rpm, g: turbinePower(mEx, A, T, map).P / (mEx * turbineWorkMean(pr, T)),
      massErr: Math.abs(s.phi * mHi + (1 - s.phi) * mLo - mEx) / mEx, fb: s.fb, keep: s.keep, phi: s.phi };
  });

  // 4. a tighter manifold keeps more of the pulse (same engine, half the primary length)
  const at = 2500, map = 1 + boostAvail(at), mEx = airFlowAt(at, map) * 1.06, T = egtAt(at, map);
  const P1 = turbinePower(mEx, A, T, map).P, L = e.primL;
  e.primL = L / 2; const P2 = turbinePower(mEx, A, T, map).P; e.primL = L;
  out.manifold = { full: P1, half: P2 };

  // 5. divided: a twin on a six sees three cylinders per turbine, so its pulses are separated
  load('3.0 Turbo I6 (2JZ)', { turboConfig: 'single' });
  const single = pulseShape(0.05, engine.turbineArea, 1100, 1.5).phi;
  load('3.0 Turbo I6 (2JZ)', { turboConfig: 'twin' });
  const twin = pulseShape(0.025, engine.turbineArea, 1100, 1.5).phi;
  out.divided = { single, twin };

  // 6. ported engines have no cam to time a blowdown from
  load('1.3 Rotary Turbo (13B)');
  out.ported = pulseShape(0.05, engine.turbineArea, 1100, 1.5);

  // 7. steady boost never FALLS as rpm rises below the target — the first prototype's clamp made a
  //    kei read 0.19 bar at 1500 and 0.12 at 2000 by inventing mass at the low state
  // The ARCHETYPE presets only (build 96): this check carries budgets and named lists written for the
  // model's own preset set. Real engines (PRESETS with `real`) are compared, and run against the same
  // sanity checks with their own named anomaly list, in test60.
  out.mono = PRESETS.filter(p => !p.real && p.engine.intake === 'turbo').map(p => {   // archetypes; real engines: test60
    load(p.name); let prev = -1, bad = null;
    for (let rpm = 1000; rpm <= engine.redline; rpm += 250) { const b = steadyBoost(rpm);
      if (b < prev - 1e-3 && prev < engine.maxBoost - 1e-3) { bad = rpm; break; } prev = b; }
    return { n: p.name, bad };
  });
  return out;
});

console.log(`== nozzle solver: ${r.solver.n} cases, worst |ΔPR| vs the old bisection ${r.solver.worst.toExponential(2)} ==`);
if (!(r.solver.worst < 1e-8)) fails.push(`the nozzle solver no longer finds the bisection's root (worst ${r.solver.worst})`);

console.log('\n== pulses add work, mostly where flow is low (2.0 hot hatch) ==');
for (const g of r.gain) console.log(`  ${String(g.rpm).padStart(5)} rpm  work ×${g.g.toFixed(3)}  (f_b ${g.fb.toFixed(2)}, duty ${g.phi.toFixed(2)}, pulse kept ${g.keep.toFixed(2)})  mass error ${g.massErr.toExponential(1)}`);
for (const g of r.gain) {
  if (g.g < 1 - 1e-9) fails.push(`pulses cost turbine work at ${g.rpm} rpm (×${g.g.toFixed(3)})`);
  if (g.massErr > 1e-9) fails.push(`the two pulse states do not conserve mass at ${g.rpm} rpm`);
  if (!(g.fb > 0.2 && g.fb < 0.95)) fails.push(`blowdown share ${g.fb.toFixed(2)} at ${g.rpm} rpm is not physical`);
}
if (!(r.gain[0].g > r.gain[r.gain.length - 1].g)) fails.push('the pulse gain should fade as flow rises');

console.log(`\n== a tight manifold delivers the pulse, a plenum smooths it: ${(r.manifold.full / 1000).toFixed(2)} kW -> ${(r.manifold.half / 1000).toFixed(2)} kW at half the primary length ==`);
if (!(r.manifold.half > r.manifold.full)) fails.push('halving the manifold volume should keep more of the pulse');

console.log(`== divided turbines separate the pulses: duty ${r.divided.single.toFixed(2)} single -> ${r.divided.twin.toFixed(2)} twin ==`);
if (!(r.divided.twin < r.divided.single)) fails.push('two turbines on a six should each see better-separated pulses');

console.log(`== ported engines stay on the mean: ${r.ported === null ? 'yes' : 'NO'} ==`);
if (r.ported !== null) fails.push('a ported engine has no cam to time a blowdown from');

const bad = r.mono.filter(m => m.bad);
console.log(`== steady boost never falls with rpm below target: ${r.mono.length - bad.length}/${r.mono.length} turbo presets ==`);
for (const m of bad) fails.push(`${m.n}: steady boost falls at ${m.bad} rpm before reaching target`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
