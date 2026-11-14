// A hybrid's engine on the bench is heard at its own throttle (build 295, step B of plans/hybrid-electric/gas-sound-hybrid.md).
//
// WHY THIS EXISTS. In AUTO, HOLD and CHARGE the ECU sets the engine's throttle (H.thrE); the sound read the pedal, so a
// charging engine with the pedal up was heard as on a lift (a closed throttle unloads the turbo's whine, opens the
// overrun's crackle and blow-off). It must hold that:
//   · in CHARGE with the pedal up, the engine runs and the sound's drive reads H.thrE, not 0, and the turbo whines as loaded
//     (above what the pedal's 0 would give);
//   · in SPORT the engine's throttle is the pedal, and the sound reads the pedal;
//   · the pedal is left as it was after the sound has read the engine's throttle.
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
  const o = {};
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(p => /330e/.test(p.name))); setTab('dyno');
  setSound(true);
  for (let k = 0; k < 50 && !Sound.node; k++) await new Promise(res => setTimeout(res, 100));
  o.node = !!Sound.node;
  const seen = [], orig = soundDrive;
  soundDrive = (dt, s) => { const d = orig(dt, s); seen.push({ thr: s.throttle, crackle: d.crackle, whine: d.whineA }); return d; };
  const run = (mode, pedal) => {
    const H = hybBenchState(); H.mode = mode; H.soc = 0.4; state.throttle = pedal; state.load = 0.3;
    for (let k = 0; k < 240; k++) { stepEngine(1 / 60); stepElectrical(1 / 60); updatePhysics(); seen.length = 0; updateSound(); }
    const last = seen[seen.length - 1], atPedal = orig(0, state).whineA;
    return { on: H.engOn, thrE: H.thrE, heard: last && last.thr, crackle: last && last.crackle, whine: last && last.whine, atPedal, pedalAfter: state.throttle, rpm: state.rpm };
  };
  o.charge = run('charge', 0);
  o.sport = run('sport', 0.55);
  soundDrive = orig; setSound(false);
  return o;
});
const f = (x, d = 2) => (x == null ? 'none' : (+x).toFixed(d));
const C = r.charge, S = r.sport;
if (!r.node) fails.push('the engine\'s sound worklet did not load');
console.log(`== 330e CHARGE, pedal up: engine ${C.on ? 'on' : 'off'} at ${f(C.rpm, 0)} rpm, ECU throttle ${f(C.thrE)}, sound hears ${f(C.heard)}, turbo whine ${f(C.whine, 4)} (at the pedal's 0: ${f(C.atPedal, 4)}), pedal after ${f(C.pedalAfter)} ==`);
console.log(`== 330e SPORT, pedal 0.55: ECU throttle ${f(S.thrE)}, sound hears ${f(S.heard)}, pedal after ${f(S.pedalAfter)} ==`);
if (!C.on || !(C.thrE > 0.05)) fails.push('CHARGE with the pedal up does not run the engine on a throttle of its own (the check needs it)');
if (C.heard !== C.thrE) fails.push('in CHARGE the sound does not read the engine\'s throttle');
if (!(C.whine > 2 * C.atPedal) || C.crackle > 0) fails.push('a charging engine is heard as on a lift');
if (C.pedalAfter !== 0 || S.pedalAfter !== 0.55) fails.push('the sound leaves the pedal changed');
if (S.heard !== 0.55) fails.push('in SPORT the sound does not read the pedal');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: a hybrid\'s engine is heard at the throttle its ECU gives it.');
process.exit(fails.length || errors.length ? 1 : 0);
