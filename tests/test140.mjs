// AC copper loss (plans/hybrid-electric/drivetrain.md, stage 4).
//
// WHY THIS EXISTS. Slot copper was DC resistance only, so more poles were almost free at high speed.
// The strands now have Dowell's eddy currents. What must hold:
//   · at stall the factor is 1, and the Model 3 phase resistance is still the DC one;
//   · at the same torque the copper loss rises with speed, and a thinner strand rises less.
// The Leaf's peak above 96.5% is test96, which counts copper, iron and mechanical loss and still passes.
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
  const M3 = { rotorD: 149.9, stackL: 134, poles: 6, turns: 12, magnet: 'ndfeb', retention: 'bridges', cooling: 'jacket', inverter: 'igbt', invAmps: 953, maxRpm: 18000 };
  const m = motorBuild(M3), thin = motorBuild(Object.assign({}, M3, { strand: 0.0005 }));
  const pt = { w: 90, r: 70 }, V = 350;
  const cu = (motor, rpm) => motorLosses(motor, 60, rpm, V, pt).cu;
  loadVehiclePreset(EV_VEHICLE_PRESETS.find(p => /Model 3/.test(p.name)));
  return {
    R: m.R20 * 1000, k0: copperAC(m, 0, 90), k1: copperAC(m, 1000, 90), k15: copperAC(m, 15000, 90), kThin: copperAC(thin, 15000, 90),
    cu0: cu(m, 0), cu1: cu(m, 1000), cu15: cu(m, 15000),
    layers: m.cuLayers,
    wh: EV_VEHICLE_PRESETS.map(p => { loadVehiclePreset(p); return { name: p.name, whkm: evCycle(engine, vehicle).whkm }; })
  };
});
const f = (x, d = 3) => (+x).toFixed(d);
console.log(`== Model 3 strands: ${f(r.layers, 1)} layers, Rdc ${f(r.R, 2)} mOhm; AC factor 0 / 1000 / 15000 rpm ${f(r.k0)} / ${f(r.k1)} / ${f(r.k15)}; ` +
  `0.5 mm strand at 15000 rpm ${f(r.kThin)}; copper loss ${f(r.cu0, 0)} / ${f(r.cu1, 0)} / ${f(r.cu15, 0)} W ==`);
console.log(`== WLTP ${r.wh.map(c => c.name.split(' (')[0] + ' ' + f(c.whkm, 2)).join(', ')} Wh/km ==`);
if (Math.abs(r.k0 - 1) > 1e-9) fails.push('at stall the AC factor is not 1');
if (!(r.R > 0.5 * 4.75 && r.R < 1.5 * 4.75)) fails.push(`phase resistance ${f(r.R, 2)} mOhm is not the DC one near 4.75`);
if (!(r.k15 > r.k1 && r.k1 > 1)) fails.push('copper loss does not rise with speed');
if (!(r.cu15 / r.cu1 > r.k15 / r.k1 * 0.5)) fails.push('the copper loss at the same torque does not rise with speed');
if (!(r.kThin < r.k15 && r.kThin > 1)) fails.push('a thinner strand does not cut the high-speed factor');
const pub = [['Model 3', 117], ['Model Y', 138], ['Plaid', 158]];
for (const [k, veh] of pub) {
  const c = r.wh.find(x => x.name.includes(k));
  const pct = (c.whkm / veh - 1) * 100;
  if (Math.abs(pct) > 8) fails.push(`${c.name}: ${f(c.whkm, 1)} Wh/km is ${f(pct, 1)}% off ${veh}, outside the 8% band`);
}

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length || errors.length) {
  console.log('\nFAIL:\n  ' + fails.concat(errors).join('\n  '));
  process.exit(1);
}
console.log('\nOK: stall copper is the DC resistance. It rises with speed, a thinner strand rises less, and the Leaf and the WLTP bands still hold.');
await browser.close();
