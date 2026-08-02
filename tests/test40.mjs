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

const KEI = { cylinders: 3, bore_mm: 73, stroke_mm: 79.6, compression: 9.5, redline: 7000,
  intake: 'turbo', turboSize: 'small', turboConfig: 'single', injector: 'port', octane: 98 };

// ---------------------------------------------------------------- 1. pressure has to be paid for
console.log('== asking a frame for more boost moves its spool point and slows it down ==');
const spool = await page.evaluate(({ base }) => [0.5, 1.0, 1.5, 2.0, 2.5].map(bar => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, { boost_bar: bar })); buildEngine();
  // Time to 90% of target at WIDE OPEN THROTTLE, using the real integrator.
  // The throttle has to be set. Spool used to be a logistic curve in rpm that ignored throttle
  // entirely; it is now the shaft power balance, and a turbo at part throttle genuinely does not
  // spool — the exhaust is too cool. Leaving throttle at its idle value measured a part-throttle
  // spool and reported it as lag, which is how this harness came to disagree with the steady solver.
  state.rpm = 6000; state.throttle = 1; state.boostActual = 0; state.shaftE = 0; let t = 0;
  while (t < 30 && state.boostActual < 0.9 * bar) { stepBoost(1 / 240); t += 1 / 240; }
  return { bar, spool50: Math.round(engine.spool50), spoolK: +engine.spoolK.toFixed(2),
    t90: +t.toFixed(2), iat: Math.round(effIAT(1 + bar)),
    knock: Math.round(computeKnockRisk(engine.score.peakHPrpm, 1 + bar)),
    eff: +engine.compEff.toFixed(2), load: +engine.turboLoad.toFixed(2), hp: engine.score.peakHP };
}), { base: KEI });
console.log('boost   spool50   time to 90%   charge temp   knock   comp.eff   flow load');
spool.forEach(s => console.log(`${s.bar.toFixed(1)} bar ${String(s.spool50).padStart(8)} ${String(s.t90 + ' s').padStart(13)} ${String(s.iat + ' C').padStart(13)} ${String(s.knock).padStart(7)} ${String(s.eff).padStart(10)} ${String(s.load).padStart(11)}`));
for (let i = 1; i < spool.length; i++) {
  if (!(spool[i].spool50 > spool[i - 1].spool50)) fails.push(`spool point did not rise from ${spool[i - 1].bar} to ${spool[i].bar} bar`);
  if (!(spool[i].t90 > spool[i - 1].t90)) fails.push(`spool time did not lengthen from ${spool[i - 1].bar} to ${spool[i].bar} bar`);
  if (!(spool[i].iat > spool[i - 1].iat)) fails.push(`charge temp did not rise from ${spool[i - 1].bar} to ${spool[i].bar} bar`);
  // NOT a monotonic decline. That was true of the old fitted formula, which fell with pressure
  // ratio by construction, and it is not true of a real compressor. A compressor has an efficiency
  // ISLAND, and this kei engine starts at 32% of the frame's choke flow — deep on the surge side of
  // it. Raising boost walks it TOWARD the island centre before it walks off the far side, so
  // efficiency rises then falls. What must hold is that it ends below its peak, and that the charge
  // gets hotter the whole way, which is the penalty that actually matters.
}
{
  const effs = spool.map(s => s.eff), peak = Math.max(...effs);
  console.log(`  efficiency traverses its island: ${effs.join(' -> ')} (peak ${peak})`);
  if (!(effs[effs.length - 1] < peak)) fails.push('efficiency never falls off the island at high boost');
  if (!(effs[0] < peak)) fails.push('efficiency should be poor at low flow too — the surge side of the island');
}
const lo = spool[0], hi = spool[spool.length - 1];
if (!(hi.spool50 > lo.spool50 * 2)) fails.push(`2.5 bar should spool far later than 0.5 bar (${lo.spool50} -> ${hi.spool50})`);
if (!(hi.t90 > lo.t90 * 2)) fails.push(`2.5 bar should take far longer to build (${lo.t90}s -> ${hi.t90}s)`);
if (!(hi.knock > lo.knock + 15)) fails.push(`2.5 bar on a 9.5:1 engine should be a knock problem (${lo.knock} -> ${hi.knock})`);

