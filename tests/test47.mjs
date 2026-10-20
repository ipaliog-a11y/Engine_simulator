// Reality envelopes for the engine and the whole car.
//
// The other tests check that physics is internally consistent — that a change propagates, that a
// solver converges, that a curve has the right shape. This one asks a blunter question: are the
// NUMBERS ones a real engine or a real car could produce? A model can be perfectly self-consistent
// and still hand you a 123 hp hatchback that takes 14 seconds to 100 km/h.
//
// Every band below is sourced from published engineering ranges or from a standard correlation,
// and each is named at the point it is used. Where the model currently sits outside a band, the
// violation is BUDGETED rather than the band being widened to fit: the budget stops it getting
// worse and the comment says what has to change for the budget to come down. That is the same
// device test46 uses for presets peaking at the rev limiter.
//
// HARNESS NOTE, learned the hard way while writing this. Everything here reads the DESIGN curve
// through buildTorqueCurve's state discipline (afrMode fixed, best-power AFR, healthy, 20 C).
// Reading calcAtRpm against whatever the live bench happens to be set to reported a 2-stroke making
// -0.5 hp at its own power peak and gave a 123 hp diesel a BMEP of 0.44 bar. That measures the
// slider positions, not the engine.
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

// ==================================================================== 1. engine envelopes
console.log('== every preset has to be an engine that could exist ==');
const eng = await page.evaluate(() => {
  const rows = [];
  for (const pr of PRESETS) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    const Vd = engine.displacement_L, rl = engine.redline, curve = buildTorqueCurve();

    const sv = { afr: state.afr, coolant: state.coolant, oil: state.oil, engineHealth: state.engineHealth,
                 blown: state.blown, iat: state.iat, systemVoltage: state.systemVoltage, nitrousActive: state.nitrousActive };
    const savedAfrMode = engine.afrMode; engine.afrMode = 'fixed';
    state.coolant = 90; state.oil = 100; state.engineHealth = 1; state.blown = false;
    state.iat = 20; state.systemVoltage = 14.0; state.nitrousActive = false;
    state.afr = engine.ci ? engine.stoichAFR * bestPowerLambda() : engine.stoichAFR * 0.88;

    const peakTq = Math.max(...curve.map(p => p.tq));
    const peakTqRpm = curve.find(p => p.tq === peakTq).rpm;
    let peakHp = 0, peakHpRpm = 0;
    for (const p of curve) {
      const hp = p.tq * p.rpm * 2 * Math.PI / 60 / 1000 / 0.7457;
      if (hp > peakHp) { peakHp = hp; peakHpRpm = p.rpm; }
    }
    // biggest torque step between adjacent 100-rpm samples
    let jump = 0, jumpRpm = 0;
    for (let i = 1; i < curve.length; i++) {
      const j = Math.abs(curve[i].tq - curve[i - 1].tq) / Math.max(1, curve[i - 1].tq);
      if (j > jump) { jump = j; jumpRpm = curve[i].rpm; }
    }
    engine.afrMode = savedAfrMode; Object.assign(state, sv);

    rows.push({ nm: pr.name, ci: !!engine.ci, vaneLim: VANE_T_LIMIT - 273, ports: !!engine.ports, rotary: engine.type === 'rotary',
      na: engine.intake === 'na', Vd: +Vd.toFixed(2), rl,
      hp: +peakHp.toFixed(0), hpRpm: peakHpRpm, tq: +peakTq.toFixed(0), tqRpm: peakTqRpm,
      hpPerL: +(peakHp / Vd).toFixed(1),
      bmep: +(peakTq * engine.strokeDiv / ((Vd / 1000) * 1e5)).toFixed(2),
      piston: +(2 * engine.stroke_mm / 1000 * rl / 60).toFixed(1),
      egt: Math.round(engine.peakEgt - 273), thEff: engine.score.thEff,
      jump: +(jump * 100).toFixed(0), jumpRpm });
  }
  return rows;
});
console.log('preset                      disp    hp   hp/L   BMEP  thEff  pist m/s  EGT C   worst 100-rpm step');
for (const r of eng)
  console.log(`${r.nm.padEnd(26)} ${String(r.Vd.toFixed(1)).padStart(4)}  ${String(r.hp).padStart(4)}  ${String(r.hpPerL).padStart(5)}  ${String(r.bmep).padStart(5)}  ${String(r.thEff).padStart(4)}  ${String(r.piston).padStart(7)}  ${String(r.egt).padStart(5)}   ${String(r.jump + '% @' + r.jumpRpm).padStart(12)}`);

