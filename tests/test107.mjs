// The hybrid on the LIVE bench (build 190, step 3.6a of plans/hybrid-electric/; decisions 16-19).
//
// WHY THIS EXISTS. A hybrid's motor, pack and controller used to live only in the 0-100, the lap, the race and the WLTP
// cycle; the LIVE bench ran its engine alone. Now they run with the engine second by second (src/js/hybrid-bench.js):
// a P2's motor on the dyno's shaft with the engine's clutch, a power-split's eCVT with MG1 holding the engine's speed and
// the brake on MG2's shaft. What must hold, on the Ioniq Hybrid (P2) and the Prius (power-split):
//   · ENGINE ONLY: the pack does nothing (the 12 V load aside) and the shaft has the engine's power;
//   · EV: the engine stops (no fuel, no speed), the motor drives on the pack, the charge falls; on the power-split MG1
//     spins backwards; a pack run down to 35% starts the engine;
//   · CHARGE: the engine charges the pack; SPORT: the motor helps on top of the engine; AUTO brings the charge back
//     towards 60% from either side;
//   · MANUAL: the motor command regenerates or helps as asked, and a power-split holds the engine at ENGINE SPEED;
//   · the planetary obeys Willis's equation, and no more comes out of the shaft than goes in from the engine and pack;
//   · the LIVE tab: the hybrid panel only for a hybrid, the manual controls only in MANUAL, the diagram drawn, the status
//     line saying the engine is off;
//   · every hybrid preset survives five minutes flat out in AUTO with AUTO THERMAL on: cooled for its full load, and a
//     power-split's or series engine kept off its redline (build 196).
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
  const step = s => { const dt = 1 / 60; for (let i = 0; i < s / dt; i++) { stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); } };
  const snap = () => { const H = hybBench; return { on: H.engOn, soc: H.soc, n: H.n, ne: H.ne, ns: H.ns, rpm: state.rpm, Pe: H.Pe, Pm: H.Pm, P1: H.P1, Pb: H.Pb, Psys: H.Psys, fuel: state.fuelFlowLph }; };
  const vis = sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
  const o = { cars: {} };
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) }); setTab('engine'); updateUI();
  o.plainPanel = vis('#hybridPanel');
  for (const name of ['Ioniq', 'Prius']) {
    loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => x.name.includes(name))); setTab('engine');
    const H = hybBenchState(), c = o.cars[name] = {};
    state.load = 0.5;
    const run = (mode, soc, thr, s, extra) => { H.mode = mode; H.soc = soc; state.throttle = thr; if (extra) extra(); step(s); return snap(); };
    c.engine = run('engine', 0.6, 0.6, 5);
    c.ev = run('ev', 0.6, 0.5, 5); c.ev.soc0 = 0.6;
    statusFlashUntil = 0; updateUI(); c.ev.status = document.getElementById('status').textContent;   // past any flash
    c.evLow = run('ev', 0.33, 0.5, 2);
    c.charge = run('charge', 0.5, 0.5, 8); c.charge.soc0 = 0.5;
    c.sport = run('sport', 0.6, 0.8, 5);
    c.autoLo = run('auto', 0.42, 0.5, 15); c.autoLo.soc0 = 0.42;
    c.autoHi = run('auto', 0.78, 0.5, 15); c.autoHi.soc0 = 0.78;
    c.manRegen = run('manual', 0.6, 0.6, 4, () => { H.cmd = -0.5; H.neSet = 3000; });
    c.manHelp = run('manual', 0.6, 0.6, 4, () => { H.cmd = 0.5; H.neSet = 3000; });
    // the panel
    H.mode = 'manual'; updateUI();
    c.ui = { panel: vis('#hybridPanel'), cmd: vis('#hybridPanel .hy-man'), ne: vis('#hybridPanel .hy-ps-only'), text: document.getElementById('hyReadout').textContent };
    H.mode = 'auto'; updateUI(); c.ui.cmdAuto = vis('#hybridPanel .hy-man');
    const cv = document.getElementById('hyFlow'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) lit++;
    c.ui.lit = lit / (d.length / 4);
    const sel = document.getElementById('hyDrive'); sel.value = 'charge'; sel.dispatchEvent(new Event('change')); c.ui.select = H.mode;
  }
  // every hybrid preset flat out in AUTO for five minutes, AUTO THERMAL on (a user's report): the engine runs at full load
  // there (the pedal is the engine's and the motor's), so it must be cooled for it, and a power-split or series engine,
  // whose speed the controller sets, must not be held on its redline
  o.flat = HYB_VEHICLE_PRESETS.map(vp => {
    loadVehiclePreset(vp); setTab('engine'); autoThermal = true; state.coolant = 90; state.oil = 95; state.throttle = 1;
    const H = hybBenchState(); H.mode = 'auto'; H.soc = 0.6; let rpmMax = 0;
    for (let k = 0; k < 30; k++) { step(10); rpmMax = Math.max(rpmMax, state.rpm); }
    return { name: vp.name, oil: state.oil, coolant: state.coolant, rpmMax, redline: engine.redline, health: state.engineHealth, cause: state.wearCause, blown: state.blown };
  });
  // an electric car has no hybrid panel
  loadVehiclePreset(EV_VEHICLE_PRESETS[0]); setTab('engine'); updateUI(); o.evPanel = vis('#hybridPanel');
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

