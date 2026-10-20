// The LIVE tab's operating-point buttons — do they take the engine where they say?
//
// WHY THIS EXISTS. Until build 85, OPTIMAL / MAX POWER / ECO were three fixed sets of slider values
// shared by every engine. MAX POWER held 50% load — halfway between idle and redline, wherever this
// engine's power peak actually was — at a petrol AFR of 12.6, which is sooty-rich on a diesel, and
// it cooled the intake air to 15 C on the way. ECO's AFR of 15.8 misfires an E85 engine whose
// stoichiometric ratio is 9.8. Nothing tied any of the three to the engine that was built.
//
// Each is now a point on the engine: MAX POWER and PEAK TORQUE are wide open throttle held at the
// design-potential peaks, at the best-power lambda and the standard conditions the dyno uses; ECO is
// the minimum of the BSFC map, searched. The strongest check available is the obvious one: drive the
// real LIVE integrator (manifold fill, turbo shaft, dyno brake, inertia) after pressing the button,
// and see whether it settles on the number the DYNO tab prints.
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
await page.waitForTimeout(400);
const fails = [];

const BUILDS = [
  ['1.6 Sport NA I4', {}],
  ['2.0 Turbo Hot-Hatch I4', {}],
  ['2.0 Turbo Diesel I4', {}],
  ['5.0 V8 NA Muscle', {}],
  ['1.3 Rotary NA (Renesis)', {}],
  ['1.6 Sport NA I4 on E85', { fuel: 'e85' }],
];
const out = await page.evaluate(BUILDS => {
  const settle = secs => {
    // the live loop minus drawing, sound and wear: what the LIVE tab integrates every frame
    const dt = 1 / 120;
    for (let t = 0; t < secs; t += dt) { stepEngine(dt); stepElectrical(dt); updatePhysics(); }
  };
  const res = [];
  for (const [nm, over] of BUILDS) {
    const preset = PRESETS.find(p => nm.startsWith(p.name));
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, preset.engine, over)); buildEngine();
    engine.afrMode = 'fixed';                      // the buttons set the mixture; AUTO hands it to the ECU
    wearEnabled = false; setTab('engine');
    const s = engine.score, row = { nm, peakHP: s.peakHP, peakHPrpm: s.peakHPrpm, peakTQ: s.peakTQ, peakTQrpm: s.peakTQrpm,
      stoich: engine.stoichAFR, ci: !!engine.ci, smoke: SMOKE_LAMBDA_CI };
    for (const [btn, key] of [['btnMaxPower', 'power'], ['btnOptimal', 'torque'], ['btnEco', 'eco']]) {
      state.rpm = engine.idleRpmEff + 200; state.boostActual = 0; state.shaftE = 0;
      document.getElementById(btn).click();
      settle(12);
      row[key] = { rpm: Math.round(state.rpm), hp: +state.powerHP.toFixed(1), tq: +state.torque.toFixed(1),
        // the mixture actually BURNED, which on a diesel the injection system may lean past what is asked
        bsfc: Math.round(state.bsfc), lambda: +(curAFR(state.rpm, state.map) / engine.stoichAFR).toFixed(3), iat: state.iat,
        throttle: +state.throttle.toFixed(2), knock: Math.round(state.knockRisk) };
    }
    res.push(row);
  }
  return res;
}, BUILDS);

