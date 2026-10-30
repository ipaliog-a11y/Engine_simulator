// The series hybrid (build 193, step 3.4 of plans/hybrid-electric/).
//
// WHY THIS EXISTS. SERIES is the third HYBRID layout (src/js/series.js): the engine turns a generator and nothing else,
// the traction motor alone drives the wheels through one reduction. What must hold:
//   · nothing of the engine reaches the shaft mechanically: the generator holds all of its torque, turns at its speed,
//     and the engine's speed is free of the road's (the bench holds it where MANUAL asks at any shaft speed);
//   · the chain's losses: no more reaches the shaft than the engine's power through the generator and the motor and
//     the pack's on top; on the cycle the engine stops and starts as the pack allows;
//   · it drives as an electric car does: one reduction (matched when none is published), no clutch, no gearbox fields,
//     ASSIST fixed at FULL, the gear window's note, no lever;
//   · the Nissan Qashqai e-POWER (2022): its 140 kW / 330 Nm motor, its engine near its 158 PS; the 0-100 (Nissan 7.9 s:
//     a series car's flat-out pace is its motor's, the engine and pack together out-give it) and the 170 km/h governed;
//     the WLTP cycle against Nissan's 5.3 L/100 km, printed with the model's engine efficiency (its gap is the engine
//     model's, as the Prius's is); the same engine through a gearbox burns more;
//   · a lap sustains the charge, a race runs to the flag on fuel.
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
  const g = id => document.getElementById(id), o = {};
  const vis = id => { const el = g(id), f = el && el.closest('.field'); return !!f && getComputedStyle(f).display !== 'none'; };
  const step = s => { const dt = 1 / 60; for (let i = 0; i < s / dt; i++) { stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); } };
  const p = HYB_VEHICLE_PRESETS.find(x => /Qashqai/.test(x.name)), ep = HYB_ENGINE_PRESETS.find(x => /Qashqai/.test(x.name));
  loadVehiclePreset(p); setTab('design');
  const hy = engine.hy, pt = powertrain(), V = hybBusV(hy);
  o.car = { kind: pt.kind, direct: !!pt.direct, ratios: vehicle.ratios.length, fd: vehicle.finalDrive, matched: vehicle.reductionMatched, label: vehicle.gbLabel, idle: pt.idleRpm(),
    hp: engine.score.peakHP, mot: motorMaxTorque(hy.motor, 100, V, 60), gen: motorMaxTorque(hy.mg1, 100, V, 60), peakTQ: engine.score.peakTQ, genMax: hy.mg1.nMax, redline: engine.redline,
    gearbox: vis('vhGearbox'), assistOff: g('edHyDeploy').disabled, design: /SERIES/.test(g('designSummary').textContent), summary: /SINGLE-SPEED/.test(g('vehicleSummary').textContent),
    gear: hybGear(hy, 3000, 5000) };
  let P = 0; for (const q of pt.torqueCurve()) P = Math.max(P, q.tq * q.rpm * Math.PI / 30); o.car.sysKW = P / 1000;
  o.car.perf = { t100: perf.t100, top: perf.topSpeed, free: perf.freeSpeed };
  // matched to the published engine power
  const k = ep.real.hp / engine.score.peakHP, c0 = buildTorqueCurve;
  window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
  hy._c = null; buildVehicle(); o.matched = { t100: perf.t100, free: perf.freeSpeed };
  window.buildTorqueCurve = c0; hy._c = null; buildVehicle();
  // a lap, a race
  const L = simulateLap('tech'); o.lap = { dep: L.hy.deployKJ, reg: L.hy.regenKJ };
  const rec = { name: 'Qashqai', build: serializeBuild('Qashqai', '') }; o.saved = rec.build.engine.hyMode;
  const R = simulateRace([rec], { track: 'tech', laps: 3, seed: 2 }), res = raceResults(R)[0]; o.race = { state: res.state, fuel: res.fuelL };
  // the cycle
  engine._hcyc = null; const c = hybridCycle(vehicle); o.cyc = { l100: c.l100, on: c.onShare, dE: c.dSocKJ, cap: hy.pack.kWh * 3600, corrected: c.corrected };
  const O = psOol(); let best = 1e9; O.P.forEach((x, i) => { best = Math.min(best, O.gs[i] * 3.6e6 / x); }); o.bestBsfc = best;
  // the bench: the engine's speed free of the shaft's, the chain's losses
  setTab('engine'); let H = hybBenchState(); state.load = 0.3;
  H.mode = 'manual'; H.cmd = 0.3; H.neSet = 3000; state.throttle = 0.5; step(5); o.manA = { ne: H.ne, n: H.n, T1: H.T1, Te: H.Te, ns: H.ns };
  state.load = 0.7; step(5); o.manB = { ne: H.ne, n: H.n };
  state.load = 0.5; H.mode = 'auto'; H.soc = 0.6; state.throttle = 0.5; step(6); o.auto = { on: H.engOn, Pe: H.Pe, P1: H.P1, Pb: H.Pb, Psys: H.Psys };
  H.mode = 'ev'; step(4); o.ev = { on: H.engOn, P1: H.P1, rpm: state.rpm, Pm: H.Pm };
  H.mode = 'engine'; step(5); o.engOnly = { Pb: H.Pb, Psys: H.Psys, Pe: H.Pe };
  H.view = 'lever'; updateUI(); o.view = { fell: H.view, leverOff: g('hyView').querySelector('option[value="lever"]').disabled };
  H.view = 'flow'; updateUI();
  { const cv = g('hyFlow'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) n++; o.lit = n / (d.length / 4); }
  statusFlashUntil = 0; openGearWin(); o.gearNote = g('status').textContent;
  // the same engine without the hybrid
  setTab('design'); const hs = g('edHybrid'); hs.value = 'none'; hs.dispatchEvent(new Event('change')); buildEngine();
  o.plain = { kind: powertrain().kind, gears: vehicle.ratios.length, l100: engineCycle(vehicle).l100 };
  // choosing SERIES from the form starts from the Qashqai's motor and pack
  hs.value = 'series'; hs.dispatchEvent(new Event('change')); buildEngine();
  o.fresh = { mode: engine.hyMode, mot: motorMaxTorque(engine.hy.motor, 100, hybBusV(engine.hy), 60), kWh: engine.hy.pack.kWh };
  applyBuild(rec.build); o.reload = engine.hyMode;
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