if (r.plainPanel || r.evPanel) fails.push('the hybrid panel shows for a plain engine or an electric car');
for (const [name, c] of Object.entries(r.cars)) {
  const ps = name === 'Prius';
  const E = c.engine, V = c.ev, L = c.evLow, C = c.charge, S = c.sport, A = c.autoLo, B = c.autoHi, MR = c.manRegen, MH = c.manHelp;
  console.log(`== ${name}: ENGINE ONLY engine ${f(E.Pe)} kW, shaft ${f(E.Psys)} kW, pack ${f(E.Pb, 2)} kW ==`);
  if (!E.on || Math.abs(E.Pb) > (ps ? 1.0 : 1.5)) fails.push(`${name}: ENGINE ONLY draws on the pack`);
  console.log(`   EV: engine ${V.on ? 'on' : 'off'} at ${f(V.rpm, 0)} rpm, fuel ${f(V.fuel, 2)} L/h, motor ${f(V.Pm)} kW, charge ${f(V.soc0 * 100)} -> ${f(V.soc * 100)}%` +
    (ps ? `, MG1 ${f(V.ns, 0)} rpm` : '') + `; status "${V.status.trim()}"; at 33% the engine ${L.on ? 'starts' : 'stays off'}`);
  if (V.on || V.rpm > 1 || V.fuel > 0 || !(V.Pm > 5) || !(V.soc < V.soc0)) fails.push(`${name}: EV does not drive on the pack with the engine stopped`);
  if (ps && !(V.ns < -1000)) fails.push(`${name}: in EV the power-split's MG1 does not spin backwards`);
  if (!/ENGINE OFF/.test(V.status)) fails.push(`${name}: the status line does not say the engine is off`);
  if (!L.on) fails.push(`${name}: a pack run down to 35% does not start the engine`);
  console.log(`   CHARGE: ${f(C.soc0 * 100)} -> ${f(C.soc * 100)}%, pack ${f(C.Pb)} kW; SPORT: engine ${f(S.Pe)} kW + pack ${f(S.Pb)} kW -> shaft ${f(S.Psys)} kW; ` +
    `AUTO ${f(A.soc0 * 100)} -> ${f(A.soc * 100)}%, ${f(B.soc0 * 100)} -> ${f(B.soc * 100)}%`);
  if (!C.on || !(C.Pb < -1) || !(C.soc > C.soc0)) fails.push(`${name}: CHARGE does not charge the pack`);
  if (!(S.Pb > 3 && S.Psys > S.Pe)) fails.push(`${name}: SPORT does not add the motor to the engine`);
  if (!(A.soc > A.soc0 && B.soc < B.soc0)) fails.push(`${name}: AUTO does not bring the charge back towards 60%`);
  console.log(`   MANUAL: command -50% pack ${f(MR.Pb)} kW, +50% pack ${f(MH.Pb)} kW` + (ps ? `; engine ${f(MH.ne, 0)} rpm held at 3000` : ''));
  if (!(MR.Pb < 0 && MH.Pb > 0)) fails.push(`${name}: MANUAL's motor command does not regenerate and help as asked`);
  if (ps && Math.abs(MH.ne - 3000) > 150) fails.push(`${name}: MANUAL does not hold the engine at ENGINE SPEED`);
  // Willis and the energy balance, on every power-split state
  if (ps) for (const [k, s] of Object.entries({ E, S, A, MH })) {
    const nr = s.n / (65 / 17), lhs = 30 * s.ns + 78 * nr, rhs = 108 * s.ne;
    if (Math.abs(lhs - rhs) > 108 * 2) fails.push(`${name} ${k}: the planetary does not obey Willis's equation (${f(lhs, 0)} against ${f(rhs, 0)})`);
  }
  for (const [k, s] of Object.entries({ E, S, A, C })) if (s.Psys > s.Pe + s.Pb + 0.5) fails.push(`${name} ${k}: the shaft gives ${f(s.Psys)} kW from ${f(s.Pe)} + ${f(s.Pb)}`);
  const U = c.ui;
  console.log(`   panel shown ${U.panel}, manual controls ${U.cmd} (in AUTO ${U.cmdAuto}), engine speed ${U.ne}, diagram ${f(U.lit * 100)}% drawn, select -> ${U.select}; "${U.text}"`);
  if (!U.panel || !U.cmd || U.cmdAuto || U.ne !== ps || !(U.lit > 0.02) || U.select !== 'charge') fails.push(`${name}: the hybrid panel does not show as it should`);
}

for (const F of r.flat) {
  console.log(`== ${F.name} flat out in AUTO, 5 min: oil ${f(F.oil, 0)} C, coolant ${f(F.coolant, 0)} C, engine up to ${f(F.rpmMax, 0)} rpm (redline ${F.redline}), health ${f(F.health, 3)}${F.cause ? ' (' + F.cause + ')' : ''} ==`);
  if (F.blown || F.cause || F.oil > 132 || F.rpmMax > F.redline * 0.985) fails.push(`${F.name}: flat out in AUTO the engine wears (${F.cause || 'oil ' + f(F.oil, 0) + ' C'})`);
}

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the hybrid runs live on the bench in every drive mode, its pack charging and draining, its power flow drawn.');
process.exit(fails.length || errors.length ? 1 : 0);
