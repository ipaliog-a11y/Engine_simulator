// ELECTRIC as an engine type: the design, the bench, the dyno and saving (build 179, step 2.2 of plans/hybrid-electric/).
//
// WHY THIS EXISTS. An electric drive now sits beside the four engine types. It must be a whole thing on the ENGINE,
// LIVE and DYNO tabs, it must not yet pretend to be a car (2.3 builds the car), and it must not disturb a combustion
// build in any way. What must hold:
//   · choosing ELECTRIC swaps the combustion sections for MOTOR / INVERTER / BATTERY, and choosing an engine swaps back;
//   · the build is the physics of electric.js: its score, cost and mass are the motor's and the pack's;
//   · the bench: full throttle against the dyno brake settles at a steady speed, draws the pack down, heats the winding;
//     held at peak torque the winding reaches the controller's 150 C and the torque is cut back;
//   · the dyno: flat torque to the knee; a drained pack or hot magnets take power off the curve;
//   · the operating-point buttons put the bench where they say;
//   · the car: no 0-100, no lap, no race, no gear window, each saying why; but the car carries the motor and battery;
//   · a save, a garage entry and a share link carry the powertrain type and rebuild the same drive; an old save loads
//     as combustion; chemistries are offered by the technology year;
//   · back on petrol, the engine is exactly the one it was: same score, its tiles and its controls back;
//   · nothing throws on any tab, and Greek keeps the motor's tiles.
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
  const o = {}, vis = sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; };
  const ice0 = engine.score.peakHP, iceCost0 = engine.cost;
  const setType = t => { const s = document.getElementById('edType'); s.value = t; s.dispatchEvent(new Event('change')); syncDesignEnable(); };
  // 1. the sections
  setType('electric');
  o.secEv = { motor: vis('[data-ev]'), ice: vis('.ice-only'), type: vis('#edType') };
  setType('petrol4');
  o.secIce = { motor: vis('[data-ev]'), ice: vis('.ice-only') };
  // 2. the build
  setType('electric'); buildEngine();
  const e = engine, s = e.score;
  o.build = { type: e.type, kind: powertrain().kind, ready: powertrain().ready(), peakKW: s.peakKW, peakTQ: s.peakTQ, cont: s.contKW,
    hold: s.holdS, grade: s.grade, knee: s.knee, cost: e.cost, parts: e.motor.cost + e.pack.cost, ptMass: powertrain().mass(),
    parts2: Math.round(e.motor.mass + e.pack.mass), vMass: vehicle.mass, perf, redline: e.redline, nMax: e.motor.nMax,
    sub: document.getElementById('subtitle').textContent, tile: document.querySelector('#statKnock .label').textContent };
  // 3. the bench: hold 50% load at full throttle for 3 s, then steady for 1 s
  const run = (sec, dt = 1 / 60) => { const out = []; for (let t = 0; t < sec; t += dt) { stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); out.push(state.rpm); } return out; };
  state.rpm = 0; state.throttle = 1; state.load = 0.5; const soc0 = state.soc, w0 = state.mT.w;
  run(3); const tail = run(1);
  o.bench = { rpm: state.rpm, spread: Math.max(...tail) - Math.min(...tail), kW: state.powerKW, eff: state.thermalEff, soc0, soc: state.soc,
    V: state.systemVoltage, w0, w: state.mT.w, afrSame: state.afr };
  // held at peak torque: high load holds it low, where the current is all torque
  state.load = 0.85; run(2); const t0 = state.torque; run(150);
  o.hold = { w: state.mT.w, tq: state.torque, tqStart: t0, status: (updateUI(), document.getElementById('status').textContent) };
  // 4. the dyno
  buildEngine(); state.rpm = 0;
  const d = motorDynoData(), k = s.knee;
  const below = d.filter(p => p.rpm < 0.8 * k).map(p => p.torque);
  o.dyno = { flat: Math.max(...below) - Math.min(...below), peak: Math.max(...d.map(p => p.powerKW)), effMax: Math.max(...d.map(p => p.eff)) };
  state.soc = 0.08; dynoCache = null; o.dyno.drained = Math.max(...motorDynoData().map(p => p.powerKW));
  state.soc = 0.9; state.mT.r = 140; dynoCache = null; o.dyno.hotTq = Math.max(...motorDynoData().map(p => p.torque)); state.mT.r = 65; dynoCache = null;
  setTab('dyno'); drawDyno(); renderDynoResult(true);
  o.dyno.table = document.querySelectorAll('#dynoResult tbody tr').length;
  // 5. the operating points
  document.getElementById('btnMaxPower').click(); state.rpm = 0; run(4);
  o.op = { power: { rpm: state.rpm, want: s.peakHPrpm, kW: state.powerKW } };
  document.getElementById('btnOptimal').click(); state.rpm = 0; run(4);
  o.op.torque = { tq: state.torque, want: s.peakTQ };
  // 6. the car
  setTab('vehicle'); o.car = { perfHead: document.getElementById('perfHead').textContent };
  setTab('track'); o.car.lapHead = (document.getElementById('lapHead') || {}).textContent; o.car.lap = lapResult;
  openGearWin(); o.car.gearOpen = gw.open;
  let raceErr = ''; try { raceCarModel({ name: 'EV', build: serializeBuild('EV', '') }, 'tech'); } catch (err) { raceErr = err.message; }
  o.car.raceErr = raceErr;
  // 7. saving
  const sb = serializeBuild('ev', ''), link = decodeBuild(encodeBuild(sb));
  o.save = { pt: sb.powertrain, fields: sb.engine.evRotorD === 150 && sb.engine.evChem === 'nca' };
  document.getElementById('evRotorD').value = 170; buildEngine(); const s170 = engine.score.peakTQ;
  applyBuild(link); o.save.reloaded = { type: engine.type, tq: engine.score.peakTQ, want: s.peakTQ, other: s170 };
  const old = serializeBuild('old', ''); delete old.powertrain; old.engine = Object.assign({}, DEFAULT_ENGINE); applyBuild(old);
  o.save.old = { type: engine.type, kind: powertrain().kind };
  // 8. chemistry by year
  setType('electric'); document.getElementById('evYear').value = 1995; syncDesignEnable();
  const opt = v => document.querySelector('#evChem option[value="' + v + '"]').disabled;
  o.chem = { y1995: { lead: opt('lead'), nimh: opt('nimh'), lfp: opt('lfp'), nca: opt('nca'), picked: document.getElementById('evChem').value } };
  document.getElementById('evYear').value = 2020; syncDesignEnable();
  o.chem.y2020 = { lfp: opt('lfp'), nca: opt('nca') };
  // 9. back on petrol: the same engine as at the start
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  o.back = { hp: engine.score.peakHP, hp0: ice0, cost: engine.cost, cost0: iceCost0, kind: powertrain().kind,
    tile: document.querySelector('#statKnock .label').textContent, afrVis: vis('#afr'), perf: !!perf };
  // 10. every tab, and Greek
  setType('electric'); buildEngine();
  for (const t of ['design', 'vehicle', 'garage', 'track', 'race', 'engine', 'dyno', 'guide', 'options', 'design']) { setTab(t); updateUI(); stepPreviews(0.016); if (t === 'engine') drawEngine(0.016); }
  applyLang('el'); o.greek = document.querySelector('#statKnock .label').textContent; applyLang('en');
  return o;
});
const f = (x, d = 0) => (+x).toFixed(d);

