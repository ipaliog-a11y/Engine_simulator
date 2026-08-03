// Turbine housing sizing — the investigation, parked with its findings.
//
//   node tests/proto/housing.mjs
//
// Not run by the suite (run.mjs only walks tests/*.mjs). Unlike slip.mjs and turbo.mjs this one is
// not standalone: it measures the SHIPPED model through the browser, because the whole point is
// what the app currently does, not what a clean-room model would do.
//
// ---------------------------------------------------------------------------------------------
// THE DEFECT
//
// engine.turbineArea = (A/R) x R_wheel, and A/R comes from the frame size class alone — small 0.42,
// medium 0.64, large 0.86. Nothing about the engine enters. A 2.0 four and a 6.6 V8 fitted with the
// same size class get the SAME turbine throat, which is not how anyone matches a turbo.
//
// Measured (build 69), boost threshold = lowest rpm reaching 50% of target boost. The tables below
// are a SNAPSHOT; running the script measures whatever build is checked out, so the numbers drift as
// physics lands. They already have: build 70 charges exhaust pumping work, which moved the BP-ratio
// column (the kei 1.09 -> 1.02) and took a few g/s off every flow figure. The spool column and the
// 4x throat spread — the two things this investigation is about — did not move.
//
//   preset                    disp   frame   A/R   throat   spool   real   error   BP ratio
//   1.0 Kei Turbo I3          1.0L  small   0.42   259mm2   3975   2800   +1175   1.09
//   1.5 Turbo Eco I4          1.5L  small   0.42   259mm2   2925   1600   +1325   1.17
//   2.0 Turbo Hot-Hatch I4    2.0L  medium  0.64   519mm2   3625   1900   +1725   1.10
//   2.5 Turbo I5 (RS)         2.5L  medium  0.64   519mm2   3125   2000   +1125   1.21
//   3.0 Turbo I6 (2JZ)        3.0L  medium  0.64   519mm2   2800   3600    -800   1.33
//   2.0 Turbo Diesel I4       2.0L  medium  0.64   519mm2   3750   1800   +1950   0.97
//   6.6 V8 Turbodiesel        6.6L  medium  0.64   519mm2   1700   1600    +100   1.85
//   1.3 Rotary Turbo (13B)    0.8L  medium  0.64   519mm2   7275   3000   +4275   0.93
//
// RMS error ~1940 rpm. The 13B lights at 7275 rpm against a real ~3000. Exhaust flow per mm2 of
// throat spans 202 to 799 g/s across the set — a 4x spread, which is the defect stated as a number:
// a matched set would be roughly constant. The 6.6 V8 is the only one close, and it is close by
// accident (its flow happens to suit the one throat on offer, at BP ratio 1.85).
//
// ---------------------------------------------------------------------------------------------
// THE REPLACEMENT, AND WHAT THE SWEEP SAYS
//
// A real builder picks the TIGHTEST housing the engine can tolerate at rated power: tighter spools
// earlier and costs back-pressure. Sizing to a back-pressure limit instead of a size class:
//
//   target   RMS error (rpm)   petrol only   diesel only
//   1.2           1262            1247          1307
//   1.5            832             788           952
//   1.8            699             697           708      <- best for petrol
//   2.2            804             893           442
//   2.6           1010            1153           301
//   3.0           1170            1343           246      <- diesel still improving
//
// Two results:
//
//   1. The criterion WORKS — RMS 1940 -> ~700, and it needs no per-frame table.
//   2. Petrol and diesel want clearly different limits, and that split should NOT be asserted as a
//      per-type constant. What stops a petrol engine going tighter is KNOCK: back-pressure raises
//      the trapped residual fraction, and hot residual brings on knock. A diesel has no spark-knock
//      limit at all, which is exactly why real turbodiesel housings are tight and why they make
//      boost at 1600 rpm. The split should fall out of the knock model.
//
// ---------------------------------------------------------------------------------------------
// WHY IT IS PARKED (two prerequisites, both since identified by measurement)
//
//   1. PUMPING WORK. pumpFrictionMEP charged only for intake depression against atmosphere — the
//      pumping loop with p_exhaust assumed to be 1 bar. So a tight housing cost NOTHING at the top
//      end and nothing pushed back on tightening it. SHIPPED in build 70.
//   2. RESIDUAL-GAS KNOCK. knockAt() carries boost, compression, IAT, coolant, rpm, timing, lambda,
//      octane, DI and nitrous — and no residual term. Conversion 3 already computes residual
//      fraction from (p_exh/p_int)^(1/gamma) for VE, but it never reaches knock, so the petrol
//      limit does not exist. NOT YET BUILT — this is the next step.
//
// ---------------------------------------------------------------------------------------------
// ANCHOR QUALITY — read before tuning anything to these numbers
//
// Solid, published: VW 2.0 TDI ~1750, Duramax 1600, Focus RS 2.5T ~2000, kei turbos ~2800-3000.
// Interpretation-dependent, weight lightly: the 2JZ 3600 (a big single behaves nothing like the
// factory sequential) and the 13B 3000 (primary rotor only). Tuning to a number someone invented is
// the trap test46's bands already fell into once.
import { chromium } from '../pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const REAL = {
  '1.0 Kei Turbo I3': 2800, '1.5 Turbo Eco I4': 1600, '2.0 Turbo Hot-Hatch I4': 1900,
  '2.5 Turbo I5 (RS)': 2000, '3.0 Turbo I6 (2JZ)': 3600, '2.0 Turbo Diesel I4': 1800,
  '6.6 V8 Turbodiesel': 1600, '1.3 Rotary Turbo (13B)': 3000,
};
const TARGETS = [1.2, 1.5, 1.8, 2.2, 2.6, 3.0];