for (const r of out) {
  console.log(`\n${r.nm}  (dyno: ${r.peakHP} hp @ ${r.peakHPrpm}, ${r.peakTQ} Nm @ ${r.peakTQrpm}; stoich ${r.stoich})`);
  for (const k of ['power', 'torque', 'eco']) {
    const x = r[k];
    console.log(`  ${k.padEnd(7)} ${String(x.rpm).padStart(5)} rpm  ${String(x.hp).padStart(6)} hp  ${String(x.tq).padStart(6)} Nm  ` +
      `BSFC ${String(x.bsfc).padStart(4)}  λ${x.lambda}  throttle ${x.throttle}  IAT ${x.iat}  knock ${x.knock}`);
  }
  // MAX POWER lands on the dyno's peak power, at its rpm
  if (Math.abs(r.power.hp / r.peakHP - 1) > 0.02) fails.push(`${r.nm}: MAX POWER settles at ${r.power.hp} hp, the dyno says ${r.peakHP}`);
  if (Math.abs(r.power.rpm - r.peakHPrpm) > 60) fails.push(`${r.nm}: MAX POWER holds ${r.power.rpm} rpm, the power peak is at ${r.peakHPrpm}`);
  // PEAK TORQUE lands on the dyno's peak torque
  if (Math.abs(r.torque.tq / r.peakTQ - 1) > 0.02) fails.push(`${r.nm}: PEAK TORQUE settles at ${r.torque.tq} Nm, the dyno says ${r.peakTQ}`);
  // ECO burns less fuel per kWh than either full-load point
  if (!(r.eco.bsfc <= Math.min(r.power.bsfc, r.torque.bsfc)))
    fails.push(`${r.nm}: ECO's BSFC ${r.eco.bsfc} is not below the full-load points (${r.power.bsfc}, ${r.torque.bsfc})`);
  // the mixture is a lambda, so it suits the fuel: a diesel stays lean, nothing is wildly off stoich
  for (const k of ['power', 'torque', 'eco']) {
    const l = r[k].lambda;
    if (r.ci && !(l >= r.smoke - 1e-9)) fails.push(`${r.nm}: ${k} puts a diesel at λ${l} — richer than its smoke limit`);
    if (!r.ci && !(l >= 0.8 && l <= 1.2)) fails.push(`${r.nm}: ${k} puts a spark engine at λ${l}`);
    if (r[k].iat !== 25) fails.push(`${r.nm}: ${k} set the intake air to ${r[k].iat} C — the scorecard rates at 25`);
  }
}

// ---- the ECU map at full pedal ----------------------------------------------------------------
// A floored engine on the AUTO fuel map should make close to its best-power torque at every rpm: the
// map's job at full load is to fuel for power. Until build 87 a diesel's map measured load as MAP over
// its best-case boost, so a floored diesel below its boost threshold read as ~30% load and was fuelled
// at lambda 2.7 — 0-5 Nm against a best-power 169 at 1000-2000 rpm. Every preset, at every rpm.
const autoWot = await page.evaluate(() => PRESETS.map(pr => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  const best = buildTorqueCurve();
  const sv = { mode: engine.afrMode, afr: state.afr };
  engine.afrMode = 'auto'; fuelMap = null; generateFuelMap && (fuelMap = generateFuelMap());
  // the same conditions buildTorqueCurve pins, battery included: a sagging battery weakens the spark
  Object.assign(state, { iat: 20, coolant: 90, oil: 100, engineHealth: 1, blown: false, systemVoltage: 14.0, nitrousActive: false });
  let worst = 1, worstRpm = 0;
  for (const p of best) {
    if (p.rpm < 1200) continue;
    const t = calcAtRpm(p.rpm).torque, f = t / Math.max(1, p.tq);
    if (f < worst) { worst = f; worstRpm = p.rpm; }
  }
  engine.afrMode = sv.mode; state.afr = sv.afr;
  return { nm: pr.name, worst: +worst.toFixed(3), worstRpm };
}));
console.log('\nAUTO fuel map at full pedal, worst fraction of best-power torque:');
for (const r of autoWot) console.log(`  ${r.nm.padEnd(26)} ${(r.worst * 100).toFixed(0)}% @ ${r.worstRpm}`);
for (const r of autoWot)
  if (r.worst < 0.85) fails.push(`${r.nm}: floored on the ECU map it makes only ${(r.worst * 100).toFixed(0)}% of best-power torque at ${r.worstRpm} rpm`);

// ---- call-order independence -----------------------------------------------------------------
// computeVE used to read the PREVIOUS call's boost (engine.boostNow) in its overlap term, so the same
// operating point gave 150.8 or 180.2 Nm depending on what had been computed before it. A physics
// function of (rpm, map) must not care what ran last.
const order = await page.evaluate(() => PRESETS.filter(p => p.engine.intake === 'turbo').map(pr => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
  engine.afrMode = 'fixed'; state.afr = engine.stoichAFR * bestPowerLambda();
  calcAtRpm(engine.redline); const a = calcAtRpm(1500).torque;
  calcAtRpm(1000, 1.0); const b = calcAtRpm(1500).torque;
  return { nm: pr.name, a, b };
}));
for (const r of order)
  if (Math.abs(r.a - r.b) > 1e-6) fails.push(`${r.nm}: torque at 1500 rpm depends on the previous call (${r.a.toFixed(1)} vs ${r.b.toFixed(1)} Nm)`);
console.log(`\ncall-order independence: ${order.length} turbo presets checked`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
