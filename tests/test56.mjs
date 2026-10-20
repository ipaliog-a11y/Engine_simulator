// The rotary's slow burn, and where its heat goes.
//
// WHY THIS EXISTS. A Wankel's exhaust is famously hot, and until build 89 the model only got it there
// by crediting rich fuel with heat it cannot release. With that fixed (build 89) the rotaries read
// 775-807 C against a real 900+, and the 13B turbo could not spool before its limiter. The physics:
// a rotary burns over a fixed ~130 degrees of eccentric shaft (a turbulent flame, constant in angle
// across 3000-6000 rpm; SAE 2022-01-0591) with best torque at CA50 35-40 ATDC, against a piston SI
// engine's ~50 degrees and CA50 ~8 ATDC. On their own volume curves that leaves about a tenth of the
// expansion work undone, and that heat leaves in the exhaust.
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
  const load = nm => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === nm).engine)); buildEngine(); };
  const x50 = wiebeX50(), out = {};
  out.pis = wiebePhasingEff(SI_BURN_DEG, SI_CA50 - x50 * SI_BURN_DEG, 9.4, pistonVol);
  out.rot = wiebePhasingEff(ROTARY_BURN_DEG, ROTARY_CA50 - x50 * ROTARY_BURN_DEG, 9.4, wankelVol);
  // the Wankel volume curve: clearance at TDC, CR at BDC 270 shaft degrees later, symmetric
  out.vol = { tdc: wankelVol(0, 9.4), bdc: wankelVol(270, 9.4), sym: Math.abs(wankelVol(100, 9.4) - wankelVol(-100, 9.4)) };
  out.engines = PRESETS.map(p => { load(p.name);
    const f3 = exhaustHeatFrac(3000), f8 = exhaustHeatFrac(8000), keep = engine.rotaryLost;
    engine.rotaryLost = 0; const f0 = exhaustHeatFrac(3000); engine.rotaryLost = keep;
    return { n: p.name, rotary: engine.type === 'rotary', lost: engine.rotaryLost, f3, f8, f0 };
  });
  load('1.3 Rotary Turbo (13B)');
  let r90 = Infinity; for (let n = 800; n <= engine.redline; n += 25) if (boostAvail(n) >= 0.9 * engine.maxBoost) { r90 = n; break; }
  out.b13 = { r90, redline: engine.redline, egt: Math.round(engine.peakEgt - 273), peak: engine.score.peakHPrpm };
  return out;
});

console.log(`== phasing on each engine's own volume curve: piston ${r.pis.toFixed(3)}, rotary ${r.rot.toFixed(3)} ==`);
if (!(r.pis > 0.93 && r.pis < 0.99)) fails.push(`piston SI phasing ${r.pis.toFixed(3)} is not a normal MBT burn`);
if (!(r.rot > 0.80 && r.rot < 0.92)) fails.push(`rotary phasing ${r.rot.toFixed(3)} is outside what a 120-140 degree burn gives`);
if (Math.abs(r.vol.tdc - 1) > 1e-9 || Math.abs(r.vol.bdc - 9.4) > 1e-9 || r.vol.sym > 1e-9)
  fails.push('the Wankel volume curve does not run clearance -> CR over 270 shaft degrees');

console.log('\n== the heat that work did not take, in the exhaust ==');
for (const e of r.engines.filter(e => e.rotary))
  console.log(`  ${e.n.padEnd(26)} work lost ${(e.lost * 100).toFixed(1)}%  exhaust share ${e.f0.toFixed(3)} -> ${e.f3.toFixed(3)}`);
for (const e of r.engines) {
  if (e.rotary) {
    if (!(e.lost > 0.05 && e.lost < 0.15)) fails.push(`${e.n}: ${(e.lost * 100).toFixed(1)}% work lost to slow burn is out of range`);
    if (!(e.f3 > e.f0)) fails.push(`${e.n}: the slow-burn heat does not reach the exhaust`);
    if (Math.abs(e.f3 - e.f8) > 1e-12) fails.push(`${e.n}: a fixed-angle burn should not change with rpm`);
  } else if (e.lost !== 0) fails.push(`${e.n}: a piston engine was given the rotary's slow burn`);
}

// KNOWN GAP, held at a ceiling so it cannot get worse: the 13B now makes boost before its limiter and
// peaks inside its rev range, but it reaches 90% boost near 8500 rpm against a real ~3000. Its
// exhaust is hot enough now; what it lacks is pulse energy, which the model times from cam geometry
// and a rotary has ports. That needs the rotary's own port timing, from a firmer source than the one
// figure found so far (75 deg BBDC on the 13B-REW, quoted second-hand from the FD shop manual).
const SPOOL_CEILING = 8600;
console.log(`\n== 13B: EGT ${r.b13.egt} C, 90% boost at ${r.b13.r90} rpm (real ~3000; ceiling ${SPOOL_CEILING}), power peak ${r.b13.peak} of ${r.b13.redline} ==`);
if (!(r.b13.egt >= 850)) fails.push(`13B exhaust ${r.b13.egt} C is below a rotary's real 850+`);
if (!(r.b13.r90 <= SPOOL_CEILING)) fails.push(`13B now reaches 90% boost only at ${r.b13.r90} rpm (ceiling ${SPOOL_CEILING})`);
if (!(r.b13.peak < r.b13.redline)) fails.push('the 13B peaks at its limiter again');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
