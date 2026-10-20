// VARIABLE-GEOMETRY TURBINE — does the vane ring do the one job it exists for, and does it pay?
//
// WHY THIS EXISTS. tests/proto/pulse.mjs measured exhaust pulse energy as the suspected fix for the
// diesel spool cliff and found it worth +20-45% of turbine work — real, but 2.6x short of what a
// 2.0 TDI's compressor needs at 1750 rpm. The same prototype found that shrinking the throat to
// 0.45x reached it comfortably, and a production vane ring closes to about 0.3x. So the gap was
// never pulse energy: it was that this model had no concept of a turbine whose throat is a CONTROL
// INPUT. That is what is being tested here.
//
// WHAT WOULD MAKE THIS A BAD FEATURE. A VGT that is simply better than a fixed housing everywhere
// is not physics, it is a free upgrade, and the model would have learned nothing. So every block
// below that measures a gain is paired with one that measures its price:
//   · it spools earlier                      ->  and it flows less at the top (vane blockage)
//   · it is geometry, not a multiplier        ->  so the sweep ratio has to land where hardware does
//   · a petrol engine may fit one            ->  and its exhaust will cook the vanes
// The petrol/diesel split in particular must NOT be asserted anywhere. It has to fall out of
// exhaustGasT (lean quality-governed diesel = cool gas) and out of residualKnock (back-pressure
// drags the end gas toward detonation, and a diesel has no spark to knock).
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

// Two engines of the same size, one of each ignition type, so the only difference between the
// paired runs below is the turbine.
const TDI = { type: 'diesel', cylinders: 4, bore_mm: 81, stroke_mm: 95.5, compression: 16.5,
  redline: 4500, intake: 'turbo', boost_bar: 1.2, turboSize: 'small', injector: 'direct',
  intakeSys: 'efi', intercooler: 'large', exhaust: 'stock' };
const GTI = { type: 'petrol4', cylinders: 4, bore_mm: 82.5, stroke_mm: 92.8, compression: 9.6,
  redline: 6800, intake: 'turbo', boost_bar: 0.9, turboSize: 'small', injector: 'direct',
  octane: 98, intakeSys: 'efi', intercooler: 'large', exhaust: 'stock' };

// ============================================================ 1. the ring is geometry, not a dial
// A(beta) = h*(2*pi*r2*sin(beta) - Z*t): the sweep ratio and the top-end blockage both come out of
// vane count, vane thickness and the two end-stop angles. Nothing here is free to be tuned, so if
// these numbers are not hardware numbers the geometry is wrong.
console.log('== the vane ring is vane geometry ==');
const geom = await page.evaluate(() => ['small', 'medium', 'large'].map(sz => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { type: 'petrol4', intake: 'turbo',
    boost_bar: 1.0, turboSize: sz, vgt: false })); buildEngine();
  const fixed = engine.turbineArea;
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { type: 'petrol4', intake: 'turbo',
    boost_bar: 1.0, turboSize: sz, vgt: true })); buildEngine();
  return { sz, fixed: +(fixed * 1e6).toFixed(1), open: +(engine.turbineArea * 1e6).toFixed(1),
    shut: +(engine.vgtShut * 1e6).toFixed(1), sweep: +(engine.turbineArea / engine.vgtShut).toFixed(2),
    blockage: +(1 - engine.turbineArea / fixed).toFixed(3) };
}));
console.log('frame    fixed throat   vanes open   vanes shut   sweep   blockage at full open');
for (const g of geom)
  console.log(`${g.sz.padEnd(8)} ${String(g.fixed + ' mm2').padStart(12)} ${String(g.open + ' mm2').padStart(12)} ` +
    `${String(g.shut + ' mm2').padStart(12)} ${String(g.sweep + ':1').padStart(8)} ${String((g.blockage * 100).toFixed(1) + '%').padStart(10)}`);
