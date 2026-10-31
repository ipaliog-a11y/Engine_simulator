// The electric drive's sound in the app (build 198, step 4b of plans/hybrid-electric/; the prototype: tests/proto/ev-sound).
//
// WHY THIS EXISTS. An electric car was silent: the engine's sound muted itself and nothing took its place. The motor-sound
// worklet now plays the drive, each voice at the frequency the build gives it. These checks render it offline and pin:
//   · the voices are where the build puts them: on the Model 3, torque ripple at 6 fe and slotting at LCM(54, 6) = 54 x
//     the shaft frequency, the gear meshes of the reduction its tooth counts were picked for, the SiC inverter's
//     sidebands at 16 kHz +/- 2 fe; a P2 hybrid's motor has no reduction of its own, so no gear mesh;
//   · torque is heard (the ripple grows with it), and the Model Y's induction front motor is silent while the controller
//     leaves it nothing (a cruise), heard when the rear runs short;
//   · in the live page: SOUND ON on an electric car starts the motor's voice and keeps the engine's muted; it follows the
//     bench (speed, torque); on a hybrid it plays the bench's motor; on another tab, or with SOUND OFF, it is silent;
//     on the TRACK tab's replay it plays the lap; nothing throws.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(async () => {
  const SR = 48000, o = {};
  const render = async (cfg, rpm, tq, mod, secs = 0.6, skip = 0.2) => {
    const ctx = new OfflineAudioContext(2, SR * secs, SR);
    await loadSoundWorklet(ctx);
    const node = new AudioWorkletNode(ctx, 'motor-sound', { outputChannelCount: [2] });
    node.port.postMessage(cfg);
    const p = node.parameters; p.get('rpm').value = rpm; p.get('tq0').value = tq[0]; p.get('tq1').value = tq[1] || 0; p.get('mod').value = mod; p.get('level').value = 1;
    node.connect(ctx.destination);
    await new Promise(res => setTimeout(res, 30));
    const buf = await ctx.startRendering();
    return buf.getChannelData(0).slice(SR * skip);
  };
  const power = (x, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 0; i < x.length; i++) { const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / x.length); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return 10 * Math.log10((re * re + im * im) / x.length + 1e-30); };
  // the level at f against the level 37 Hz either side (an off-order frequency): a tone stands well clear
  const stand = (x, f) => power(x, f) - Math.max(power(x, f - 37), power(x, f + 37));
  const finite = x => x.every(Number.isFinite);
  // the Model 3: its drive and its reduction
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model 3/.test(p.name))); setTab('design');
  const c3 = motorSoundConfig(engine);
  o.c3 = { groups: c3.groups.map(g => ({ p: g.p, slot: g.slotOrder, fsw: g.fsw, Tpk: g.Tpk, im: g.im })), gears: c3.gears, knee: c3.knee, nMax: c3.nMax, fd: vehicle.finalDrive };
  const rpm = 3000, fe = c3.groups[0].p * rpm / 60, half = 0.5 * c3.Tpk;
  const x = await render(c3, rpm, [half, 0], 0.43), xLo = await render(c3, rpm, [0.1 * c3.Tpk, 0], 0.43);
  const z = c3.gears;
  o.peaks = { ripple: stand(x, 6 * fe), slot: stand(x, c3.groups[0].slotOrder * rpm / 60), mesh1: stand(x, z[0] * rpm / 60), mesh2: stand(x, z[2] * rpm / (60 * z[1] / z[0])),
    pwmUp: stand(x, 16000 + 2 * fe), pwmDn: stand(x, 16000 - 2 * fe), finite: finite(x) };
  o.load = power(x, 6 * fe) - power(xLo, 6 * fe);
  // the Model Y: the induction front motor at a cruise (the controller leaves it nothing) and flat out
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model Y/.test(p.name))); setTab('design');
  const cy = motorSoundConfig(engine), F = cy.groups[1], fSlot = F.slotOrder * rpm / 60;
  const cruise = motorTorqueSplit(cy, 0.2 * cy.groups[0].Tpk), flat = motorTorqueSplit(cy, cy.Tpk);
  const xc = await render(cy, rpm, cruise, 0.4), xf = await render(cy, rpm, flat, 0.4);
  o.y = { front: { im: F.im, slot: F.slotOrder }, cruise, flat, quiet: power(xc, fSlot), loud: power(xf, fSlot) };
  // a P2 hybrid: its motor turns with the engine inside the gearbox, no reduction of its own
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(p => /Ioniq/.test(p.name))); setTab('design');
  const ch = motorSoundConfig(engine); o.p2 = { gears: ch.gears, groups: ch.groups.length };
  // the live page
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model 3/.test(p.name))); setTab('dyno');
  setSound(true); await new Promise(res => setTimeout(res, 600));
  o.live = { motorNode: !!Sound.motor };
  state.throttle = 0.6; state.load = 0.4;
  for (let k = 0; k < 90; k++) { stepEngine(1 / 60); stepElectrical(1 / 60); updatePhysics(); updateSound(); }
  const st = motorSoundState(Sound.motorCfg);
  o.live.state = st && { rpm: st.rpm, T: st.T, benchRpm: state.rpm, benchT: state.torque };
  o.live.level = Sound.motor ? Sound.motor.parameters.get('level').value : null;
  o.live.engineLevel = Sound.node ? Sound.node.parameters.get('level').value : null;
  await new Promise(res => setTimeout(res, 300));
  o.live.levelAfter = Sound.motor ? Sound.motor.parameters.get('level').value : null;
  setTab('garage'); o.live.otherTab = motorSoundState(Sound.motorCfg);
  setTab('dyno'); setSound(false); updateSound(); await new Promise(res => setTimeout(res, 400));
  o.live.offLevel = Sound.motor ? Sound.motor.parameters.get('level').value : null;
  // a hybrid on the bench: the motor's speed and torque
  setSound(true); loadVehiclePreset(HYB_VEHICLE_PRESETS.find(p => /330e/.test(p.name))); setTab('dyno');
  const H = hybBenchState(); H.mode = 'sport'; state.throttle = 0.7;
  for (let k = 0; k < 60; k++) { stepEngine(1 / 60); stepElectrical(1 / 60); updatePhysics(); updateSound(); }
  const hs = motorSoundState(Sound.motorCfg); o.hyb = hs && { rpm: hs.rpm, T: hs.T, Hn: H.n, HTm: H.Tm };
  // the TRACK tab's replay of an electric car
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model 3/.test(p.name))); setTab('track');
  lapResult = simulateLap(trackKey); lapReplay.playing = true; lapReplay.t = lapResult.lap * 0.3;
  const ts = motorSoundState(motorSoundConfig(engine)); o.track = ts && { rpm: ts.rpm, T: ts.T };
  lapReplay.playing = false; setSound(false);
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

