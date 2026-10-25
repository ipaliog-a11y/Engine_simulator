// The launch through tyre slip, and traction control (build 154).
//
// WHY THIS EXISTS. The 0-100 run clipped the drive at the tyre's grip, mu x N: a tyre either held or it did not,
// it never spun, and at the clip the car got the tyre's whole force while the wheels and the engine spun up for free.
// Now the driven wheels turn at their own speed and the tyre pushes through slip, rising to a peak at ~10% and
// falling past it to a sliding plateau, so a wheel that breaks away keeps breaking away. Traction control holds the
// peak; without it the driver holds it through the launch, in first gear (build 155: the optimum is the same small
// slip, and flat), and from the first upshift the run is flat out and the slip dynamics decide. What must hold:
//   · the curve: its peak at the optimum slip, 0.82 of it in a full slide (measured tyres 0.75-0.85);
//   · a powerful rear-driver is slower without traction control and spins its tyres after the launch; a light car,
//     whose second gear cannot spin them, is as quick as with it: the driver's launch is the ECU's;
//   · with traction control the tyre works at its optimum (traction-limited time, but no wheelspin past it);
//   · the launch rpm is the best of several, with traction control or without, and it is recorded;
//   · the setting is a car's equipment: presets carry it, and it survives a garage save and load.
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

const r = await page.evaluate(() => {
  const out = {};
  // 1. the curve
  const s = [0.02, 0.05, TYRE_SLIP_OPT, 0.2, 0.5, 1.0, 3.0].map(x => ({ s: x, mu: tyreSlipMu(x) }));
  let best = 0, bestS = 0; for (let x = 0.001; x < 1; x += 0.001) { const m = tyreSlipMu(x); if (m > best) { best = m; bestS = x; } }
  out.curve = { s, peak: best, peakAt: bestS, slide: tyreSlipMu(3) };
  // 2-3. traction control on and off
  const runTC = (nm, tc) => { loadVehiclePreset(VEHICLE_PRESETS.find(p => p.name.includes(nm)));
    document.getElementById('vhTC').value = tc ? 'on' : 'off'; buildVehicle(); const P = simulateAccel();
    const lDef = clamp(engine.redline * 0.55, engine.idleRpmEff + 400, engine.redline * 0.72);
    return { t100: P.t100, spinT: P.spinT, gripT: P.gripT, launchRpm: P.launchRpm, tc: vehicle.tc, lDef }; };
  out.power = { on: runTC('Hellcat', true), off: runTC('Hellcat', false) };
  out.light = { on: runTC('Aygo', true), off: runTC('Aygo', false) };
  out.rpmOff = runTC('911 GT3 (991', false);
  out.rpmOn = runTC('911 GT3 (991', true);
  // 4. equipment: presets carry it; it survives a save and load
  loadVehiclePreset(VEHICLE_PRESETS.find(p => p.name.includes('F355')));
  out.f355 = { tc: vehicle.tc, form: document.getElementById('vhTC').value };
  loadVehiclePreset(VEHICLE_PRESETS.find(p => p.name.includes('720S')));
  out.mcl = { tc: vehicle.tc };
  document.getElementById('vhTC').value = 'off'; buildVehicle();
  const saved = JSON.parse(JSON.stringify(serializeBuild()));
  document.getElementById('vhTC').value = 'on'; buildVehicle();
  applyBuild(saved);
  out.roundtrip = { tc: vehicle.tc, form: document.getElementById('vhTC').value };
  return out;
});

console.log('== the slip curve ==');
console.log('  ' + r.curve.s.map(x => `s ${x.s}: ${x.mu.toFixed(3)}`).join(' · '));
console.log(`  peak ${r.curve.peak.toFixed(3)} at s = ${r.curve.peakAt.toFixed(3)}; full slide ${r.curve.slide.toFixed(3)} of the peak`);
if (!(Math.abs(r.curve.peakAt - 0.10) < 0.005 && Math.abs(r.curve.peak - 1) < 1e-3)) fails.push('the curve does not peak at 1 at the optimum slip');
if (!(r.curve.slide > 0.75 && r.curve.slide < 0.85)) fails.push(`full-slide grip ${r.curve.slide.toFixed(2)} of the peak is not a measured tyre's (0.75-0.85)`);