const naBmepOver = [];
for (const r of eng) {
  // BMEP — the cleanest single measure of whether an engine is breathing like its type.
  // Turbo petrol 15-25, turbodiesel 18-26, 2-stroke 5-9, rotary 8-14.
  // NA petrol tops out at 15, and that ceiling is GROUNDED, not widened. It read 14 until build 83,
  // and real engines contradict that, one of them inside this suite: test48's BMW S54 makes 365 Nm
  // from 3.246 L, which is 14.1 bar. A Ferrari 458's F136 makes 540 Nm from 4.497 L (15.1 bar), a
  // Porsche 991.2 GT3's 4.0 L about 14.5. Those are the best road NA engines built, so 15 is a real
  // ceiling and the ITB screamer at 16 is still over it.
  const bmepBand = r.ci ? [14, 26] : r.rotary ? [7, 15] : r.ports ? [4, 10] : r.na ? [8, 15] : [13, 26];
  if (r.bmep < bmepBand[0] || r.bmep > bmepBand[1]) {
    // One NA preset is allowed over the band: the ITB screamer reads 16.03 bar, which is race-engine
    // territory rather than road (a road NA four peaks nearer 12.5-13.5). It is not an independent
    // defect — it is the VE clamp. The README already lists "whatever caps peak VE below the 1.2
    // clamp that the ITB screamer now pins against" as a known missing mechanism, and an engine
    // sitting ON a clamp is being sized by the clamp, not by its own breathing. Budgeted so it
    // cannot spread; it comes out when the real VE ceiling exists.
    if (r.na && !r.rotary && !r.ports && r.bmep > bmepBand[1]) naBmepOver.push(r);
    else fails.push(`${r.nm}: BMEP ${r.bmep} bar outside ${bmepBand[0]}-${bmepBand[1]} for its type`);
  }

  // Mean piston speed at the limiter. Road engines live at 15-25 m/s; race engines reach ~30.
  // Above that the reciprocating assembly is not a road part any more. (A Wankel has no pistons,
  // so the figure is geometric fiction there and is only checked for runaway values.)
  const pistonCap = r.rotary ? 40 : 30;
  if (r.piston > pistonCap) fails.push(`${r.nm}: mean piston speed ${r.piston} m/s at the limiter is not survivable`);
  if (r.piston < 8) fails.push(`${r.nm}: mean piston speed ${r.piston} m/s — the redline cannot be right`);

  // Exhaust gas temperature, pre-turbine.
  const egtBand = r.ci ? [500, r.vaneLim] : r.rotary ? [850, 1250] : [780, 1000];
  // KNOWN GAP (build 89): the rotary's exhaust heat. A Wankel's long, thin chamber leaves a trailing
  // pocket still burning when the exhaust port opens, and that is what makes it famously hot — the
  // model has no such mechanism. Its EGT used to land in band only because exhaustGasT credited fuel
  // richer than stoichiometric with heat it cannot release; with that fixed, the rotaries read cool.
  // Held at a floor (current value, rounded down) so it cannot get worse unnoticed; remove the entry
  // when the rotary burn is modelled.
  // build 92: the 13B is back in band (942 C); the Renesis reads 897, floor ratcheted
  const KNOWN_LOW = { '1.3 Rotary NA (Renesis)': 890 };
  if (KNOWN_LOW[r.nm] != null && r.egt < egtBand[0]) {
    if (r.egt < KNOWN_LOW[r.nm]) fails.push(`${r.nm}: EGT ${r.egt} C fell below its known-gap floor ${KNOWN_LOW[r.nm]} C`);
  } else if (r.egt < egtBand[0] || r.egt > egtBand[1])
    fails.push(`${r.nm}: pre-turbine EGT ${r.egt} C outside ${egtBand[0]}-${egtBand[1]}`);

  // Torque has to peak at or below the power peak. If it does not, the curve is not a curve.
  if (r.tqRpm > r.hpRpm) fails.push(`${r.nm}: torque peaks at ${r.tqRpm} ABOVE the power peak ${r.hpRpm}`);
  if (!(r.hp > 0)) fails.push(`${r.nm}: makes no power`);
}