const C = r.c3, P = r.peaks;
console.log(`== Model 3 drive: ${C.groups.map(g => `${g.p * 2}-pole, slotting order ${g.slot}, ${g.fsw / 1000} kHz, ${f(g.Tpk, 0)} Nm`).join(' + ')}; gears ${C.gears.join('/')} (reduction ${f(C.fd, 2)}); knee ${C.knee} rpm ==`);
console.log(`== at 3000 rpm, half torque, each tone over its neighbours: 6 fe ${f(P.ripple)} dB, slotting ${f(P.slot)}, mesh 1 ${f(P.mesh1)}, mesh 2 ${f(P.mesh2)}, ` +
  `inverter ${f(P.pwmDn)} / ${f(P.pwmUp)} dB; the ripple ${f(r.load)} dB louder at half torque than at a tenth ==`);
if (C.groups[0].slot !== 54 || C.groups[0].fsw !== 16000) fails.push('the Model 3\'s slotting order or switching frequency is not its build\'s');
if (!(Math.abs(C.gears[1] / C.gears[0] * C.gears[3] / C.gears[2] - C.fd) < 0.02)) fails.push('the gear stages do not make the car\'s reduction');
if (!P.finite || ['ripple', 'slot', 'mesh1', 'mesh2', 'pwmUp', 'pwmDn'].some(k => !(P[k] > 15))) fails.push('a voice is not on the frequency the build gives it');
if (!(r.load > 6)) fails.push('the torque ripple does not grow with the torque');
const Y = r.y;
console.log(`== Model Y: induction front (slotting ${Y.front.slot} bars); a cruise splits [${Y.cruise.map(t => f(t, 0))}] Nm, flat out [${Y.flat.map(t => f(t, 0))}]; front's slotting ${f(Y.quiet)} dB at the cruise, ${f(Y.loud)} dB flat out ==`);
if (!Y.front.im || Y.cruise[1] !== 0 || !(Y.flat[1] > 0) || !(Y.loud - Y.quiet > 30)) fails.push('the Model Y\'s induction front motor is heard while it carries nothing, or not when it works');
console.log(`== P2 hybrid (Ioniq): gears ${r.p2.gears}, ${r.p2.groups} motor ==`);
if (r.p2.gears !== null) fails.push('a P2 hybrid\'s motor is given a reduction of its own');
const L = r.live;
console.log(`== live (Model 3 on the dyno, 60%): motor node ${L.motorNode}; source ${L.state ? `${f(L.state.rpm, 0)} rpm, ${f(L.state.T, 0)} Nm (bench ${f(L.state.benchRpm, 0)} rpm, ${f(L.state.benchT, 0)} Nm)` : 'none'}; ` +
  `motor level ${f(L.levelAfter, 3)}, engine level ${f(L.engineLevel, 3)}; other tab ${L.otherTab}; SOUND OFF ${f(L.offLevel, 3)} ==`);
if (!L.motorNode || !L.state || L.state.rpm !== L.state.benchRpm || L.state.T !== L.state.benchT) fails.push('the motor\'s voice does not follow the electric bench');
if (!(L.levelAfter > 0.1) || L.engineLevel > 1e-3) fails.push('SOUND ON on an electric car does not play the motor, or plays the engine');
if (L.otherTab !== null || !(L.offLevel < 0.01)) fails.push('the motor is heard on another tab or with SOUND OFF');
console.log(`== hybrid bench (330e, SPORT): ${r.hyb ? `${f(r.hyb.rpm, 0)} rpm, ${f(r.hyb.T, 0)} Nm (motor ${f(r.hyb.Hn, 0)} rpm, ${f(r.hyb.HTm, 0)} Nm)` : 'none'}; track replay: ${r.track ? `${f(r.track.rpm, 0)} rpm, ${f(r.track.T, 0)} Nm` : 'none'} ==`);
if (!r.hyb || r.hyb.rpm !== r.hyb.Hn || r.hyb.T !== r.hyb.HTm || !(Math.abs(r.hyb.T) > 1)) fails.push('a hybrid\'s motor is not heard from the bench');
if (!r.track || !(r.track.rpm > 100)) fails.push('the TRACK tab\'s replay does not drive the motor\'s voice');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the electric drive sounds as it is built: its motor, its inverter and its gears, live and on the replay.');
process.exit(fails.length || errors.length ? 1 : 0);