const C = r.car;
console.log(`== Qashqai e-POWER: ${C.kind}, direct ${C.direct}, ${C.ratios} ratio ${f(C.fd, 2)}:1 (matched ${f(C.matched, 2)}), "${C.label}", idle ${C.idle}; engine ${C.hp} hp (158 PS); ` +
  `motor ${f(C.mot, 0)} Nm (330), generator ${f(C.gen, 0)} Nm for a ${C.peakTQ} Nm engine, to ${f(C.genMax, 0)} rpm (redline ${C.redline}) ==`);
if (C.kind !== 'hybrid' || !C.direct || C.ratios !== 1 || C.idle !== 0 || !/SERIES/.test(C.label)) fails.push('a series hybrid does not drive through one reduction');
if (Math.abs(C.mot - 330) > 10 || Math.abs(pct(C.hp, 156)) > 10) fails.push('the Qashqai\'s motor or engine is not Nissan\'s');
if (!(C.gen >= C.peakTQ && C.genMax >= C.redline)) fails.push('the generator cannot hold the engine\'s torque to its redline');
if (C.gear.ks !== 1 || C.gear.kr !== 0 || C.gear.ns !== 3000) fails.push('a series hybrid reaches the shaft mechanically');
console.log(`== form: gearbox ${C.gearbox}, ASSIST off ${C.assistOff}, ENGINE summary SERIES ${C.design}, VEHICLE summary single-speed ${C.summary}; gear window: "${r.gearNote.trim()}" ==`);
if (C.gearbox || !C.assistOff || !C.design || !C.summary || !/series hybrid/i.test(r.gearNote)) fails.push('the tabs do not show a series hybrid');
console.log(`== system ${f(C.sysKW)} kW (the motor's 140); 0-100 ${f(C.perf.t100, 2)} s (Nissan 7.9, ${f(pct(C.perf.t100, 7.9))}%), matched engine ${f(r.matched.t100, 2)} s; top ${f(C.perf.top, 0)} km/h, free ${f(C.perf.free, 0)} (170) ==`);
if (Math.abs(pct(C.sysKW, 140)) > 10) fails.push(`the Qashqai makes ${f(C.sysKW)} kW at the wheels' shaft, not its motor's 140`);
if (Math.abs(pct(C.perf.t100, 7.9)) > 9 || Math.abs(pct(r.matched.t100, 7.9)) > 9) fails.push(`the Qashqai's 0-100 is ${f(C.perf.t100, 2)} s against Nissan's 7.9`);
if (C.perf.free < 170 || Math.abs(C.perf.top - 170) > 2) fails.push('the Qashqai cannot reach its 170 km/h');
console.log(`== lap: ${f(r.lap.dep, 0)} kJ out, ${f(r.lap.reg, 0)} back; race ${r.race.state}, ${f(r.race.fuel, 2)} L; saved "${r.saved}", reloaded "${r.reload}" ==`);
if (!(r.lap.dep <= r.lap.reg * 1.002 + 0.1)) fails.push('the lap does not sustain the charge');
if (r.race.state !== 'fin' || !(r.race.fuel > 0) || r.saved !== 'series' || r.reload !== 'series') fails.push('a series hybrid does not race or save');
const Y = r.cyc;
console.log(`== WLTP: ${f(Y.l100, 2)} L/100 km (Nissan 5.3, ${f(pct(Y.l100, 5.3))}%; the model's KR15 at best ${f(r.bestBsfc, 0)} g/kWh), engine off ${f((1 - Y.on) * 100, 0)}%, pack ${f(Y.dE, 0)} kJ; ` +
  `the same engine through ${r.plain.gears} gears ${f(r.plain.l100, 2)} ==`);
