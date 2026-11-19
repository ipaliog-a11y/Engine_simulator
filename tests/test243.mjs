// A hybrid's engine start and stop, with their energy (plan small-physics, step 11).
//
// WHY THIS EXISTS. Build 349 spun a hybrid's engine up and ran it down on the bench, but the crank's ~1 kJ came from
// nowhere and went nowhere, MG2 did not cancel MG1's reaction on the ring, and the lap replay had no spin-up or run-down.
// What must hold:
//   · on the Prius's bench, a start from rest draws from the pack what hybStartStop integrates (within 10%: the bench
//     steps 1/60 s, ~10 steps a start, hybStartStop 2 ms), about 1 kJ, and a stop returns energy to it;
//   · while MG1 spins or brakes the engine, MG2 carries the ring's reaction (kr of the crank torque), so the shaft at rest
//     stays at rest;
//   · the Prius's lap charges each start's draw less the run-down's return from idle to its pack;
//   · its replay plays each start from rest spun up unfuelled below idle (one before the run-down ends refires at once), and each stop running down unfuelled, then off.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = {}, dt = 1 / 60, step = () => { stepEngine(dt); updatePhysics(); };
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(p => /Prius/.test(p.name))); setTab('dyno');
  const S = hybStartStop(), H = hybBenchState(), aux = HYB_BENCH.auxW;
  o.startJ = S.startJ; o.upT = S.upT; o.backIdle = S.stopJ(engine.idleRpmEff);
  H.mode = 'ev'; H.soc = 0.6; state.throttle = 0; state.load = 0.3;
  for (let k = 0; k < 400 && state.rpm >= 1; k++) step();
  // the start, in CHARGE at a standstill
  H.mode = 'charge'; let E = 0, nMax = 0, cancel = 0;
  for (let k = 0; k < 120 && !H.fired; k++) {
    step(); if (H.fired) break;
    E += (H.Pb * 1000 - aux) * dt; nMax = Math.max(nMax, H.n);
    if (H.Tspin) cancel = Math.max(cancel, Math.abs(H.Tm - H.Tspin * hybGear(engine.hy, H.ne, H.n).kr));
  }
  o.benchStartJ = E; o.nMax = nMax; o.cancelErr = cancel; o.fired = !!H.fired;
  // the stop, in EV
  H.mode = 'ev'; E = 0; o.stopFrom = state.rpm;
  for (let k = 0; k < 400 && state.rpm >= 1; k++) { step(); E += (H.Pb * 1000 - aux) * dt; }
  o.benchStopJ = E; o.wantStopJ = S.stopJ(o.stopFrom);
  // the lap and its replay
  setTab('track'); refreshLap();
  const L = lapResult, R = L.replay, n = R.tAt.length, c = hybCurves();
  o.starts = L.hy.starts; o.ssKJ = L.hy.startStopKJ;
  const T = psStartStopTimes(L, c), on = i => psEnginePower(L, i, c) > 0, at = t => trackSoundState(Object.assign(replayAt(L, t), {}));
  let i1 = -1, i0 = -1;
  for (let i = 1; i < n - 1 && (i1 < 0 || i0 < 0); i++) {
    if (i1 < 0 && !on(i - 1) && on(i) && T.r0[i] < 1 && R.tAt[i] + S.upT < R.tAt[n - 1]) i1 = i;
    if (i0 < 0 && on(i - 1) && !on(i) && !on(replayAt(L, R.tAt[i] + 0.05).i)) i0 = i;
  }
  if (i1 >= 0) { const t = R.tAt[i1]; o.up = at(t + S.upT * 0.5); o.upEnd = at(t + S.upT + 0.02); o.upEndOn = on(replayAt(L, t + S.upT + 0.02).i); }
  if (i0 >= 0) { const t = R.tAt[i0]; o.ranAt = psOolAt(psEnginePower(L, i0 - 1, c)).ne; o.dn = at(t + 0.05); o.dnEnd = at(t + S.downT + 0.05); o.dnEndOff = !on(replayAt(L, t + S.downT + 0.05).i); }
  return o;
});
const f = (x, d = 0) => (x == null ? 'none' : (+x).toFixed(d));
console.log(`== Prius: start ${f(r.startJ)} J in ${f(r.upT, 3)} s (bench ${f(r.benchStartJ)} J), stop from ${f(r.stopFrom)} rpm returns ${f(-r.benchStopJ)} J ` +
  `(integrated ${f(r.wantStopJ)} J); shaft at most ${f(r.nMax, 2)} rpm, MG2 off its cancelling torque by ${f(r.cancelErr, 3)} Nm ==`);
console.log(`== lap: ${r.starts} starts, ${f(r.ssKJ, 2)} kJ from the pack (${f(r.startJ)} - ${f(r.backIdle)} J each); replay: spin-up ${r.up ? f(r.up.rpm) + ' rpm cut ' + r.up.fuelCut : 'none'}, ` +
  `run-down from ${f(r.ranAt)} at ${r.dn ? f(r.dn.rpm) + ' rpm cut ' + r.dn.fuelCut : 'none'} ==`);
if (!(r.startJ > 500 && r.startJ < 3000)) fails.push(`the integrated start is ${f(r.startJ)} J, not about 1 kJ`);
if (!r.fired || !(Math.abs(r.benchStartJ - r.startJ) <= 0.1 * r.startJ)) fails.push(`the bench's start drew ${f(r.benchStartJ)} J, not the integrated ${f(r.startJ)} J`);
if (!(r.benchStopJ < 0) || !(Math.abs(-r.benchStopJ - r.wantStopJ) <= 0.1 * r.wantStopJ)) fails.push(`the bench's stop returned ${f(-r.benchStopJ)} J, not the integrated ${f(r.wantStopJ)} J`);
if (r.nMax > 1 || r.cancelErr > 0.01) fails.push('MG2 does not cancel the ring\'s reaction to MG1 (the shaft at rest moved)');
if (!(r.starts > 0) || !(Math.abs(r.ssKJ - r.starts * (r.startJ - r.backIdle) / 1000) < 1e-6)) fails.push('the lap does not charge its starts to the pack');
if (!r.up || r.up.off || !r.up.fuelCut || !(r.up.rpm > 0 && r.up.rpm < 1000)) fails.push('the replay does not spin the engine up unfuelled');
if (r.upEndOn && (!r.upEnd || r.upEnd.off || r.upEnd.fuelCut)) fails.push('the replay\'s engine does not run once spun up');
if (!r.dn || r.dn.off || !r.dn.fuelCut || !(r.dn.rpm > 0 && r.dn.rpm < r.ranAt)) fails.push('the replay does not run the engine down unfuelled');
if (r.dnEndOff && !(r.dnEnd && r.dnEnd.off)) fails.push('the replay\'s engine is not off once run down');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a hybrid\'s start and stop are paid from and returned to its pack, MG2 holds the ring, and the replay plays both.');
process.exit(fails.length || errors.length ? 1 : 0);
