// A hybrid's engine starts and stops at its own inertia (build 298, step C of plans/hybrid-electric/gas-sound-hybrid.md).
//
// WHY THIS EXISTS. The bench's engine stopped at a flat 4000 rpm/s and the sound muted at half idle; it started at idle at
// once, fuelled, and the sound's worklet swept down from its last speed. It must hold that, on the 330e (P2) and the Prius:
//   · stopping, the fuel is cut and the engine runs down: its first step slows it by (Tf - Tb)/J, Tf its motoring loss
//     (brakeTorqueRaw with the fuel cut), Tb MG1's full torque at the crank (0 for a P2, its clutch open), J its inertia
//     and MG1's reflected; it falls without a rise to 0, and is heard until it is at rest;
//   · starting, it is spun up unfuelled (the fuel cut) by MG1 or the motor, and fuelled only once at its firing speed;
//   · the sound's speed returns to 0 when the engine is muted, so a restart rises from rest.
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
  const o = {}, dt = 1 / 60, step = () => { stepEngine(dt); updatePhysics(); };
  for (const re of [/330e/, /Prius/]) {
    loadVehiclePreset(HYB_VEHICLE_PRESETS.find(p => re.test(p.name))); setTab('dyno');
    const H = hybBenchState(); H.mode = 'auto'; H.soc = 0.6; state.throttle = 0; state.load = 0.3;
    for (let k = 0; k < 120; k++) step();
    const c = { name: engine.name || re.source, rpm0: state.rpm };
    // the stop: the first step's slowing against Tf/J
    H.engOn = false; H.mode = 'ev';
    const r0 = state.rpm; step();
    const ps = engine.hy.mode !== 'p2', G = ps ? hybGear(engine.hy, r0, H.n) : null;   // at the step's manifold and shaft
    const J = engine.inertia + (ps ? engine.hy.mg1.J / (G.ks * G.ks) : 0);
    const Tb = ps ? motorMaxTorque(engine.hy.mg1, Math.max(Math.abs(G.ns), 1), hybBusV(engine.hy), 60) / G.ks : 0;
    c.dStep = state.rpm - r0; c.dWant = Math.max(-r0, (brakeTorqueRaw(r0, state.map, true) - Tb) / J * dt * 30 / Math.PI);
    let prev = state.rpm; c.rise = false; c.fuelled = false; c.mutedEarly = false; c.stopT = null;
    for (let k = 1; k < 300 && c.stopT == null; k++) {
      step(); if (state.rpm > prev + 1e-9) c.rise = true; prev = state.rpm;
      if (!state.fuelCut) c.fuelled = true;
      if (hybBenchEngineOff() && state.rpm >= 1) c.mutedEarly = true;
      if (state.rpm < 1) c.stopT = (k + 1) * dt;
    }
    c.offAtRest = hybBenchEngineOff();
    // the start
    H.mode = 'engine'; state.throttle = 0.3; c.crankFuelled = false; c.fireT = null;
    for (let k = 0; k < 120 && c.fireT == null; k++) {
      const before = state.rpm, at = hybFireRpm(H); step();
      if (!H.fired && !state.fuelCut) c.crankFuelled = true;
      if (H.fired) { c.fireT = k * dt; c.fireRpm = before; c.fireWant = at; }   // it fires at the step's start
    }
    o[re.source] = c;
  }
  // the worklet's speed after a mute
  setSound(true);
  for (let k = 0; k < 50 && !Sound.node; k++) await new Promise(res => setTimeout(res, 100));
  o.node = !!Sound.node;
  if (Sound.node) {
    Sound.ctx.resume && await Sound.ctx.resume();
    Sound.node.parameters.get('rpm').setValueAtTime(3000, Sound.ctx.currentTime);
    await new Promise(res => setTimeout(res, 100));
    const orig = soundSource; soundSource = () => ({ off: true });   // the lap replay's stopped engine: updateSound mutes
    await new Promise(res => setTimeout(res, 800));
    o.rpmAfterMute = Sound.node.parameters.get('rpm').value; soundSource = orig;
  }
  setSound(false);
  return o;
});
const f = (x, d = 0) => (x == null ? 'none' : (+x).toFixed(d));
for (const k of ['330e', 'Prius']) {
  const c = r[k];
  console.log(`== ${k}: from ${f(c.rpm0)} rpm, first step ${f(c.dStep, 1)} rpm ((Tf-Tb)/J: ${f(c.dWant, 1)}), at rest in ${f(c.stopT, 2)} s; ` +
    `restarted, fired at ${f(c.fireRpm)} rpm (firing speed ${f(c.fireWant)}) after ${f(c.fireT, 2)} s ==`);
  if (!(Math.abs(c.dStep - c.dWant) <= 0.01 * Math.abs(c.dWant))) fails.push(`${k}: the stop does not slow at the engine's motoring loss over its inertia`);
  if (c.rise || c.fuelled) fails.push(`${k}: the run-down rises or is fuelled`);
  if (c.stopT == null || !c.offAtRest) fails.push(`${k}: the engine does not come to rest, or is not reported off there`);
  if (c.mutedEarly) fails.push(`${k}: the sound mutes before the engine is at rest`);
  if (c.crankFuelled) fails.push(`${k}: the engine is fuelled while it is spun up`);
  if (c.fireT == null || c.fireT < 2 / 60 || Math.abs(c.fireRpm - c.fireWant) > 1) fails.push(`${k}: the engine does not fire at its firing speed after a spin-up`);
}
if (!r.node) fails.push('the engine\'s sound worklet did not load');
else { console.log(`== the worklet's speed 0.8 s after a mute from 3000 rpm: ${f(r.rpmAfterMute)} ==`); if (!(r.rpmAfterMute < 30)) fails.push('a muted engine\'s sound keeps its old speed'); }

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a hybrid\'s engine is spun up unfuelled, fires at its speed, and runs down on its own losses.');
process.exit(fails.length || errors.length ? 1 : 0);