console.log(`== sections: electric shows motor ${r.secEv.motor}, hides combustion ${!r.secEv.ice}; petrol shows combustion ${r.secIce.ice}, hides motor ${!r.secIce.motor} ==`);
if (!(r.secEv.motor && !r.secEv.ice && r.secEv.type)) fails.push('choosing ELECTRIC does not swap in the motor sections');
if (!(r.secIce.ice && !r.secIce.motor)) fails.push('choosing an engine does not swap the combustion sections back');

const B = r.build;
console.log(`== build: ${B.kind}, ${B.peakKW} kW ${B.peakTQ} Nm, continuous ${B.cont} kW, peak holds ${B.hold} s, knee ${B.knee} rpm, grade ${B.grade}; ` +
  `cost $${B.cost} (parts $${B.parts}); motor+pack ${B.ptMass} kg, car ${f(B.vMass)} kg; "${B.sub}" ==`);
if (B.type !== 'electric' || B.kind !== 'electric') fails.push('an electric build is not an electric powertrain');
if (B.ready) fails.push('the electric powertrain claims to drive a car before 2.3');
if (!(B.peakKW > 50 && B.peakTQ > 100 && B.cont > 0 && B.cont < B.peakKW && B.hold > 0)) fails.push('the electric scorecard is not filled');
if (B.cost !== B.parts) fails.push(`the drive costs $${B.cost}, not its motor and pack's $${B.parts}`);
if (B.ptMass !== B.parts2) fails.push('the powertrain mass is not the motor and the pack');
if (B.perf !== null) fails.push('an electric car ran a 0-100 through a combustion gearbox');
if (B.redline !== Math.floor(B.nMax / 50) * 50) fails.push('the speed limit is not the motor\'s');
if (B.tile !== 'WINDING') fails.push(`the live tiles are not the motor's (${B.tile})`);