// charge heating must be super-linear in boost, not a flat per-bar constant
const rises = spool.map(s => s.iat - 25);
console.log(`charge temp rise over ambient: ${rises.join(' / ')} C  — ratio 2.5bar/0.5bar = ${(rises[4] / rises[0]).toFixed(2)}x for 5x the boost`);
if (!((rises[4] / rises[0]) > (hi.bar / lo.bar) * 0.5)) fails.push('charge heating barely responds to boost');
if (rises[0] <= 0) fails.push('no charge heating at all');

// ---------------------------------------------------------------- 2. the frame has a size
console.log('\n== a frame can be too small for the engine, and too big ==');
const frames = await page.evaluate(() => {
  const out = [];
  // 2.0 L four, the classic "which turbo" decision
  const base = { cylinders: 4, bore_mm: 86, stroke_mm: 86, compression: 9.0, redline: 7500,
    intake: 'turbo', turboConfig: 'single', injector: 'direct', octane: 98, cam: 'sport',
    exhaust: 'sport', radiator: 'large', oilCooler: true, intercooler: 'large' };
  for (const bar of [0.8, 2.5]) {
    for (const sz of ['small', 'medium', 'large']) {
      applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, { turboSize: sz, boost_bar: bar }));
      buildEngine();
      applyChassisFit('coupe'); document.getElementById('vhTire').value = 'slick';
      document.getElementById('vhDiff').value = 'clsd'; buildVehicle();
      out.push({ bar, sz, hp: engine.score.peakHP, load: +engine.turboLoad.toFixed(2),
        choke: +engine.turboChoke.toFixed(2), spool50: Math.round(engine.spool50),
        iat: Math.round(effIAT(1 + bar)), t100: +perf.t100.toFixed(2),
        lap: +simulateLap('mixed').lap.toFixed(2) });
    }
  }
  return out;
});
console.log('boost  frame    hp   flow load   choke   spool50   charge   0-100    lap');
frames.forEach(f => console.log(`${f.bar.toFixed(1)}   ${f.sz.padEnd(7)} ${String(f.hp).padStart(4)} ${String(f.load).padStart(10)} ${String(f.choke).padStart(8)} ${String(f.spool50).padStart(8)} ${String(f.iat + 'C').padStart(8)} ${String(f.t100 + 's').padStart(7)} ${String(f.lap + 's').padStart(8)}`));
const at = (b, s) => frames.find(f => f.bar === b && f.sz === s);
// Low boost: the small frame should be the right answer for a road car — it lights up far
// earlier and is quicker off the line. NB not asserted on LAP TIME: a lap is spent almost
// entirely above 3500 rpm, so the lap solver rewards the large frame's peak power and barely
// feels its lag. That is a known limit of solving the lap from steady boost per rpm, and it is
// stated in the GUIDE rather than papered over here.
if (!(at(0.8, 'small').spool50 < at(0.8, 'large').spool50 * 0.6))
  fails.push('at low boost the small frame should light up far earlier than the large one');
if (!(at(0.8, 'small').t100 < at(0.8, 'large').t100))
  fails.push('at low boost the small frame should be quicker off the line than the large one');