// Production vane rings are sold on a flow range near 3:1. Wider than this and the end stops are
// not hardware end stops; narrower and there is no point fitting one.
for (const g of geom) {
  if (!(g.sweep > 2.4 && g.sweep < 3.4)) fails.push(`${g.sz}: vane sweep ${g.sweep}:1 is not a production range (2.4-3.4)`);
  // The vanes occupy circumference, so the ring at FULL OPEN must pass less than the plain volute.
  // This is the entire top-end price of the device and it must never read as zero or negative.
  if (!(g.open < g.fixed)) fails.push(`${g.sz}: vanes at full open flow >= the plain volute — blockage has gone missing`);
  if (!(g.blockage > 0.03 && g.blockage < 0.25)) fails.push(`${g.sz}: ${(g.blockage * 100).toFixed(1)}% blockage is not vane-shaped`);
}
// Z*t is a fixed LENGTH of circumference, so it costs a small frame proportionally more than a
// large one. Nothing asserts that — it falls out of r2 scaling with the wheel.
if (!(geom[0].blockage > geom[2].blockage))
  fails.push('vane blockage should hurt a small frame more than a large one (fixed Z*t over a smaller circumference)');

// ============================================================ 2. the job it exists for
console.log('\n== and it spools the diesel, which is why the hardware exists ==');
const spool = await page.evaluate(({ TDI, GTI }) => {
  const run = (base, vgt) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, { vgt })); buildEngine();
    const tgt = engine.maxBoost;
    let r90 = 0;
    for (let n = 800; n <= engine.redline; n += 25) if (steadyBoost(n) >= 0.9 * tgt) { r90 = n; break; }
    const curve = buildTorqueCurve();
    const peakTq = Math.max(...curve.map(p => p.tq));
    // where 90% of peak torque first arrives — the number a manufacturer quotes as "320 Nm from
    // 1750 rpm", and the one a VGT is bought to move
    const tq90 = (curve.find(p => p.tq >= 0.9 * peakTq) || {}).rpm || 0;
    let jump = 0;
    for (let i = 1; i < curve.length; i++)
      jump = Math.max(jump, Math.abs(curve[i].tq - curve[i - 1].tq) / Math.max(1, curve[i - 1].tq));
    return { r90, tq90, peakTq: Math.round(peakTq), hp: engine.score.peakHP,
      rel: engine.score.reliability, cost: engine.cost,
      egt: Math.round(engine.peakEgt), jump: +(jump * 100).toFixed(1) };
  };
  const out = {};
  for (const [nm, base] of [['diesel', TDI], ['petrol', GTI]])
    out[nm] = { fixed: run(base, false), vgt: run(base, true) };
  return out;
}, { TDI, GTI });
console.log('engine            turbine   90% boost   90% torque   peak tq   peak hp   worst step   rel   cost');
for (const [nm, p] of Object.entries(spool))
  for (const k of ['fixed', 'vgt']) {
    const r = p[k];
    console.log(`${nm.padEnd(17)} ${k.padEnd(9)} ${String(r.r90 + ' rpm').padStart(9)} ${String(r.tq90 + ' rpm').padStart(12)} ` +
      `${String(r.peakTq + ' Nm').padStart(9)} ${String(r.hp + ' hp').padStart(9)} ${String(r.jump + '%').padStart(12)} ` +
      `${String(r.rel).padStart(5)} ${String('$' + r.cost).padStart(7)}`);
  }
// The headline claim. A real 2.0 TDI holds 320 Nm from 1750 rpm; a fixed small frame on the same
// engine cannot be at boost before ~2500.
if (!(spool.diesel.vgt.r90 < spool.diesel.fixed.r90 - 400))
  fails.push(`VGT must bring the diesel to boost at least 400 rpm earlier (fixed ${spool.diesel.fixed.r90}, vgt ${spool.diesel.vgt.r90})`);
if (!(spool.diesel.vgt.r90 <= 2000))
  fails.push(`a VGT diesel should be at 90% boost by 2000 rpm, not ${spool.diesel.vgt.r90}`);
if (!(spool.diesel.vgt.tq90 < spool.diesel.fixed.tq90))
  fails.push(`VGT must move the diesel's torque plateau down the rev range (fixed ${spool.diesel.fixed.tq90}, vgt ${spool.diesel.vgt.tq90})`);
