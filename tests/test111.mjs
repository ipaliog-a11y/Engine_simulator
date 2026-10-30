// The plug-in hybrid (build 194, step 3.5a of plans/hybrid-electric/; decision 13's second half).
//
// WHY THIS EXISTS. PLUG-IN makes any hybrid a plug-in: its pack starts full and is driven down before the hybrid
// sustains its charge, and its WLTP figures are the regulation's for one (src/js/fuel-cycle.js, plugCycles): the cycle
// driven again and again from a full pack until it sustains its charge, the all-electric range, the charge-depleting
// cycles' fuel and electricity, and their weighting with the charge-sustaining test by the EU utility factor. What must
// hold:
//   · the utility factor is the regulation's curve: 0 at 0 km, rising to 1;
//   · a plug-in drives away on its pack (no warm-up running of the engine), the engine first starts at its electric
//     range, and the depleting cycles end where the pack reaches the charge it sustains;
//   · the BMW 330e (2020) against BMW's WLTP: electric range 59-66 km, weighted 1.6-1.9 L/100 km; its 0-100 with the
//     engine matched to the published 135 kW against BMW's 5.9 s (XtraBoost: the motor's full 80 kW);
//   · the same car not plugged in is the charge-sustaining hybrid it was (no weighted figures);
//   · the VEHICLE tab gives the weighted figure, the electric range and the electricity; PLUG-IN only for a hybrid; on
//     the bench a plug-in with charge to spare drives electric where a charge-sustaining one starts its engine.
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

const r = await page.evaluate(async () => {
  const g = id => document.getElementById(id), o = {};
  const step = s => { const dt = 1 / 60; for (let i = 0; i < s / dt; i++) { stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); } };
  o.uf = [0, 25, 50, 100, 200, 800].map(km => plugUF(km));
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) }); setTab('design'); o.plainPlugOff = g('edHyPlug').disabled;
  const p = HYB_VEHICLE_PRESETS.find(x => /330e/.test(x.name)), ep = HYB_ENGINE_PRESETS.find(x => /330e/.test(x.name));
  loadVehiclePreset(p); setTab('vehicle');
  o.car = { plug: engine.hyPlug, form: g('edHyPlug').value, saved: !!serializeBuild('x', '').engine.hyPlug, hp: engine.score.peakHP, motor: Math.max(...hybCurves().full), t100: perf.t100, top: perf.topSpeed, free: perf.freeSpeed };
  const k = ep.real.hp / engine.score.peakHP, c0 = buildTorqueCurve, g0 = buildTorqueGrid;
  window.buildTorqueCurve = () => c0().map(q => ({ rpm: q.rpm, tq: q.tq * k }));
  window.buildTorqueGrid = () => { const G = g0(); return Object.assign({}, G, { tq: G.tq.map(row => row.map(t => t * k)) }); };
  engine.hy._c = null; buildVehicle(); o.matched = { t100: perf.t100 };
  window.buildTorqueCurve = c0; window.buildTorqueGrid = g0; engine.hy._c = null; buildVehicle(); updateVehicleSummary();
  engine._hcyc = null; const c = hybridCycle(vehicle); o.cyc = { cs: c.l100, plug: c.plug };
  await new Promise(res => setTimeout(res, 300)); updateVehicleSummary(); await new Promise(res => setTimeout(res, 300));
  o.line = (g('hybCycle') || {}).textContent || '';
  // the bench: a plug-in with charge to spare against the same car charge-sustaining
  setTab('engine'); state.load = 0.5; let H = hybBenchState(); H.mode = 'auto'; H.soc = 0.8; state.throttle = 0.35; step(6); o.benchFull = { on: H.engOn, soc: H.soc, Pb: H.Pb };
  H.soc = 0.15; step(8); o.benchLow = { on: H.engOn };
  // not plugged in
  setTab('design'); g('edHyPlug').value = 'no'; buildEngine(); engine._hcyc = null;
  const c2 = hybridCycle(vehicle); o.unplugged = { plug: !!c2.plug, l100: c2.l100, flag: !!engine.hyPlug };
  setTab('engine'); H = hybBenchState(); H.mode = 'auto'; H.soc = 0.8; state.throttle = 0.35; step(6); o.benchUnplugged = { on: H.engOn };
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);
const pct = (a, b) => (a / b - 1) * 100;