const H = r.bench;
console.log(`== bench: WOT at 50% load settles ${f(H.rpm)} rpm (±${f(H.spread / 2)}), ${f(H.kW)} kW at ${f(H.eff, 1)}%, pack ${f(H.V)} V, SOC ${f(H.soc0 * 100, 1)} -> ${f(H.soc * 100, 1)}%, ` +
  `winding ${f(H.w0)} -> ${f(H.w)} C; held at peak torque 150 s: winding ${f(r.hold.w)} C, torque ${f(r.hold.tqStart)} -> ${f(r.hold.tq)} Nm, "${r.hold.status}" ==`);
if (!(H.spread < 50)) fails.push(`the bench does not settle (${f(H.spread)} rpm of swing)`);
if (!(H.eff > 85 && H.eff < 99.5)) fails.push(`the bench's drive efficiency is ${f(H.eff, 1)}%`);
if (!(H.soc < H.soc0)) fails.push('running the bench does not draw the pack down');
if (!(H.w > H.w0)) fails.push('running the bench does not heat the winding');
if (!(r.hold.w >= 148 && r.hold.w < 182)) fails.push(`held at peak torque the winding is ${f(r.hold.w)} C, not held by the controller near 150-180`);
if (!(r.hold.tq < 0.95 * r.hold.tqStart)) fails.push('the controller does not cut the torque when the winding is hot');
if (!/THERMAL DERATE/.test(r.hold.status)) fails.push('the status bar does not say the drive is derated');

const D = r.dyno;
console.log(`== dyno: torque below the knee within ${f(D.flat, 1)} Nm; peak ${f(D.peak)} kW, drained pack ${f(D.drained)} kW; magnets at 140 C ${f(D.hotTq)} Nm; best eff ${f(D.effMax * 100, 1)}%; ${D.table} table rows ==`);
if (!(D.flat < 0.02 * B.peakTQ)) fails.push('the torque is not flat below the knee');
if (!(D.drained < 0.95 * D.peak)) fails.push('a drained pack gives as much power as a charged one');
if (!(D.hotTq < 0.97 * Math.max(B.peakTQ, 1))) fails.push('hot magnets do not lose torque on the dyno');
if (!(D.effMax > 0.93)) fails.push('the dyno\'s efficiency line never passes 93%');
if (!(D.table > 5)) fails.push('the dyno result has no table');

