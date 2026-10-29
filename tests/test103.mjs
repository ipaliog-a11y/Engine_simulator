// The parallel (P2) hybrid (build 186, step 3.1 of plans/hybrid-electric/; decisions 12-15).
//
// WHY THIS EXISTS. HYBRID is now a field on every combustion engine. PARALLEL (P2) puts the electric drive's motor on
// the gearbox's input shaft with a small pack of hybrid cells; DEPLOY says how the controller uses it flat out (FULL,
// or ECO: torque fill up to the engine's peak torque). What must hold:
//   · NONE is the engine exactly as it was (the same 0-100 to the millisecond, nothing hybrid saved);
//   · a P2 adds the motor's torque at every engine speed and its mass, and the 0-100 gets quicker;
//   · the Hyundai Ioniq Hybrid (2016), its engine matched to its published 105 PS as tests/test41.mjs matches the
//     combustion cars: on ECO, MotorWeek's instrumented run (0-60 mph 9.6 s, quarter mile 17.4 s at 81 mph) and
//     Hyundai's 0-100 (10.8 s); FULL, the hardware's potential, is quicker than every one of them;
//   · charge-sustaining: over a lap the pack gives no more than braking took back (the deploy is cut to balance);
//   · the race burns fuel for the engine's share of the power only, and a hybrid races to the flag;
//   · the ENGINE tab: the MOTOR, INVERTER and BATTERY sections under a hybrid engine, not the electric car's MORE
//     MOTORS; DEPLOY only with a hybrid; saves carry the hybrid and an old save is a plain engine.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {}, vis = sel => getComputedStyle(document.querySelector(sel)).display !== 'none';
  const hsel = document.getElementById('edHybrid'), pick = v => { hsel.value = v; hsel.dispatchEvent(new Event('change')); buildEngine(); };
  // 1. NONE is the engine as it was
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  o.plain = { t100: perf.t100, mass: vehicle.mass, kind: powertrain().kind, saved: 'hyMode' in serializeBuild('p', '').engine, hy: 'hy' in engine,
    motorHidden: !vis('.design-section[data-ev]'), deployOff: document.getElementById('edHyDeploy').disabled };
  // 2. a P2 on the same engine
  pick('p2');
  o.p2 = { t100: perf.t100, mass: vehicle.mass, kind: powertrain().kind, hyMass: engine.hy.mass, motorShown: vis('.design-section[data-ev]'),
    moreHidden: !vis('[data-ev-only]'), deployOn: !document.getElementById('edHyDeploy').disabled, kWh: +document.getElementById('evKWh').value,
    summary: /HYBRID/.test(document.getElementById('designSummary').textContent) };
  const L = simulateLap('tech');
  o.lap = { share: L.hy.share, dep: L.hy.deployKJ, reg: L.hy.regenKJ };
  // the race: fuel for the engine's share, and a race to the flag
  const n = L.v.length, hyF = HYBRID.fuelRate(L, n)(L), base = COMBUSTION.fuelRate(L, n), all = base(Object.assign({}, L, { hy: null }));
  o.fuel = { hy: hyF.reduce((a, x) => a + x, 0), all: all.reduce((a, x) => a + x, 0) };
  const rec = { name: 'P2', build: serializeBuild('P2', '') };
  o.saved = { mode: rec.build.engine.hyMode, deploy: rec.build.engine.hyDeploy };
  const R = simulateRace([rec], { track: 'tech', laps: 3, seed: 2 }), res = raceResults(R)[0];
  o.race = { state: res.state, fuel: res.fuelL };
  applyBuild(rec.build); o.reload = powertrain().kind;
  const old = serializeBuild('old', ''); delete old.engine.hyMode; applyBuild(old); o.old = powertrain().kind;
  pick('none'); o.back = { t100: perf.t100, kind: powertrain().kind };
  // 3. the Ioniq Hybrid, its engine matched to its published power
  const p = HYB_VEHICLE_PRESETS[0], ep = HYB_ENGINE_PRESETS[0];
  loadVehiclePreset(p);
  o.ioniq = { hp: engine.score.peakHP, mass: vehicle.mass, deploy: engine.hyDeploy, motorTq: Math.max(...hybCurves().full), packKW: packMaxPower(engine.hy.pack, HYB_SOC) / 1000 };
  const k = ep.real.hp / engine.score.peakHP, c0 = buildTorqueCurve, g0 = buildTorqueGrid;
  window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
  window.buildTorqueGrid = () => { const g = g0(); return Object.assign({}, g, { tq: g.tq.map(row => row.map(t => t * k)) }); };
  const run = () => { engine.hy._c = null; buildVehicle(); return { t60: perf.t60, t100: perf.t100, q400: perf.q400.t, trap: perf.q400.v * 3.6 / 1.609344 }; };
  o.ioniq.eco = run();
  engine.hyDeploy = 'full'; o.ioniq.full = run(); engine.hyDeploy = 'eco';
  window.buildTorqueCurve = c0; window.buildTorqueGrid = g0; engine.hy._c = null; buildVehicle();
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