console.log(`== utility factor: ${r.uf.map((u, i) => [0, 25, 50, 100, 200, 800][i] + ' km ' + f(u, 3)).join(', ')} ==`);
if (r.uf[0] !== 0 || !r.uf.every((u, i) => i === 0 || u > r.uf[i - 1]) || !(r.uf[5] > 0.99 && r.uf[5] <= 1)) fails.push('the utility factor is not the regulation\'s rising curve');
const C = r.car, P = r.cyc.plug;
console.log(`== 330e: plug-in ${C.plug} (form ${C.form}, saved ${C.saved}); engine ${C.hp} hp as built (184 PS), motor ${f(C.motor, 0)} Nm (265); 0-100 ${f(C.t100, 2)} s as built, ` +
  `${f(r.matched.t100, 2)} s matched (BMW 5.9, ${f(pct(r.matched.t100, 5.9))}%); top ${f(C.top, 0)} (230), free ${f(C.free, 0)} ==`);
if (!C.plug || C.form !== 'yes' || !C.saved) fails.push('PLUG-IN is not read, set and saved');
if (Math.abs(C.motor - 265) > 10) fails.push('the 330e\'s motor is not BMW\'s 265 Nm');
if (Math.abs(pct(r.matched.t100, 5.9)) > 8) fails.push(`the 330e's 0-100 ${f(r.matched.t100, 2)} s against BMW's 5.9`);
if (C.free < 230 || Math.abs(C.top - 230) > 2) fails.push('the 330e cannot reach its 230 km/h');
console.log(`== WLTP: ${P.cycles} depleting cycles (${f(P.cdKm)} km), electric range ${f(P.aer)} km (BMW 59-66), weighted ${f(P.l100, 2)} L/100 km (BMW 1.6-1.9), ` +
  `${f(P.kWh100)} kWh/100 km, CO2 ${f(P.co2, 0)} g/km, UF ${f(P.uf, 3)}; sustaining ${f(r.cyc.cs, 2)} L/100 km ==`);
if (!(P.aer > 59 * 0.85 && P.aer < 66 * 1.15)) fails.push(`the 330e's electric range ${f(P.aer)} km against BMW's 59-66`);
if (!(P.l100 > 1.6 * 0.85 && P.l100 < 1.9 * 1.15)) fails.push(`the 330e's weighted ${f(P.l100, 2)} L/100 km against BMW's 1.6-1.9`);
if (!(P.cycles >= 2 && P.cycles < 15 && P.aer <= P.cdKm)) fails.push('the depleting cycles do not end where the pack reaches its sustained charge');
console.log(`== VEHICLE tab: "${r.line.trim()}" ==`);
if (!/weighted/i.test(r.line) || !/electric range/i.test(r.line) || !/kWh\/100 km/.test(r.line)) fails.push('the VEHICLE tab does not give a plug-in\'s figures');
console.log(`== bench AUTO at 35% pedal: plug-in at 80% engine ${r.benchFull.on ? 'on' : 'off'} (pack ${f(r.benchFull.Pb)} kW), at 15% ${r.benchLow.on ? 'on' : 'off'}; not plugged in at 80% ${r.benchUnplugged.on ? 'on' : 'off'} ==`);
if (r.benchFull.on || !(r.benchFull.Pb > 3) || !r.benchLow.on || !r.benchUnplugged.on) fails.push('the bench does not drive a plug-in on its spare charge');
console.log(`== not plugged in: ${r.unplugged.flag ? 'plug-in' : 'charge-sustaining'}, weighted figures ${r.unplugged.plug}, ${f(r.unplugged.l100, 2)} L/100 km; PLUG-IN off for a plain engine ${r.plainPlugOff} ==`);
if (r.unplugged.plug || r.unplugged.flag || !r.plainPlugOff) fails.push('PLUG-IN NO is not a charge-sustaining hybrid, or a plain engine is offered PLUG-IN');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a plug-in drives away on its pack, and the 330e gives BMW\'s electric range and weighted consumption.');
process.exit(fails.length || errors.length ? 1 : 0);
