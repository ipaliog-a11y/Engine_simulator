// Live timing: the solved lap, replayed against the clock.
//
// WHY THIS EXISTS. Build 104 replays simulateLap's lap in real time on the track map, with the pedals,
// gear, rpm and a g-meter read off the solver's own recording (L.replay). The replay adds no physics,
// so these checks are that it tells the truth about the lap it was given: the clock it runs ends on the
// lap time, the car is where the solver put it, the pedals match what the solver said was limiting the
// car, the g-meter stays inside the tyre, and the controls do what they say.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// ---- 1. the recording, on every circuit, for a light car and a heavy one ----
const rec = await page.evaluate(() => {
  const out = [];
  for (const car of ['Mazda MX-5 1.6 (NA, 1989)', 'Dodge Challenger SRT Hellcat (2015)']) {
    loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === car));
    for (const k of Object.keys(TRACKS)) {
      const L = simulateLap(k), R = L.replay, n = R.tAt.length, line = L.track.line;
      // the clock at the end of the last segment, the way replayAt advances it
      // since build 117 the shifts are in the speeds, so the clock is the plain integral
      const end = R.tAt[n - 1] + line[n - 1].ds3 / Math.max(2, (L.v[n - 1] + L.v[0]) / 2);
      const atStart = replayAt(L, 0), atEnd = replayAt(L, L.lap - 1e-6);
      let thrBad = 0, brkBad = 0, gBad = 0, mono = 0, braked = 0;
      for (let i = 0; i < n; i++) {
        if (L.lim[i] === 'power' && !R.cut[i] && R.thr[i] !== 1) thrBad++;   // mid-shift the drive is cut
        // 'brake' in the solver means slowing faster than 1 m/s2. Drag and a climb can do that alone at
        // speed, and then the driver lifts rather than brakes, so the check is that nobody is flat on
        // the throttle there, and that the brake is used somewhere on the lap.
        if (L.lim[i] === 'brake' && R.thr[i] >= 1) brkBad++;
        if (R.brk[i] > 0) braked++;
        // lateral grip: the tyre's mu on whatever load there is, which downforce and compressions
        // raise; allow both, plus a margin for the solver's discretisation
        if (Math.abs(R.gLat[i]) > vehicle.mu * 1.35 + 0.05) gBad++;
        if (i && !(R.tAt[i] > R.tAt[i - 1])) mono++;
      }
      out.push({ car, k, lap: L.lap, end, startD: Math.hypot(atStart.x - line[0].x, atStart.y - line[0].y),
        endD: Math.hypot(atEnd.x - line[0].x, atEnd.y - line[0].y), thrBad, brkBad, gBad, mono, n, braked,
        gMax: Math.max(...R.gLat.map(Math.abs)), mu: vehicle.mu });
    }
  }
  return out;
});
console.log('== the replay against the lap it replays ==');
for (const r of rec) {
  console.log(`  ${r.car.slice(0, 22).padEnd(22)} ${r.k.padEnd(6)} lap ${r.lap.toFixed(2)} s, clock ends ${r.end.toFixed(2)} s · ` +
    `start ${r.startD.toFixed(1)} m / end ${r.endD.toFixed(1)} m from the line · max lateral ${r.gMax.toFixed(2)} g (mu ${r.mu.toFixed(2)})`);
  if (Math.abs(r.end - r.lap) > r.lap * 0.005) fails.push(`${r.car} @ ${r.k}: the replay clock ends at ${r.end.toFixed(2)} s, not the lap's ${r.lap.toFixed(2)}`);
  if (r.startD > 0.5) fails.push(`${r.car} @ ${r.k}: at t = 0 the car is ${r.startD.toFixed(1)} m from the start line`);
  if (r.endD > 25) fails.push(`${r.car} @ ${r.k}: at the end of the lap the car is ${r.endD.toFixed(1)} m from the start line`);
  if (r.mono) fails.push(`${r.car} @ ${r.k}: the replay clock goes backwards at ${r.mono} points`);
  if (r.thrBad) fails.push(`${r.car} @ ${r.k}: ${r.thrBad} engine-limited points are not at full throttle`);
  if (r.brkBad) fails.push(`${r.car} @ ${r.k}: ${r.brkBad} points slowing hard show full throttle`);
  if (!r.braked) fails.push(`${r.car} @ ${r.k}: the brake is never used`);
  if (r.gBad) fails.push(`${r.car} @ ${r.k}: ${r.gBad} points pull more lateral g than the tyre has`);
}

