// Live steering and power (build 130): the live-timing wheel turns the way the line does, by the angle the
// wheelbase and the radius give, times the steering ratio on VEHICLE; the power readout is the crank's, at
// most the engine's peak, and nothing when the car is braking or mid-shift.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  loadVehiclePreset(VEHICLE_PRESETS.find(v => v.name === 'Porsche 911 GT3 (991.2, 2017)'));
  const out = { wb: vehicle.wb };
  // A circle drawn clockwise on the map (y grows downward): a steady right-hander of known radius.
  const N = 24, R = 150, pts = [];
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push({ x: 400 + R * Math.cos(a), y: 400 + R * Math.sin(a), z: 0 }); }
  TRACKS.__c = { label: 'CIRCLE', width: 12, names: [], blurb: '', pts }; delete trackCache.__c;
  const C = simulateLap('__c'), cs = C.replay.steer.map(x => x * 180 / Math.PI);
  out.circle = { min: Math.min(...cs), max: Math.max(...cs), expect: Math.atan(vehicle.wb / R) * 180 / Math.PI };
  delete TRACKS.__c; delete trackCache.__c;
  // Spa with the GT3: signs, straights, power bounds.
  const L = simulateLap('spa'), Rp = L.replay, n = Rp.steer.length;
  out.peakW = L.pwrPeak;   // the curve the lap drives, not the as-tuned DYNO figure
  let signBad = 0, signN = 0, straightMax = 0, pwrMax = 0, pwrBrake = 0, pwrCut = 0, pwrNeg = 0;
  for (let i = 0; i < n; i++) {
    const sd = Rp.steer[i] * 180 / Math.PI;
    if (Math.abs(Rp.gLat[i]) > 0.5) { signN++; if (Math.sign(sd) !== Math.sign(Rp.gLat[i])) signBad++; }
    if (Math.abs(Rp.gLat[i]) < 0.02 && L.track.line[i].r > 3000) straightMax = Math.max(straightMax, Math.abs(sd));
    pwrMax = Math.max(pwrMax, Rp.pwr[i]);
    if (Rp.brk[i] > 0 && Rp.pwr[i] > 0) pwrBrake++;
    if (Rp.cut[i] && Rp.pwr[i] > 0) pwrCut++;
    if (!(Rp.pwr[i] >= 0)) pwrNeg++;
  }
  Object.assign(out, { signBad, signN, straightMax, pwrMax, pwrBrake, pwrCut, pwrNeg });
  // The HUD reading at a corner, at two steering ratios.
  let bt = 0, best = 0;
  for (let t = 0; t < L.lap; t += 0.25) { const s = replayAt(L, t); if (Math.abs(s.steer) > best) { best = Math.abs(s.steer); bt = t; } }
  const st = replayAt(L, bt);
  document.getElementById('vhSteer').value = 15; buildVehicle(); const w15 = steerText(st).wheel;
  document.getElementById('vhSteer').value = 30; buildVehicle(); const w30 = steerText(st).wheel;   // clamps to 22
  document.getElementById('vhSteer').value = 11; buildVehicle(); const w11 = steerText(st).wheel;
  out.ratio = { road: st.steer, w15, w30, w11 };
  // Saves: the ratio round-trips, and a save from before it existed loads as 15.
  document.getElementById('vhSteer').value = 12.5; const saved = readVehicleFromForm();
  document.getElementById('vhSteer').value = 18; applyVehicleToForm(saved);
  out.roundTrip = readVehicleFromForm().steerRatio;
  const old = Object.assign({}, saved); delete old.steerRatio; applyVehicleToForm(old);
  out.oldSave = readVehicleFromForm().steerRatio;
  // Both instrument sets draw without throwing.
  lapResult = L; lapReplay.t = bt;
  for (const g of ['digital', 'analog']) { lapReplay.gauges = g; drawTrack(); }
  return out;
});

console.log('== steering ==');
console.log(`  circle R150 (clockwise): road wheels ${r.circle.min.toFixed(2)}..${r.circle.max.toFixed(2)}°, atan(wb/R) = ${r.circle.expect.toFixed(2)}°`);
console.log(`  Spa: sign agrees with lateral g at ${r.signN - r.signBad}/${r.signN} cornering points; straights at most ${r.straightMax.toFixed(2)}°`);
console.log(`  biggest corner: road ${r.ratio.road.toFixed(1)}° -> wheel ${r.ratio.w11.toFixed(0)}° at 11:1, ${r.ratio.w15.toFixed(0)}° at 15:1, ${r.ratio.w30.toFixed(0)}° asked 30:1 (clamped 22)`);
console.log('== power ==');
console.log(`  peak ${Math.round(r.peakW / 745.7)} hp, lap max ${Math.round(r.pwrMax / 745.7)} hp; >0 while braking ${r.pwrBrake}, mid-shift ${r.pwrCut}, negative/NaN ${r.pwrNeg}`);
console.log(`  steering ratio save round-trip ${r.roundTrip}, old save ${r.oldSave}`);

if (!(r.circle.min > 0)) fails.push('a clockwise circle (a right-hander) should steer right (positive) all the way round');
if (Math.abs(r.circle.max / r.circle.expect - 1) > 0.08 || Math.abs(r.circle.min / r.circle.expect - 1) > 0.08)
  fails.push(`circle steering ${r.circle.min.toFixed(2)}..${r.circle.max.toFixed(2)}° is not atan(wb/R) = ${r.circle.expect.toFixed(2)}°`);
if (r.signBad > r.signN * 0.02) fails.push(`steering points the wrong way at ${r.signBad} of ${r.signN} cornering points`);
if (r.straightMax > 1) fails.push(`straights read ${r.straightMax.toFixed(2)}° of steering`);
if (Math.abs(r.ratio.w15 / r.ratio.road - 15) > 1e-6) fails.push('wheel angle is not road angle x 15 at 15:1');
if (Math.abs(r.ratio.w11 / r.ratio.road - 11) > 1e-6) fails.push('wheel angle does not follow the ratio (11:1)');
if (Math.abs(r.ratio.w30 / r.ratio.road - 22) > 1e-6) fails.push('steering ratio is not clamped to 22:1');
if (r.pwrMax > r.peakW * 1.01) fails.push(`power ${Math.round(r.pwrMax / 745.7)} hp exceeds the engine's peak`);
if (r.pwrMax < r.peakW * 0.9) fails.push(`power never gets near the peak on Spa's straights (${Math.round(r.pwrMax / 745.7)} hp)`);
if (r.pwrBrake) fails.push(`power reads above zero at ${r.pwrBrake} braking points`);
if (r.pwrCut) fails.push(`power reads above zero at ${r.pwrCut} mid-shift points`);
if (r.pwrNeg) fails.push(`power is negative or not a number at ${r.pwrNeg} points`);
if (r.roundTrip !== 12.5) fails.push(`steering ratio did not survive a save (${r.roundTrip})`);
if (r.oldSave !== 15) fails.push(`a save without a steering ratio loads as ${r.oldSave}, expected 15`);

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL\n  ' + fails.join('\n  ') : '\nPASS — live steering follows the line and the ratio; live power stays within the engine');
await browser.close();
process.exit(fails.length ? 1 : 0);