const NA_BMEP_BUDGET = 1;      // the ITB screamer, pinned against the VE clamp
if (naBmepOver.length) {
  console.log(`\n  NA presets over their BMEP band: ${naBmepOver.length} (budget ${NA_BMEP_BUDGET})`);
  for (const r of naBmepOver) console.log(`    ${r.nm.padEnd(26)} ${r.bmep} bar, ${r.hpPerL} hp/L`);
}
if (naBmepOver.length > NA_BMEP_BUDGET)
  fails.push(`NA BMEP overshoot spread to ${naBmepOver.length} presets (budget ${NA_BMEP_BUDGET})`);

// ---- torque cliffs ----------------------------------------------------------------------------
// A real engine's torque cannot jump a third in 100 rpm. Every one of these is a turbo, and every
// one sits at the boost threshold: it is the boost/flow loop crossing unity gain, the same
// mechanism behind the diesel spool cliff. It is a KNOWN defect waiting on turbine housing sizing
// (tests/proto/housing.mjs), so it is budgeted rather than hidden — but it must not spread, and the
// worst one must not get worse.
const CLIFF_PCT = 15;          // above this, a 100-rpm step is not a torque curve, it is a step
const CLIFF_BUDGET = 6;        // presets currently over it — all turbos, all at the boost threshold
// Was 40. Build 83 moved the 6.6 diesel from 38% to 41%, for a stated reason: the IVC geometry fix
// closes its intake 44 deg ABDC where the old convention said 20, so below the boost threshold, with
// no ram to repay it, the engine traps less. That is the correct direction for the pre-boost torque,
// and it widens a step whose cause is the boost loop. The cap still stops anything worse.
const CLIFF_WORST = 42;
const cliffs = eng.filter(r => r.jump > CLIFF_PCT);
console.log(`\n  torque cliffs over ${CLIFF_PCT}% in one 100-rpm step: ${cliffs.length} (budget ${CLIFF_BUDGET})`);
for (const c of cliffs) console.log(`    ${c.nm.padEnd(26)} ${c.jump}% @ ${c.jumpRpm} rpm`);
if (cliffs.length > CLIFF_BUDGET)
  fails.push(`torque cliffs spread to ${cliffs.length} presets (budget ${CLIFF_BUDGET})`);
for (const c of cliffs)
  if (c.jump > CLIFF_WORST) fails.push(`${c.nm}: torque steps ${c.jump}% in 100 rpm (cap ${CLIFF_WORST})`);
// An NA engine has no boost threshold, so it has no excuse for a cliff at all.
for (const c of cliffs)
  if (c.na) fails.push(`${c.nm}: NA engine with a ${c.jump}% torque step — no boost threshold to blame`);

// ==================================================================== 2. whole-car envelopes
console.log('\n== and every car has to be one that could be driven ==');
const CARS = [
  ['1.0 Kei Turbo I3', 'kei'], ['1.6 Sport NA I4', 'hatch'], ['2.0 Turbo Hot-Hatch I4', 'hatch'],
  ['3.0 Turbo I6 (2JZ)', 'coupe'], ['5.0 V8 NA Muscle', 'muscle'], ['6.5 V12 NA Supercar', 'super'],
  ['6.2 Supercharged V8', 'super'], ['2.0 Turbo Diesel I4', 'hatch'], ['6.6 V8 Turbodiesel', 'pickup'],
];
const cars = await page.evaluate((CARS) => CARS.map(([p, ch]) => {
  const pr = PRESETS.find(x => x.name === p);
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit(ch); buildVehicle();
  const hp = engine.score.peakHP, kg = vehicle.mass, v = perf.topSpeed / 3.6;
  return { p, ch, hp, kg, rl: engine.redline, ci: !!engine.ci,
    t100: perf.t100, hpPerT: +(hp / (kg / 1000)).toFixed(0),
    trap: perf.q400 && perf.q400.v ? +(perf.q400.v * 2.23694).toFixed(1) : null,
    trapPred: +(234 * Math.pow(hp / (kg * 2.20462), 1 / 3)).toFixed(1),
    top: Math.round(perf.topSpeed),
    pDrag: +((0.5 * 1.225 * vehicle.cdA * v * v * v + vehicle.crr * kg * 9.81 * v) / 1000).toFixed(0),
    pEng: +(hp * 0.7457).toFixed(0),
    brake: perf.brake100 ? +perf.brake100.dist.toFixed(1) : null };
}), CARS);