const P = r.plain, Q = r.p2;
console.log(`== NONE: ${P.kind}, 0-100 ${f(P.t100, 3)} s, ${P.mass} kg, nothing hybrid in the engine (${!P.hy}) or the save (${!P.saved}); taken off again: ${r.back.kind} ${f(r.back.t100, 3)} s ==`);
if (P.kind !== 'combustion' || P.hy || P.saved) fails.push('a plain engine carries something hybrid');
if (r.back.kind !== 'combustion' || r.back.t100 !== P.t100) fails.push('taking the hybrid off does not give the engine back exactly');
console.log(`== P2: ${Q.kind}, 0-100 ${f(Q.t100, 2)} s, ${Q.mass} kg (+${Q.hyMass}), pack ${Q.kWh} kWh to start; sections: motor ${Q.motorShown}, more motors hidden ${Q.moreHidden}, deploy on ${Q.deployOn} (off without a hybrid ${P.deployOff}) ==`);
if (Q.kind !== 'hybrid' || !(Q.t100 < P.t100 - 0.3) || Q.mass !== P.mass + Q.hyMass) fails.push('a P2 does not add its motor and its mass');
if (!Q.motorShown || !Q.moreHidden || !Q.deployOn || !P.deployOff || !P.motorHidden || !Q.summary) fails.push('the ENGINE tab does not show a hybrid\'s sections');
if (!(Q.kWh < 5)) fails.push('fitting a hybrid does not start from a hybrid-sized pack');
console.log(`== lap (tech): deploy share ${f(r.lap.share * 100, 0)}%, the pack gives ${f(r.lap.dep, 0)} kJ and takes back ${f(r.lap.reg, 0)} kJ ==`);
if (!(r.lap.dep <= r.lap.reg * 1.002 + 0.1) || !(r.lap.share > 0 && r.lap.share <= 1)) fails.push('the lap does not sustain the pack\'s charge');
console.log(`== race: fuel at the engine's share ${f(r.fuel.hy / r.fuel.all * 100, 1)}% of the lap's whole power; 3 laps ${r.race.state}, ${f(r.race.fuel, 2)} L ==`);
if (!(r.fuel.hy < r.fuel.all)) fails.push('the race burns fuel for the motor\'s power');
if (r.race.state !== 'fin') fails.push('a hybrid does not finish a race');
console.log(`== saves: "${r.saved.mode}" ${r.saved.deploy}, reloaded ${r.reload}; an old save is ${r.old} ==`);
if (r.saved.mode !== 'p2' || r.saved.deploy !== 'full' || r.reload !== 'hybrid' || r.old !== 'combustion') fails.push('a save does not carry the hybrid, or an old save is not a plain engine');

const I = r.ioniq, E = I.eco, F = I.full;
console.log(`== Ioniq Hybrid: engine ${I.hp} hp as built (105 PS published), motor ${f(I.motorTq, 0)} Nm (170), pack ${f(I.packKW)} kW (32), ${I.mass} kg, ${I.deploy} ==`);
console.log(`   matched, ECO: 0-60 ${f(E.t60, 2)} s (MotorWeek 9.6, ${f(pct(E.t60, 9.6))}%), quarter ${f(E.q400, 2)} s at ${f(E.trap)} mph (17.4 at 81), 0-100 ${f(E.t100, 2)} s (Hyundai 10.8, ${f(pct(E.t100, 10.8))}%)`);
console.log(`   matched, FULL: 0-60 ${f(F.t60, 2)} s, quarter ${f(F.q400, 2)} s at ${f(F.trap)} mph, 0-100 ${f(F.t100, 2)} s`);
if (Math.abs(I.motorTq - 170) > 10 || Math.abs(I.packKW - 32) > 3) fails.push('the Ioniq\'s motor and pack are not its published 170 Nm and 32 kW');
if (Math.abs(pct(E.t60, 9.6)) > 6 || Math.abs(pct(E.q400, 17.4)) > 4 || Math.abs(pct(E.trap, 81)) > 4) fails.push('the Ioniq on ECO is not MotorWeek\'s measured car');
if (Math.abs(pct(E.t100, 10.8)) > 8) fails.push(`the Ioniq's 0-100 ${f(E.t100, 2)} s against Hyundai's 10.8`);
if (!(F.t60 < E.t60 - 0.5 && F.trap > E.trap + 3)) fails.push('FULL deploy is not quicker than ECO');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a P2 hybrid adds its motor to any engine, sustains its charge, races on fuel, and drives as the Ioniq Hybrid does.');
process.exit(fails.length || errors.length ? 1 : 0);
