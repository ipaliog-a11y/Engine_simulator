// WHY THIS EXISTS: E4 Start-Stop (cars without a hybrid).
// What must hold:
//   · default is OFF ('no'), leaving existing presets' WLTP and eco-run numbers unchanged;
//   · enabling START-STOP ('yes') on a non-hybrid adds +6 kg (AGM battery + reinforced starter) and $350;
//   · on WLTP (engineCycle), warm stops shut the engine off (ssOffS > 0, ssStarts > 0), cutting idle fuel
//     and emissions while charging derived 12 V starter crank energy via the alternator on restart,
//     for a net reduction in L/100 km and CO2;
//   · on Eco Run (ecoFuelKg) with standing stops in the speed profile, start-stop cuts idle fuel and
//     net-reduces fuel consumption;
//   · on hybrids, #edStartStop is disabled and engine.startStop is false;
//   · no console or page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const out = {};
  // 1. Default build: startStop is false
  out.defSS = engine.startStop;
  out.defVal = document.getElementById('edStartStop').value;
  out.defDis = document.getElementById('edStartStop').disabled;
  out.mass0 = engineMass();
  out.cost0 = computeCost();
  out.crankJ = starterCrankMechJ(engine);

  const w0 = engineCycle(vehicle);
  out.w0 = { l100: w0.l100, co2: w0.co2, kg: w0.kg, ssOffS: w0.ssOffS, ssStarts: w0.ssStarts };

  // Eco-run profile with a 20 m standing-stop zone (v=0 for 4 segments) then cruise
  const road = buildRoad('alpine');
  const line = road.line.slice(0, 60);
  const vStop = line.map((_, i) => (i >= 15 && i <= 19) ? 0 : 15);
  out.eco0 = ecoFuelKg(line, vStop);

  // 2. Enable START-STOP
  const sel = document.getElementById('edStartStop');
  sel.value = 'yes';
  sel.dispatchEvent(new Event('change'));
  buildEngine();
  out.ssOn = engine.startStop;
  out.mass1 = engineMass();
  out.cost1 = computeCost();

  const w1 = engineCycle(vehicle);
  out.w1 = { l100: w1.l100, co2: w1.co2, kg: w1.kg, ssOffS: w1.ssOffS, ssStarts: w1.ssStarts };
  out.eco1 = ecoFuelKg(line, vStop);

  // 3. Hybrid disables START-STOP
  const hy = document.getElementById('edHybrid');
  hy.value = 'ps';
  hy.dispatchEvent(new Event('change'));
  buildEngine();
  out.hyDis = document.getElementById('edStartStop').disabled;
  out.hySS = engine.startStop;

  return out;
});

if (r.defSS !== false || r.defVal !== 'no' || r.defDis !== false)
  fails.push(`default startStop should be false/'no'/enabled, got ${r.defSS}/${r.defVal}/${r.defDis}`);
if (r.w0.ssOffS !== 0 || r.w0.ssStarts !== 0)
  fails.push(`default WLTP should have 0 ssOffS/ssStarts, got ${r.w0.ssOffS}/${r.w0.ssStarts}`);
if (!(r.crankJ > 500 && r.crankJ < 5000))
  fails.push(`derived starterCrankMechJ out of expected range: ${r.crankJ}`);
if (r.ssOn !== true) fails.push('startStop did not enable');
if (r.mass1 !== r.mass0 + 6) fails.push(`expected +6 kg mass, got ${r.mass0} -> ${r.mass1}`);
if (r.cost1 !== r.cost0 + 350) fails.push(`expected +$350 cost, got ${r.cost0} -> ${r.cost1}`);
if (!(r.w1.ssOffS > 100 && r.w1.ssStarts >= 4))
  fails.push(`expected warm WLTP stops >100 s and >=4 starts, got ${r.w1.ssOffS} s / ${r.w1.ssStarts}`);
if (!(r.w1.l100 < r.w0.l100 && r.w1.co2 < r.w0.co2))
  fails.push(`expected WLTP L/100 and CO2 drop, got ${r.w0.l100.toFixed(3)} -> ${r.w1.l100.toFixed(3)}`);
if (!(r.eco1 < r.eco0))
  fails.push(`expected ecoFuelKg with stops to drop, got ${r.eco0.toFixed(5)} -> ${r.eco1.toFixed(5)}`);
if (r.hyDis !== true || r.hySS !== false)
  fails.push(`expected hybrid to disable start-stop, got disabled=${r.hyDis} startStop=${r.hySS}`);
if (errors.length) fails.push(...errors);

console.log(`WLTP stock: ${r.w0.l100.toFixed(2)} L/100 (${r.w0.co2.toFixed(1)} g/km)`);
console.log(`WLTP S&S:   ${r.w1.l100.toFixed(2)} L/100 (${r.w1.co2.toFixed(1)} g/km), off ${r.w1.ssOffS}s, ${r.w1.ssStarts} restarts, crank ${Math.round(r.crankJ)} J`);
console.log(`Eco w/stop: ${r.eco0.toFixed(4)} -> ${r.eco1.toFixed(4)} kg`);

await browser.close();
if (fails.length) { console.error('FAIL:', fails.join('; ')); process.exit(1); }
console.log('PASS: test286');