console.log('car                                     hp     kg  hp/t   0-100   trap mph / pred   top  drag/eng kW  100-0 m');
for (const c of cars)
  console.log(`${(c.p + ' / ' + c.ch).padEnd(38)} ${String(c.hp).padStart(4)} ${String(c.kg).padStart(6)}  ${String(c.hpPerT).padStart(4)}  ` +
    `${String(c.t100 === null ? 'never' : c.t100.toFixed(2)).padStart(6)}   ${String(c.trap).padStart(6)} / ${String(c.trapPred).padStart(6)}   ` +
    `${String(c.top).padStart(4)}   ${String(c.pDrag + '/' + c.pEng).padStart(9)}  ${String(c.brake).padStart(6)}`);

for (const c of cars) {
  if (c.t100 === null) { fails.push(`${c.p} / ${c.ch}: cannot reach 100 km/h at all`); continue; }
  // Nothing can out-accelerate its own grip. Even on slicks with aero, 1.4 g sustained from rest
  // is beyond a road tyre, so 100 km/h inside v/(mu*g) with mu 1.4 is a physics violation.
  const floor = (100 / 3.6) / (1.4 * 9.81);
  if (c.t100 < floor) fails.push(`${c.p} / ${c.ch}: 0-100 in ${c.t100.toFixed(2)}s beats the ${floor.toFixed(2)}s traction floor`);

  // 100-0 braking. Road cars stop from 100 km/h in 33-40 m; a slick-and-aero car can reach ~28 m.
  // Under 25 m or over 55 m is not a car.
  if (c.brake !== null && (c.brake < 25 || c.brake > 55))
    fails.push(`${c.p} / ${c.ch}: 100-0 in ${c.brake} m is outside 25-55 m`);
}

// ---- gearing matched to the engine --------------------------------------------------------
// At its own top speed a car is at redline in top gear, so it is making near-peak power and the
// drag it is overcoming should account for most of it. A large excess means the car ran out of
// GEAR, not out of power — it is geared for an engine it does not have.
//
// vehicle.finalDrive = lerp(4.9, 2.6, gearing/100) depends only on a slider; the engine's redline
// never enters it. So a 3800 rpm diesel is handed the same ratios as a 9000 rpm screamer, which is
// why both diesels leave half their power unused and are ~40% slow for their power-to-weight.
// Budgeted, because fixing it means deriving the final drive from the engine's usable band.
const GEAR_RATIO_CAP = 1.6;    // well-geared cars here sit at 1.1-1.25
const GEAR_BUDGET = 4;         // currently over: both diesels, the supercharged V8, the muscle V8
const overGeared = cars.filter(c => c.pDrag > 0 && c.pEng / c.pDrag > GEAR_RATIO_CAP);
console.log(`\n  cars leaving more than ${GEAR_RATIO_CAP}x their top-speed drag power unused: ${overGeared.length} (budget ${GEAR_BUDGET})`);
for (const c of overGeared)
  console.log(`    ${(c.p + ' / ' + c.ch).padEnd(38)} ${(c.pEng / c.pDrag).toFixed(2)}x  (redline ${c.rl}, top ${c.top} km/h)`);
if (overGeared.length > GEAR_BUDGET)
  fails.push(`over-geared cars spread to ${overGeared.length} (budget ${GEAR_BUDGET})`);

// ---- trap speed against a standard correlation --------------------------------------------
// Huntington: trap mph = 234*(hp/lb)^(1/3). It holds to within a few percent across a century of
// real drag slips, because at the far end of a quarter mile the car is power-limited, not
// traction-limited — so it checks the whole run rather than the launch.
const TRAP_TOL = 25;           // %
const TRAP_BUDGET = 2;         // both diesels, for the gearing reason above
const trapOff = cars.filter(c => c.trap !== null && Math.abs(c.trap / c.trapPred - 1) * 100 > 10);
console.log(`\n  trap speed more than 10% off Huntington: ${trapOff.length} (budget ${TRAP_BUDGET})`);
for (const c of trapOff)
  console.log(`    ${(c.p + ' / ' + c.ch).padEnd(38)} ${c.trap} vs ${c.trapPred} mph  (${((c.trap / c.trapPred - 1) * 100).toFixed(0)}%)`);