// high boost: it should NOT be — the small frame is out of its map
if (!(at(2.5, 'small').load > 1)) fails.push('a 2.0 L at 2.5 bar does not over-flow the small frame');
if (!(at(2.5, 'medium').hp > at(2.5, 'small').hp)) fails.push('at 2.5 bar the medium frame should out-power the small one');
if (!(at(2.5, 'small').iat > at(2.5, 'medium').iat + 5)) fails.push('over-flowing the small frame should cook the charge');
if (!(at(2.5, 'small').choke > at(0.8, 'small').choke)) fails.push('over-flowing a frame should deepen the top-end choke');
// and over-boosting the small frame should not be a free lap-time win
if (!(at(2.5, 'small').lap > at(0.8, 'small').lap)) fails.push('2.5 bar on an over-flowed small frame is still quicker on a lap — no penalty landed');
// a frame that is far too big must spool too late to be worth having
if (!(at(2.5, 'large').spool50 > at(2.5, 'medium').spool50)) fails.push('the large frame does not spool later than the medium one');
console.log(`  at 0.8 bar the small frame lights up at ${at(0.8, 'small').spool50} rpm vs ${at(0.8, 'large').spool50}, and is ${(at(0.8, 'large').t100 - at(0.8, 'small').t100).toFixed(2)}s quicker to 100`);
console.log(`  at 2.5 bar it is over-flowed (${at(2.5, 'small').load}x rated) and the medium frame makes ${at(2.5, 'medium').hp - at(2.5, 'small').hp} hp more`);

// ---------------------------------------------------------------- 3. bigger frames flow more
const caps = await page.evaluate(() => {
  const o = {};
  for (const sz of ['small', 'medium', 'large']) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { intake: 'turbo', boost_bar: 1.0, turboSize: sz })); buildEngine();
    o[sz] = engine.turboCap;
  }
  for (const cfg of ['single', 'twin', 'sequential', 'compound']) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { intake: 'turbo', boost_bar: 1.0, turboSize: 'medium', turboConfig: cfg })); buildEngine();
    o[cfg] = engine.turboCap;
  }
  return o;
});
console.log(`\nrated flow (lb/min): small ${caps.small} · medium ${caps.medium} · large ${caps.large}`);
console.log(`  configs on a medium frame: single ${caps.single} · twin ${caps.twin} · sequential ${caps.sequential} · compound ${caps.compound}`);
if (!(caps.small < caps.medium && caps.medium < caps.large)) fails.push('frame flow ratings are not ordered by size');
if (!(caps.twin > caps.single && caps.compound > caps.twin)) fails.push('multi-turbo configs do not flow more than a single');

// ---------------------------------------------------------------- 4. the intercooler earns its keep
const ic = await page.evaluate(() => ['none', 'small', 'large'].map(v => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 4, bore_mm: 86, stroke_mm: 86,
    compression: 9.0, redline: 7000, intake: 'turbo', turboSize: 'medium', boost_bar: 1.8, octane: 98, intercooler: v }));
  buildEngine();
  return { v, iat: Math.round(effIAT(2.8)), hp: engine.score.peakHP,
    knock: Math.round(computeKnockRisk(engine.score.peakHPrpm, 2.8)), eff: engine.icEff };
}));
console.log('\nintercooler at 1.8 bar:');
ic.forEach(x => console.log(`  ${x.v.padEnd(6)} effectiveness ${x.eff} -> charge ${x.iat} C · ${x.hp} hp · knock ${x.knock}`));
if (!(ic[0].iat > ic[1].iat && ic[1].iat > ic[2].iat)) fails.push('intercooler size does not reduce charge temperature');
if (!(ic[2].hp > ic[0].hp)) fails.push('a bigger intercooler does not make more power');
if (!(ic[0].knock > ic[2].knock)) fails.push('a hot charge does not raise knock risk');
if (!(ic[0].iat > 120)) fails.push(`no intercooler at 1.8 bar should be brutally hot, got ${ic[0].iat} C`);

