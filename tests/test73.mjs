// Where the engine sound plays, and the sound of the lap replay (build 139).
//
// WHY THIS EXISTS. Through build 129 the sound played on every tab, always from the live engine on its
// brake, so the TRACK tab's car went round the lap to the sound of whatever the dyno controls were set to.
// Now soundSource() picks what is heard: the live engine on the DYNO tab, the lap replay on the TRACK tab
// (silent while the replay is paused), nothing anywhere else. These checks pin that:
//   1. the source per tab, and the live level actually falling to zero off those tabs;
//   2. trackSoundState follows the replay: its rpm, full throttle harder than braking, a lift on an
//      injected engine cutting the fuel;
//   3. driving soundDrive round a turbo car's lap blows off at its shifts and lifts, and an NA car's never.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// ---- 1. source per tab ----
const src = await page.evaluate(() => {
  const out = {};
  for (const t of ['design', 'vehicle', 'garage', 'engine', 'dyno', 'guide', 'options']) { setTab(t); const s = soundSource(); out[t] = s === state ? 'live' : s ? 'replay' : 'none'; }
  setTab('track'); lapReplay.playing = true; out.track = soundSource() ? (soundSource() === state ? 'live' : 'replay') : 'none';
  lapReplay.playing = false; out.trackPaused = soundSource() ? 'on' : 'none'; lapReplay.playing = true;
  return out;
});
console.log('== source by tab: ' + Object.entries(src).map(([k, v]) => k + ' ' + v).join(' · ') + ' ==');
for (const t of ['design', 'vehicle', 'garage', 'engine', 'guide', 'options']) if (src[t] !== 'none') fails.push(`the ${t} tab plays sound (${src[t]})`);
if (src.dyno !== 'live') fails.push('the dyno tab does not play the live engine');
if (src.track !== 'replay') fails.push('the track tab does not play the lap replay');
if (src.trackPaused !== 'none') fails.push('a paused replay still plays');

// the live level: on, then on the dyno tab, then on a silent tab
await page.evaluate(() => { setTab('dyno'); });
await page.click('#btnSound', { force: true }).catch(() => page.evaluate(() => setSound(true)));
await page.waitForTimeout(700);
const lvDyno = await page.evaluate(() => Sound.node ? Sound.node.parameters.get('level').value : -1);
await page.evaluate(() => setTab('design'));
await page.waitForTimeout(700);
const lvDesign = await page.evaluate(() => Sound.node ? Sound.node.parameters.get('level').value : -1);
console.log(`== level on DYNO ${lvDyno.toFixed(3)} · on DESIGN ${lvDesign.toFixed(4)} ==`);
if (!(lvDyno > 0.1)) fails.push(`the dyno tab is silent (level ${lvDyno})`);
if (!(lvDesign >= 0 && lvDesign < 0.01)) fails.push(`the design tab is not silent (level ${lvDesign})`);
await page.evaluate(() => setSound(false));

// ---- 2 and 3. the replay ----
const lap = await page.evaluate(() => {
  const run = name => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === name).engine)); buildEngine();
    setTab('track'); refreshLap();
    const L = lapResult, R = L.replay, n = R.tAt.length;
    let full = null, brake = null, liftIdx = -1;
    for (let i = 0; i < n; i++) {
      if (full === null && R.thr[i] > 0.99 && R.rpm[i] > 0.6 * engine.redline) full = i;
      if (brake === null && R.brk[i] > 0.5) brake = i;
    }
    for (let i = 1; i < n; i++) if (R.thr[i] < 0.03 && R.thr[i - 1] > 0.3) { liftIdx = i; break; }
    const at = i => trackSoundState(replayAt(L, R.tAt[i] + 1e-6));
    const sF = at(full), sB = at(brake), sL = liftIdx >= 0 ? at(liftIdx) : null;
    const dF = soundDrive(0.016, sF), dB = soundDrive(0.016, sB);
    // drive the whole lap at 60 fps, count blow-offs
    Sound.chargeP = 0; Sound.hot = 0;
    let bovs = 0;
    for (let t = 0; t < L.lap; t += 1 / 60) if (soundDrive(1 / 60, trackSoundState(replayAt(L, t))).bov) bovs++;
    return { lap: L.lap, rpmF: sF.rpm, rpmRec: R.rpm[full], strF: dF.strength, strB: dB.strength, cutLift: sL ? sL.fuelCut : null, dfco: engine.canDFCO, bovs };
  };
  return { turbo: run('2.0 Turbo Hot-Hatch I4'), na: run('1.6 Sport NA I4') };
});
for (const [k, r] of Object.entries(lap))
  console.log(`== ${k}: lap ${r.lap.toFixed(1)} s · full throttle at ${r.rpmF.toFixed(0)} rpm (recorded ${r.rpmRec.toFixed(0)}) strength ${r.strF.toFixed(2)} vs braking ${r.strB.toFixed(2)} · lift cuts fuel ${r.cutLift} · ${r.bovs} blow-offs ==`);
for (const [k, r] of Object.entries(lap)) {
  if (Math.abs(r.rpmF - r.rpmRec) > 0.02 * r.rpmRec) fails.push(`${k}: the sound's rpm is not the replay's`);
  if (!(r.strF > 2 * r.strB)) fails.push(`${k}: full throttle does not hit harder than braking on the lap`);
  if (r.dfco && r.cutLift !== true) fails.push(`${k}: a lift on an injected engine does not cut the fuel`);
}
if (!(lap.turbo.bovs > 0)) fails.push('a turbo car never blows off round the lap');
if (lap.na.bovs !== 0) fails.push('an NA car blows off');

await browser.close();
for (const f of fails) console.log('FAIL ' + f);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test73: ${fails.length} failure(s), ${errors.length} error(s)` : 'test73: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