if (trapOff.length > TRAP_BUDGET)
  fails.push(`trap-speed outliers spread to ${trapOff.length} (budget ${TRAP_BUDGET})`);
for (const c of cars)
  if (c.trap !== null && Math.abs(c.trap / c.trapPred - 1) * 100 > TRAP_TOL)
    fails.push(`${c.p} / ${c.ch}: trap ${c.trap} mph vs ${c.trapPred} predicted (${TRAP_TOL}% tolerance)`);

// ---- monotonicity: the model must not reward the wrong thing --------------------------------
console.log('\n== mass has to cost time where mass can cost time ==');
const mono = await page.evaluate(() => {
  const pr = PRESETS.find(x => x.name === '2.0 Turbo Hot-Hatch I4');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  applyChassisFit('hatch'); buildVehicle();
  const base = vehicle.mass, out = [];
  for (const f of [0.6, 0.8, 1.0, 1.4, 2.0]) {
    vehicle.mass = Math.round(base * f);
    vehicle.powerToWeight = engine.score.peakHP / (vehicle.mass / 1000);
    const a = simulateAccel();
    out.push({ kg: vehicle.mass, t100: a.t100, q400: a.q400 ? a.q400.t : null, top: Math.round(a.topSpeed) });
  }
  return out;
});
mono.forEach(m => console.log(`   ${String(m.kg).padStart(5)} kg   0-100 ${m.t100 === null ? 'never' : m.t100.toFixed(2)}   400m ${m.q400 === null ? '—' : m.q400.toFixed(2)}   top ${m.top}`));

// NOT asserted on 0-100, and the reason is worth recording because the obvious assertion is wrong.
//
// This sweep shows a FWD hatch getting *quicker* from 680 kg to 1000 kg — smoothly, 0.055 s across
// the range — and the first instinct was that it had to be a bug. It is not. While a car is
// traction-limited its acceleration is mass-independent:
//     a = mu*k*g*fWt / (1 + mu*k*cg/wb)
// mass cancels, because grip and inertia both scale with it. Aerodynamic drag does NOT cancel: the
// term is drag/m, so the lighter car carries the same drag over less mass and accelerates slightly
// less once speed builds. At 60 km/h this hatch's drag is ~114 N, which is 0.163 m/s2 at 700 kg
// against 0.114 at 1000 kg — a 0.049 m/s2 penalty worth about 0.08 s over the run. Measured 0.055 s.
//
// Three experiments confirmed it rather than leaving it as a story: setting cdA to ~0 flattens the
// sweep to 6.585/6.590/6.590 (mass-independent, as the algebra demands), setting mu to 2.5 so the
// car is never grip-limited restores strict monotonicity, and the effect is absent on RWD and AWD,
// which are not front-axle-load limited off the line. Removing downforce, rolling resistance and
// shift time all leave it unchanged.
//
// So "a lighter car is always quicker to 100" is simply not a true claim about a traction-limited
// front-driver, and asserting it would have driven a correct model toward a wrong one. What IS
// true, and is asserted: distance-based and top-speed measures must stay monotonic, because those
// are power-limited rather than grip-limited.
for (let i = 1; i < mono.length; i++) {
  if (mono[i].q400 !== null && mono[i - 1].q400 !== null && mono[i].q400 < mono[i - 1].q400 - 0.01)
    fails.push(`adding mass cut the 400 m time: ${mono[i - 1].kg}kg ${mono[i - 1].q400.toFixed(2)}s -> ${mono[i].kg}kg ${mono[i].q400.toFixed(2)}s`);
  if (mono[i].top > mono[i - 1].top)
    fails.push(`adding mass raised top speed: ${mono[i - 1].kg}kg ${mono[i - 1].top} -> ${mono[i].kg}kg ${mono[i].top}`);
}
// A doubling of mass has to cost real time somewhere, or the mass model is not connected.
if (!(mono[mono.length - 1].t100 > mono[0].t100 * 1.15))
  fails.push(`doubling mass barely changed 0-100 (${mono[0].t100} -> ${mono[mono.length - 1].t100})`);

// ==================================================================== verdict
console.log('\nERRORS: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'));
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('FAIL:\n  ' + fails.join('\n  ')); await browser.close(); process.exit(1); }
console.log('\nPASS');
await browser.close();