// ---------------------------------------------------------------- 5. nothing sensible got broken
console.log('\n== every preset still holds together ==');
const pre = await page.evaluate(() => PRESETS.map(pr => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  const s = engine.score;
  return { name: pr.name, turbo: engine.intake === 'turbo', hp: s.peakHP, grade: s.grade, overall: s.overall,
    rel: s.reliability, spool50: engine.intake === 'turbo' ? Math.round(engine.spool50) : null,
    load: engine.intake === 'turbo' ? +engine.turboLoad.toFixed(2) : null,
    iat: Math.round(effIAT(1 + engine.maxBoost)), redline: engine.redline };
}));
pre.filter(p => p.turbo).forEach(p => console.log(`  ${p.name.padEnd(24)} ${String(p.hp).padStart(4)} hp · spool50 ${String(p.spool50).padStart(4)} rpm (${(p.spool50 / p.redline * 100).toFixed(0)}% of redline) · flow ${p.load}x · charge ${p.iat} C · ${p.grade}(${p.overall}) rel ${p.rel}`));
pre.forEach(p => {
  if (!(p.hp > 0)) fails.push(`${p.name}: makes no power`);
  if (p.turbo && !(p.spool50 > 900 && p.spool50 < p.redline * 0.75))
    fails.push(`${p.name}: spool point ${p.spool50} rpm is not credible for a shipped preset`);
  // a shipped preset is a sensible design and must not be over-flowing its own turbo
  if (p.turbo && p.load > 1) fails.push(`${p.name}: ships over-flowing its turbo (${p.load}x rated)`);
  if (p.turbo && p.iat > 70) fails.push(`${p.name}: charge temp ${p.iat} C is too hot for a shipped preset`);
  if (p.overall < 40) fails.push(`${p.name}: grade collapsed to ${p.grade}(${p.overall})`);
});

// ---------------------------------------------------------------- 6. superchargers are untouched by frame logic
const sc = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 8, bore_mm: 104, stroke_mm: 91,
    layout: 'v', redline: 6400, intake: 'supercharger', scType: 'roots', boost_bar: 0.65, octane: 98 }));
  buildEngine();
  return { load: engine.turboLoad, boostAt1500: +boostAvail(1500).toFixed(2), hp: engine.score.peakHP,
    iat: Math.round(effIAT(1.65)), eff: +engine.compEff.toFixed(2) };
});
console.log(`\nblown V8: ${sc.hp} hp · ${sc.boostAt1500} bar at 1500 rpm · charge ${sc.iat} C`);
if (sc.load !== 0) fails.push('a supercharger is being given a turbo flow load');
if (!(sc.boostAt1500 > 0.4)) fails.push('a roots blower should make boost from just off idle');
if (!(sc.iat > 25)) fails.push('a supercharger should still heat the charge');

// ---------------------------------------------------------------- 7. NA engines untouched
const na = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 4, bore_mm: 86, stroke_mm: 86, intake: 'na' }));
  buildEngine();
  return { iat: Math.round(effIAT(1.0)), ambient: Math.round(state.iat), eff: engine.compEff, load: engine.turboLoad };
});
console.log(`NA engine: charge ${na.iat} C vs ambient ${na.ambient} C (should be at or below ambient — no compressor)`);
if (na.iat > na.ambient) fails.push('an NA engine is being charge-heated');

// ---------------------------------------------------------------- 8. UI + guide
await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { intake: 'turbo', turboSize: 'small', boost_bar: 2.5,
    cylinders: 4, bore_mm: 86, stroke_mm: 86 }));
  buildEngine();
});
await page.click('#tabDesign'); await page.waitForTimeout(300);
const ui = await page.evaluate(() => (document.getElementById('designSummary') || {}).textContent || '');
console.log('\ndesign summary:', ui.replace(/\s+/g, ' ').match(/TURBO[^•]*/) ? ui.replace(/\s+/g, ' ').match(/.{0,150}50% boost.{0,60}/)[0] : ui.slice(0, 120));
if (!/50% boost @/.test(ui)) fails.push('design summary no longer reports the spool point');

const guide = await page.evaluate(() => (document.querySelector('[data-gk="subsystems"]') || {}).textContent || '');
if (!/compressor map|rated flow|flow/.test(guide)) fails.push('English guide does not explain the flow limit');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(250);
const guideEl = await page.evaluate(() => (document.querySelector('[data-gk="subsystems"]') || {}).textContent || '');
if (!/παροχ/.test(guideEl)) fails.push('Greek guide does not explain the flow limit');
await page.evaluate(() => applyLang('en'));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