if (Math.abs(Y.dE) > Y.cap * 0.005 || Y.corrected) fails.push('the cycle does not sustain the charge');
if (Math.abs(pct(Y.l100, 5.3)) > 20) fails.push(`the Qashqai's WLTP ${f(Y.l100, 2)} L/100 km against Nissan's 5.3`);
if (!(1 - Y.on > 0.3)) fails.push('the engine is not off for a third of the cycle');
if (!(r.plain.l100 > Y.l100)) fails.push('the same engine through a gearbox does not burn more');
const A = r.manA, B = r.manB, U = r.auto, E = r.ev, EO = r.engOnly;
console.log(`== bench MANUAL at 3000 rpm: shaft ${f(A.n, 0)} -> ${f(B.n, 0)} rpm, engine ${f(A.ne, 0)} -> ${f(B.ne, 0)}; generator ${f(A.T1, 0)} Nm on the engine's ${f(A.Te, 0)} at ${f(A.ns, 0)} rpm ==`);
if (Math.abs(A.ne - 3000) > 100 || Math.abs(B.ne - 3000) > 100 || Math.abs(A.n - B.n) < 500) fails.push('the engine\'s speed is not free of the shaft\'s');
if (Math.abs(A.T1 - A.Te) > 1e-6 || Math.abs(A.ns - A.ne) > 1e-6) fails.push('the generator does not hold all the engine\'s torque at its speed');
console.log(`== bench AUTO: engine ${f(U.Pe)} kW -> generator ${f(U.P1)} kW, pack ${f(U.Pb)} kW, shaft ${f(U.Psys)} kW; EV: engine ${E.on ? 'on' : 'off'}, generator ${f(E.P1)} kW, motor ${f(E.Pm)} kW; ` +
  `ENGINE ONLY: pack ${f(EO.Pb, 2)} kW, shaft ${f(EO.Psys)} of the engine's ${f(EO.Pe)} kW ==`);
if (!(U.P1 < U.Pe && U.Psys <= U.P1 + U.Pb + 0.3)) fails.push('the chain gives more than the engine and the pack put in');
if (E.on || Math.abs(E.P1) > 0.05 || E.rpm > 1 || !(E.Pm > 3)) fails.push('EV does not stop the engine and its generator');
if (Math.abs(EO.Pb) > 1.0 || !(EO.Psys < EO.Pe)) fails.push('ENGINE ONLY does not pass the engine\'s power through without the pack');
console.log(`== panel: lever falls back to "${r.view.fell}" (offered: ${!r.view.leverOff}), diagram ${f(r.lit * 100)}% drawn; SERIES from the form: motor ${f(r.fresh.mot, 0)} Nm, ${r.fresh.kWh} kWh ==`);
if (r.view.fell !== 'flow' || !r.view.leverOff || !(r.lit > 0.02)) fails.push('the panel offers a series hybrid the lever, or does not draw it');
if (r.fresh.mode !== 'series' || Math.abs(r.fresh.mot - 330) > 10 || r.fresh.kWh !== 2.1) fails.push('choosing SERIES does not start from the Qashqai\'s motor and pack');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the series hybrid drives on its motor, its engine only charging, and gives the Qashqai e-POWER\'s pace and consumption.');
process.exit(fails.length || errors.length ? 1 : 0);