const out = await page.evaluate(({ REAL, TARGETS }) => {
  const rows = [];
  for (const pr of PRESETS) {
    const nm = pr.name;
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    if (engine.intake !== 'turbo') continue;
    const rl = engine.redline, baseArea = engine.turbineArea, ratedRpm = rl * 0.9;
    const T3 = exhaustGasT(1);

    const spoolAt = area => {
      engine.turbineArea = area;
      for (let r = 800; r <= rl; r += 25) if (steadyBoost(r) >= 0.5 * engine.maxBoost) return r;
      return null;
    };
    const bpAt = area => {
      engine.turbineArea = area;
      const b = steadyBoost(ratedRpm);
      const mAir = airFlowAt(ratedRpm, 1 + b), mEx = mAir * 1.06;
      return manifoldPR(mAir / (engine.turbUnits || 1), mEx, 1 + b, T3, area, engine.compEff) / (1 + b);
    };

    const bNow = steadyBoost(engine.score ? engine.score.peakHPrpm : ratedRpm);
    const mAirNow = airFlowAt(engine.score ? engine.score.peakHPrpm : ratedRpm, 1 + bNow);
    const sweep = TARGETS.map(target => {
      // tightest throat whose rated-power back-pressure ratio stays at or under `target`
      let lo = baseArea * 0.15, hi = baseArea * 3.0;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bpAt(m) > target) lo = m; else hi = m; }
      return { target, area_mm2: hi * 1e6, spool: spoolAt(hi) };
    });
    engine.turbineArea = baseArea;

    rows.push({ nm, disp: engine.displacement_L, ci: !!engine.ci, frame: engine.turboSize,
      ar: (TURBO[engine.turboSize] || TURBO.medium).ar, base_mm2: baseArea * 1e6,
      mEx: mAirNow * 1.06, spoolNow: spoolAt(baseArea), bpNow: bpAt(baseArea),
      real: REAL[nm] ?? null, sweep });
  }
  return rows;
}, { REAL, TARGETS });
await browser.close();

console.log('=== 1. what the size-class A/R gives now ===');
console.log('  preset                     disp   frame   A/R   throat   spool   real   error   BP ratio');
for (const r of out) {
  const err = r.real && r.spoolNow ? `${r.spoolNow > r.real ? '+' : ''}${r.spoolNow - r.real}` : '?';
  console.log(`  ${r.nm.padEnd(26)} ${r.disp.toFixed(1)}L  ${r.frame.padEnd(6)} ${r.ar.toFixed(2)}  ` +
    `${r.base_mm2.toFixed(0).padStart(4)}mm2  ${String(r.spoolNow ?? '-').padStart(5)}  ` +
    `${String(r.real ?? '-').padStart(5)}  ${String(err).padStart(6)}   ${r.bpNow.toFixed(2)}`);
}

console.log('\n=== 2. the same throat on very different engines ===');
console.log('  preset                     throat   mEx@peak   flow per mm2');
for (const r of out)
  console.log(`  ${r.nm.padEnd(26)} ${r.base_mm2.toFixed(0).padStart(4)}mm2  ${(r.mEx * 1000).toFixed(0).padStart(5)} g/s   ` +
    `${(r.mEx * 1e6 / r.base_mm2).toFixed(2)} g/s per mm2`);
console.log('  A matched set would be roughly constant. It is not — that IS the defect.');

console.log('\n=== 3. spool point when the housing is sized to a back-pressure limit instead ===');
console.log('  preset                      real  ' + TARGETS.map(t => ('BP' + t.toFixed(1)).padStart(7)).join(''));
for (const r of out)
  console.log(`  ${r.nm.padEnd(26)} ${String(r.real ?? '-').padStart(5)}  ` +
    r.sweep.map(s => String(s.spool ?? 'none').padStart(7)).join('') + (r.ci ? '   [diesel]' : ''));

console.log('\n=== 4. error against the published thresholds ===');
console.log('  target   RMS error (rpm)   petrol only   diesel only');
const rms = (i, f) => {
  const es = out.filter(f).filter(r => r.real && r.sweep[i].spool).map(r => r.sweep[i].spool - r.real);
  return es.length ? Math.sqrt(es.reduce((a, b) => a + b * b, 0) / es.length) : NaN;
};
{
  const es = out.filter(r => r.real && r.spoolNow).map(r => r.spoolNow - r.real);
  console.log(`  (now)    ${Math.sqrt(es.reduce((a, b) => a + b * b, 0) / es.length).toFixed(0).padStart(9)}`);
}
TARGETS.forEach((t, i) => console.log(`  ${t.toFixed(1)}      ${rms(i, () => true).toFixed(0).padStart(9)}     ` +
  `${rms(i, r => !r.ci).toFixed(0).padStart(9)}     ${rms(i, r => r.ci).toFixed(0).padStart(9)}`));
console.log('\n  Petrol and diesel wanting different limits is the knock ceiling talking. Derive the');
console.log('  split from residual-gas knock, do not assert it as a per-type constant.');