// ---- 2. the controls ----
await page.evaluate(() => loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === 'Mazda MX-5 1.6 (NA, 1989)')));
await page.click('#tabTrack'); await page.waitForTimeout(600);
const t0 = await page.evaluate(() => lapReplay.t);
await page.waitForTimeout(1000);
const t1 = await page.evaluate(() => lapReplay.t);
await page.click('#btnReplay'); await page.waitForTimeout(600);
const p0 = await page.evaluate(() => lapReplay.t);
await page.waitForTimeout(600);
const p1 = await page.evaluate(() => ({ t: lapReplay.t, label: document.getElementById('btnReplay').textContent }));
await page.click('#btnReplay');
await page.selectOption('#replaySpeed', '4');
const s0 = await page.evaluate(() => lapReplay.t); await page.waitForTimeout(1000);
const s1 = await page.evaluate(() => lapReplay.t);
await page.click('#btnReplayRestart');
const r0 = await page.evaluate(() => lapReplay.t);
console.log(`\n== controls: 1x ran ${(t1 - t0).toFixed(2)} s in 1 s · paused ${(p1.t - p0).toFixed(2)} s ("${p1.label}") · 4x ran ${(s1 - s0).toFixed(2)} s · restart -> ${r0.toFixed(2)} ==`);
if (!(t1 - t0 > 0.6 && t1 - t0 < 1.4)) fails.push(`at 1x the clock ran ${(t1 - t0).toFixed(2)} s in a second`);
if (Math.abs(p1.t - p0) > 1e-9) fails.push('PAUSE did not stop the clock');
if (!/PLAY/.test(p1.label)) fails.push('the paused button does not offer PLAY');
if (!((s1 - s0) > 2.5 * (t1 - t0))) fails.push('4x does not run the clock faster than 1x');
if (r0 > 0.2) fails.push('RESTART did not put the clock back to the start');

// ---- 3. the instruments (build 112): analog gauges, and a boost gauge that reads the engine ----
const gz = await page.evaluate(() => {
  const out = {};
  for (const [k, car] of [['turbo', 'Toyota Supra RZ (A80, 1993)'], ['na', 'Porsche 911 GT3 (991.2, 2017)']]) {
    loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === car));
    const L = simulateLap('mixed'), R = L.replay; let bad = 0, wot = 0;
    // Since build 118 the gauge shows the boost the turbo's shaft has built, so just after a lift or a shift it
    // can read under the engine's boost at full throttle while the shaft spools back; it may never read over it,
    // and on all but a few points it is the full boost.
    let under = 0;
    for (let i = 0; i < R.map.length; i++) if (R.thr[i] === 1) { wot++; const d = R.map[i] - (1 + boostAvail(R.rpm[i]));
      // 0.005 bar (build 123): with a factory taper the boost falls with rpm, and the shaft walk evaluates it at its
      // own rpm, which differs from the replay's by a fraction (gear runs shorter than 40 m are merged in the replay)
      if (d > 5e-3) bad++; else if (d < -5e-3) under++; }
    if (under > 0.05 * wot) bad += under;
    out[k] = { maxMap: Math.max(...R.map), minMap: Math.min(...R.map), bad, wot, boost: engine.boost_bar };
  }
  return out;
});
console.log(`\n== boost gauge: Supra ${(gz.turbo.minMap - 1).toFixed(2)} to +${(gz.turbo.maxMap - 1).toFixed(2)} bar (set ${gz.turbo.boost}) · GT3 (NA) up to ${(gz.na.maxMap - 1).toFixed(2)} bar ==`);
if (gz.turbo.bad || gz.na.bad) fails.push('at full throttle the gauge does not read the engine\'s own boost at that rpm');
if (!(gz.turbo.maxMap > 1.3)) fails.push('the turbo car never shows boost on a lap');
if (!(gz.turbo.minMap < 0.5)) fails.push('a closed throttle does not pull vacuum');
if (gz.na.maxMap > 1 + 1e-9) fails.push('an NA engine shows boost');
await page.selectOption('#replayGauges', 'analog'); await page.waitForTimeout(300);
const an = await page.evaluate(() => { let st = null; try { st = localStorage.getItem('pes.gauges'); } catch (e) {} return { mode: lapReplay.gauges, st }; });
await page.selectOption('#replayGauges', 'digital'); await page.waitForTimeout(200);
console.log(`== gauges: analog selected -> mode ${an.mode}, remembered "${an.st}" ==`);
if (an.mode !== 'analog') fails.push('the ANALOG option does not switch the instruments');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