console.log('\n== traction control ==');
for (const [k, x] of Object.entries({ 'Hellcat (707 hp, rwd)': r.power, 'Aygo (69 hp, fwd)': r.light }))
  console.log(`  ${k.padEnd(22)} on ${x.on.t100.toFixed(2)} s (wheelspin ${x.on.spinT.toFixed(2)} s) · off ${x.off.t100.toFixed(2)} s (wheelspin ${x.off.spinT.toFixed(2)} s, launched at ${x.off.launchRpm | 0} rpm)`);
// Build 169: the Hellcat runs its own ZF eight-speed now, whose 1st (4.71 x 2.62 = 12.3 overall) is 18% shorter than the
// generic box's. The driver holds the best slip through 1st, so the spin is 2nd gear's alone, and both runs are on the
// traction limit there; what the spin costs is the slide's 18% deficit over its 0.4 s. It was 5.2% on the generic box
// and the bar 3%; the bar is now that it is slower at all, with the spin itself checked below.
if (!(r.power.off.t100 > r.power.on.t100 + 0.01)) fails.push('a 707 hp rear-driver is not slower without traction control');
if (!(r.power.off.spinT > 0.3)) fails.push('a 707 hp rear-driver does not spin its tyres without traction control');
if (!(r.power.on.spinT < 0.05)) fails.push('traction control lets the tyres spin past the optimum');
if (!(r.power.on.gripT > 1)) fails.push('with traction control the Hellcat is not on its traction limit off the line');
// the claim is relative: power is what makes traction control matter (a light car still spins briefly in first)
const lossP = r.power.off.t100 / r.power.on.t100 - 1, lossL = r.light.off.t100 / r.light.on.t100 - 1;
console.log(`  without traction control: the Hellcat loses ${(lossP * 100).toFixed(1)}%, the Aygo ${(lossL * 100).toFixed(1)}%`);
if (!(lossL < lossP / 2)) fails.push(`a 69 hp car loses ${(lossL * 100).toFixed(1)}% without traction control, not well under the 707 hp car's ${(lossP * 100).toFixed(1)}%`);
// the driver holds the launch: a car that cannot spin its tyres in second loses nothing to the ECU
if (!(Math.abs(lossL) < 0.005 && r.light.off.spinT < 0.05)) fails.push(`the driver's launch in the Aygo is ${(lossL * 100).toFixed(1)}% off the ECU's, with ${r.light.off.spinT.toFixed(2)} s of wheelspin`);
console.log(`  911 GT3: launched at ${r.rpmOff.launchRpm | 0} rpm without traction control (${r.rpmOff.t100.toFixed(2)} s), ${r.rpmOn.launchRpm | 0} with it (${r.rpmOn.t100.toFixed(2)} s; 55% of the limiter is ${r.rpmOn.lDef | 0})`);
if (!(r.rpmOff.launchRpm > 0 && r.rpmOn.launchRpm > 0)) fails.push('the launch rpm is not recorded');
if (Math.abs(r.rpmOn.launchRpm - r.rpmOn.lDef) < 1) fails.push('with traction control the GT3 still launches at the fixed 55% of the limiter, not its best launch rpm');

console.log('\n== equipment ==');
console.log(`  F355 (1994): traction control ${r.f355.tc ? 'on' : 'off'} (form ${r.f355.form}) · 720S: ${r.mcl.tc ? 'on' : 'off'} · saved off, loaded back: ${r.roundtrip.tc ? 'on' : 'off'} (form ${r.roundtrip.form})`);
if (r.f355.tc !== false || r.f355.form !== 'off') fails.push('the F355, which had no traction control, is loaded with it');
if (r.mcl.tc !== true) fails.push('the 720S is loaded without its traction control');
if (r.roundtrip.tc !== false || r.roundtrip.form !== 'off') fails.push('traction control does not survive a garage save and load');

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
