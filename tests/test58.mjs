// What rolls a turbo engine off at the top, derived — and turboChoke gone.
//
// WHY THIS EXISTS. `turboChoke` was a fitted VE taper of 2.5-10% per frame from the VE peak to the
// redline, standing in for "boost taper". Retiring it took four things, each checked here:
//   · turbine efficiency from its BLADE SPEED RATIO U/C (Watson & Janota): at high flow with the gate
//     open, C is small while the shaft still spins fast, efficiency falls and back-pressure rises —
//     before this, a wastegated turbine made its compressor's power from so little expansion that
//     manifold pressure sat BELOW boost;
//   · compressor efficiency AT THE OPERATING POINT for the charge temperature, not one design figure;
//   · the knock score's rich step (lambda < 0.87 halved knock) replaced by a continuous slope, because
//     it made the design curve and the scorecard disagree by up to 33% torque near the knock limit;
//   · SEQUENTIAL turbos as two turbines staged by a derived law, not one turbine for all the exhaust.
// Plus a bug found on the way: the spool integrator fed the compressor charge-temperature air as its
// inlet, which hid the fill cost of a large intercooler.
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
  const out = {};
  // 1. the U/C curve: peaks at the optimum, at TURB_ETA, and gives nothing to a windmilling shaft
  const T3 = 1100, pr = 1.6, iso = CP_EXH * T3 * (1 - Math.pow(pr, -K_EXH)), C = Math.sqrt(2 * iso);
  out.uc = [0.35, 0.5, 0.7, 0.9, 1.05, 1.5].map(x => ({ x, eta: turbineWorkMean(pr, T3, x * C) / iso }));
  // 2. back-pressure at the top end of a wastegated petrol turbo is above boost, and rises with flow
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4').engine)); buildEngine();
  out.bp = [0.6, 0.75, 0.9, 1.0].map(f => { const n = Math.round(engine.redline * f), m = wotMapAt(n); engine.boostNow = m;
    return { n, ratio: (1 + backPressureBar(n, egtAt(n, m, fullLoadLambda(n, m)))) / m }; });
  out.noChoke = engine.turboChoke === undefined;
  // 3. per-point compressor efficiency reaches the charge temperature
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '3.0 Turbo I6 (2JZ)').engine)); buildEngine();
  const top = engine.redline, m2 = wotMapAt(top);
  out.iat = { design: effIAT(m2), atTop: effIAT(m2, top), effTop: compIslandEff(compFlowFrac(top, airFlowAt(top, m2)), m2), effDesign: engine.compEff };
  // 4. knock is continuous in mixture
  engine.afrMode = 'fixed'; Object.assign(state, { iat: 25, coolant: 90, oil: 100 });
  const kAt = lam => { state.afr = engine.stoichAFR * lam; return knockAt(top, m2, mbtAdvance(top, m2)); };
  out.knock = [0.80, 0.84, 0.86, 0.87, 0.88, 0.90, 0.95].map(l => ({ l, k: kAt(l) }));
  // 5. sequential staging: a 2JZ-GTE-like build stages where the real one does
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { type: 'petrol4', cylinders: 6, bore_mm: 86, stroke_mm: 86, compression: 8.5,
    redline: 6800, intake: 'turbo', boost_bar: 0.75, turboSize: 'medium', turboConfig: 'sequential', cam: 'sport', octane: 98,
    intercooler: 'large', exhaust: 'sport', airFilter: 'perf' })); buildEngine();
  out.seq = { stage: engine.seqStageRpm, below: unitsAt(engine.seqStageRpm - 100), above: unitsAt(engine.seqStageRpm), hp: engine.score.peakHP };
  // 6. the compressor breathes ambient air while spooling: a big charge system fills slower
  const t90 = ic => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4').engine, { intercooler: ic })); buildEngine();
    let E = 0, b = 0, t = 0; while (t < 5 && b < 0.9 * engine.maxBoost) { const a = advanceShaft(E, 4500, b, 1, 1 / 240); E = a.shaftE; b = a.boost; t += 1 / 240; } return t; };
  out.fill = { none: t90('none'), large: t90('large') };
  return out;
});

console.log('== turbine efficiency against blade speed ratio U/C (eta / eta_max) ==');
console.log('  ' + r.uc.map(u => `U/C ${u.x}: ${(u.eta / 0.70).toFixed(2)}`).join(' · '));
const best = r.uc.reduce((a, b) => (b.eta > a.eta ? b : a));
if (best.x !== 0.7) fails.push(`turbine efficiency should peak at U/C 0.7, peaks at ${best.x}`);
if (Math.abs(best.eta - 0.70) > 1e-9) fails.push('at its optimum the turbine should reach TURB_ETA');
if (r.uc.find(u => u.x === 1.5).eta !== 0) fails.push('a turbine spun well past its gas speed should extract nothing');

console.log('\n== hot hatch back-pressure over boost, by fraction of redline: ' + r.bp.map(b => `${b.n} rpm ${b.ratio.toFixed(2)}`).join(' · ') + ' ==');
if (!(r.bp[r.bp.length - 1].ratio > 1)) fails.push('at the top end a wastegated petrol turbo should push against more than its boost');
for (let i = 1; i < r.bp.length; i++) if (!(r.bp[i].ratio > r.bp[i - 1].ratio)) fails.push('back-pressure over boost should rise with flow');
if (!r.noChoke) fails.push('engine.turboChoke is back');

console.log(`\n== 2JZ at its redline: compressor ${r.iat.effTop.toFixed(2)} efficient (design ${r.iat.effDesign.toFixed(2)}), charge ${r.iat.atTop.toFixed(1)} C (design-efficiency ${r.iat.design.toFixed(1)} C) ==`);
if ((r.iat.effTop < r.iat.effDesign) !== (r.iat.atTop > r.iat.design)) fails.push('the charge temperature does not follow the compressor efficiency at the operating point');

console.log('\n== knock at the 2JZ redline against mixture ==');
console.log('  ' + r.knock.map(k => `λ${k.l}: ${k.k.toFixed(1)}`).join(' · '));
for (let i = 1; i < r.knock.length; i++) {
  if (!(r.knock[i].k >= r.knock[i - 1].k)) fails.push('knock should not fall as the mixture leans');
  // As a rate, per unit lambda (build 131): the grid is uneven (steps of 0.01 to 0.05), and the knock score's scale is
  // the end gas's now. The step this guards against was ~40 points in 0.02 (2000 per unit); a trend is far below 400.
  if (Math.abs(r.knock[i].k - r.knock[i - 1].k) / (r.knock[i].l - r.knock[i - 1].l) > 400) fails.push(`knock jumps ${(r.knock[i].k - r.knock[i - 1].k).toFixed(1)} points between λ${r.knock[i - 1].l} and λ${r.knock[i].l} — a step, not a trend`);
}

console.log(`\n== sequential 2JZ: stages at ${r.seq.stage} rpm (the real one ~4000), ${r.seq.below} turbine below, ${r.seq.above} above, ${r.seq.hp} hp (real 320) ==`);
if (!(r.seq.stage >= 3000 && r.seq.stage <= 5000)) fails.push(`staging at ${r.seq.stage} rpm is not where a 2JZ-GTE stages`);
if (!(r.seq.below === 1 && r.seq.above === 2)) fails.push('a sequential pair should run one turbine below its staging speed and two above');

console.log(`== time to 90% boost at 4500 rpm: no intercooler ${r.fill.none.toFixed(3)} s, large core ${r.fill.large.toFixed(3)} s ==`);
if (!(r.fill.large > r.fill.none)) fails.push('a larger charge system must take longer to fill');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