console.log(`== MAX POWER: ${f(r.op.power.rpm)} rpm (peak at ${r.op.power.want}) ${f(r.op.power.kW)} kW; PEAK TORQUE: ${f(r.op.torque.tq)} Nm (${r.op.torque.want}) ==`);
if (!(Math.abs(r.op.power.rpm / r.op.power.want - 1) < 0.15)) fails.push('MAX POWER does not hold the bench at the peak-power speed');
if (!(r.op.torque.tq > 0.9 * r.op.torque.want)) fails.push('PEAK TORQUE does not give the peak torque');

const Cr = r.car;
console.log(`== car: VEHICLE "${Cr.perfHead.slice(0, 40)}…", TRACK "${(Cr.lapHead || '').slice(0, 40)}…", gear window ${Cr.gearOpen ? 'opened' : 'refused'}, race "${Cr.raceErr.slice(0, 60)}…" ==`);
if (!/next build/.test(Cr.perfHead)) fails.push('the VEHICLE tab does not say why there is no 0-100');
if (!/next build/.test(Cr.lapHead || '') || Cr.lap !== null) fails.push('the TRACK tab does not say why there is no lap');
if (Cr.gearOpen) fails.push('the GEAR RATIOS window opened on an electric car');
if (!/next build/.test(Cr.raceErr)) fails.push('a race entry does not say why an electric car cannot race yet');

const Sv = r.save;
console.log(`== save: powertrain "${Sv.pt}", reloaded ${Sv.reloaded.type} ${Sv.reloaded.tq} Nm (saved ${Sv.reloaded.want}, edited ${Sv.reloaded.other}); an old save is ${Sv.old.kind} ==`);
if (Sv.pt !== 'electric' || !Sv.fields) fails.push('a save does not carry the powertrain type and the motor and battery');
if (!(Sv.reloaded.type === 'electric' && Sv.reloaded.tq === Sv.reloaded.want && Sv.reloaded.other !== Sv.reloaded.want)) fails.push('a share link does not rebuild the drive it saved');
if (Sv.old.type === 'electric' || Sv.old.kind !== 'combustion') fails.push('a save without a powertrain type is not combustion');

const Ch = r.chem;
console.log(`== chemistry: 1995 lead ${!Ch.y1995.lead} NiMH ${!Ch.y1995.nimh} LFP ${!Ch.y1995.lfp} NCA ${!Ch.y1995.nca} (picked ${Ch.y1995.picked}); 2020 LFP ${!Ch.y2020.lfp} NCA ${!Ch.y2020.nca} ==`);
if (Ch.y1995.lead || !Ch.y1995.nimh || !Ch.y1995.lfp || !Ch.y1995.nca || Ch.y1995.picked !== 'lead') fails.push('the 1995 chemistries are not lead-acid only (NiMH from 1996)');
if (Ch.y2020.lfp || Ch.y2020.nca) fails.push('LFP or NCA are not offered in 2020');

const Bk = r.back;
console.log(`== back on petrol: ${Bk.hp} hp (was ${Bk.hp0}), $${Bk.cost} (was $${Bk.cost0}), ${Bk.kind}, tile "${Bk.tile}", AFR slider ${Bk.afrVis ? 'back' : 'missing'}, 0-100 ${Bk.perf} ==`);
if (Bk.hp !== Bk.hp0 || Bk.cost !== Bk.cost0) fails.push('the engine after an electric round trip is not the one before');
if (Bk.kind !== 'combustion' || Bk.tile !== 'KNOCK RISK' || !Bk.afrVis || !Bk.perf) fails.push('the engine\'s tiles, controls or car did not come back');
console.log(`== Greek keeps the motor's tile: "${r.greek}" ==`);
if (r.greek !== 'WINDING') fails.push(`switching to Greek put an engine title on the motor's tile ("${r.greek}")`);

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: ELECTRIC designs, benches, dynos and saves as a drive of its own, and leaves the engines as they were.');
process.exit(fails.length || errors.length ? 1 : 0);