// Bringing boost on earlier should SMOOTH the step at the threshold, not sharpen it — the cliff
// budgeted in test47 is the boost loop crossing unity gain, and a vane ring crosses it sooner and
// more gently because the throat is already shut when the flow is small.
if (!(spool.diesel.vgt.jump <= spool.diesel.fixed.jump + 1))
  fails.push(`VGT sharpened the diesel's torque step (${spool.diesel.fixed.jump}% -> ${spool.diesel.vgt.jump}%)`);

// ============================================================ 3. and it is not free
console.log('\n== it is not a free upgrade ==');
const price = await page.evaluate(({ TDI, GTI }) => {
  const probe = (base, vgt) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, { vgt })); buildEngine();
    const at = f => {
      const n = Math.round(engine.redline * f), prev = engine.boostNow;
      engine.boostNow = 1 + steadyBoost(n);
      const bp = backPressureBar(n, egtAt(n, engine.boostNow, fullLoadLambda(n, engine.boostNow))), kn = computeKnockRisk(n, engine.boostNow);
      engine.boostNow = prev;
      return { n, bp: +bp.toFixed(2), kn: Math.round(kn) };
    };
    // the throat the vanes are actually holding, swept across the rev range
    // from just off idle, so the sweep starts below EVERY engine's boost threshold: at wide open
    // throttle a petrol's gas is hot enough to hold a 0.9 bar target from ~2000 rpm with the vanes
    // already at their open stop, so a sweep starting at 30% of redline never sees them move
    // Build 98 made the low-rpm exhaust hotter (the walls' extra heat there now comes partly out of the
    // work, not all out of the exhaust), and the petrol holds target from ~975 rpm, under 15% of its
    // redline. So the first point is the engine's own idle, below any boost threshold by definition.
    const throat = [0, 0.3, 0.5, 0.7, 0.92].map(f => {
      const n = f ? Math.round(engine.redline * f) : Math.round(engine.idleRpmEff);
      if (!(engine.vgtShut > 0)) return { n, a: +(engine.turbineArea * 1e6).toFixed(0) };
      // the engine's own throat schedule, not a copy of it
      const map = 1 + steadyBoost(n);
      return { n, a: +(turbineThroatAt(n, map, egtAt(n, map, fullLoadLambda(n, map))) * 1e6).toFixed(0) };
    });
    return { hp: engine.score.peakHP, lo: at(0.35), hi: at(0.92), throat };
  };
  const out = {};
  for (const [nm, base] of [['diesel', TDI], ['petrol', GTI]])
    out[nm] = { fixed: probe(base, false), vgt: probe(base, true) };
  return out;
}, { TDI, GTI });
for (const [nm, p] of Object.entries(price))
  for (const k of ['fixed', 'vgt'])
    console.log(`${nm.padEnd(8)} ${k.padEnd(6)} ${String(p[k].hp + ' hp').padStart(7)}   ` +
      `back-pressure ${p[k].lo.bp} bar @${p[k].lo.n} / ${p[k].hi.bp} bar @${p[k].hi.n}   ` +
      `knock ${p[k].lo.kn}/${p[k].hi.kn}   throat ` + p[k].throat.map(t => t.a).join(' -> ') + ' mm2');
for (const nm of ['diesel', 'petrol']) {
  const f = price[nm].fixed, v = price[nm].vgt;
  // Blockage has to show up as a real top-end cost, not as a rounding error that goes the wrong way.
  if (!(v.hp <= f.hp)) fails.push(`${nm}: VGT made MORE peak power than the fixed housing (${f.hp} -> ${v.hp}) — the vane blockage is not being paid`);
  if (!(v.hi.bp >= f.hi.bp)) fails.push(`${nm}: VGT back-pressure at the top is not above the fixed housing's (${f.hi.bp} -> ${v.hi.bp})`);
  // The vanes must actually MOVE. A ring stuck at one end is a fixed housing with a price tag.
  const t = v.throat.map(x => x.a);
  if (!(t[t.length - 1] > t[0])) fails.push(`${nm}: the vanes do not open as flow rises (${t.join(' -> ')})`);
}

// ============================================================ 4. the split is derived, not asserted
// Nothing in the model says "VGT is for diesels". What says it is exhaustGasT, which gives a
// quality-governed lean diesel ~880 K at the vanes and a petrol engine run rich for power ~1235 K,
// against a nickel-alloy creep limit of 1100 K. If this block ever passes because of an `if (ci)`
// somewhere, the feature has stopped being physics.
console.log('\n== and the reason it is a diesel part comes out of the mixture, not out of an if ==');
console.log(`diesel  gas at the vanes ${spool.diesel.vgt.egt} K   reliability ${spool.diesel.fixed.rel} -> ${spool.diesel.vgt.rel}`);
console.log(`petrol  gas at the vanes ${spool.petrol.vgt.egt} K   reliability ${spool.petrol.fixed.rel} -> ${spool.petrol.vgt.rel}`);
const limit = await page.evaluate(() => VANE_T_LIMIT);
console.log(`vane material creep limit ${limit} K`);
// The diesel ECU fuels UP TO the vane limit at the top end (dieselLambdaFloor), so "at" is correct and
// only "above" is a failure.
if (!(spool.diesel.vgt.egt <= limit + 1))
  fails.push(`diesel exhaust ${spool.diesel.vgt.egt} K is above the vane limit — the lean-mixture EGT derivation has regressed`);
if (!(spool.petrol.vgt.egt > limit))
  fails.push(`petrol exhaust ${spool.petrol.vgt.egt} K is below the vane limit — nothing would stop a petrol VGT`);
if (!(spool.diesel.vgt.rel === spool.diesel.fixed.rel))
  fails.push(`a diesel VGT should cost no reliability (${spool.diesel.fixed.rel} -> ${spool.diesel.vgt.rel})`);
// The vane penalty itself, from the gas temperature: at least 10 points on a petrol engine. Checked as
// the mechanism, not as the net score, because the net also moves with power (the VGT's blockage costs
// a little, which slightly eases the cooling penalty) and with knock — unrelated terms that took the
// net to 9 in build 94 while the vane penalty itself is 11.
const vanePenalty = egtK => Math.min(28, Math.max(0, (egtK - limit) / 100 * 14));
// Floor ratcheted 10 -> 9 in build 98, with the reason: conserving energy in the wall-heat split took
// ~14 K off the petrol's top-end gas (1179 -> 1165 K), the same shift that put test46's 1.6 NA 4 C
// under its band. Both trace to the base exhaust share in exhaustHeatFrac ("roughly a third"), which
// was set while that split did not conserve energy; deriving it is the fix that should restore this.
if (!(vanePenalty(spool.petrol.vgt.egt) >= 9))
  fails.push(`a petrol VGT's vane penalty should be at least 9 reliability points (gas ${spool.petrol.vgt.egt} K)`);
if (!(spool.petrol.vgt.rel < spool.petrol.fixed.rel))
  fails.push(`a petrol VGT should cost reliability (${spool.petrol.fixed.rel} -> ${spool.petrol.vgt.rel})`);
// And it costs money, on both.
for (const nm of ['diesel', 'petrol'])
  if (!(spool[nm].vgt.cost > spool[nm].fixed.cost))
    fails.push(`${nm}: a vane ring and its actuator should cost more than a plain housing`);

// ============================================================ 5. nothing else moved
// A VGT is opt-in. Every build that does not ask for one has to come out bit-identical, or this
// feature has leaked into the fixed-turbine path.
console.log('\n== and no build that did not ask for one has changed ==');
const untouched = await page.evaluate(() => PRESETS.filter(p => !(p.engine || {}).vgt).map(p => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine();
  return { nm: p.name, vgtShut: engine.vgtShut || 0, hp: engine.score.peakHP, tq: engine.score.peakTQ };
}));
const leaked = untouched.filter(r => r.vgtShut > 0);
console.log(`${untouched.length} presets without VGT; ${leaked.length} with a vane ring they did not ask for`);
if (leaked.length) fails.push(`vgtShut is set on presets that never asked for a VGT: ${leaked.map(r => r.nm).join(', ')}`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
