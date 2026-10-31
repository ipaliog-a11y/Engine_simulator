// A car's brake split, from the regulation its maker designs to (build 203).
//
// WHY THIS EXISTS. Every car braked 71-74% on the front: the split came from the brake kit's calipers, whatever the car's
// weight, so a 911 braked like a front-heavy hatch. A maker sizes the rear brakes to the car. UN ECE R13-H (FMVSS 135
// likewise) requires the front axle to lock first at every deceleration z from 0.15 to 0.8 g: the front's share of the
// braking may not fall below the front axle's share of the load at z, fWt + z h/L, and is set at that line for 0.8 g,
// where the rears do the most they safely can. Until build 203 the split was also taken before the car's weight split,
// wheelbase and centre of gravity were set, so it read the car loaded before. What must hold:
//   · every car's front share is fWt + 0.8 h/L (within 0.5-0.85), from its own figures, whatever was loaded before;
//   · the regulation itself: from 0.15 to 0.8 g the front axle needs more of its grip than the rear (it locks first);
//   · a rear-engined car brakes far more on its rears than a front-heavy one;
//   · the guide says why the rear brakes stay cool on a lap (a perfect driver at the combined limit), in both languages.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const o = { cars: [] };
  // each car loaded after a very different one, so a split left over from the car before would show
  const heavy = FACTORY_CARS.find(p => p.name.includes('F-150 Raptor')), rear = FACTORY_CARS.find(p => p.name.includes('911 GT3 (991.2'));
  for (const p of FACTORY_CARS) {
    loadVehiclePreset(p.name === heavy.name ? rear : heavy); loadVehiclePreset(p);
    const v = vehicle, want = Math.min(0.85, Math.max(0.5, v.fWt + R13H_Z * v.cg / v.wb));
    let lockFirst = true;
    for (let z = 0.15; z <= 0.8 + 1e-9; z += 0.05) {
      const dF = v.fWt + z * v.cg / v.wb, needF = v.brakeFrontShare * z / dF, needR = (1 - v.brakeFrontShare) * z / (1 - dF);
      if (needF < needR - 1e-9) lockFirst = false;
    }
    o.cars.push({ n: p.name, fWt: v.fWt, fH: v.brakeFrontShare, want, lockFirst, cap: v.brakeDecelCap / G });
  }
  // the guide
  const page = document.getElementById('gp-brakes');
  o.guideEn = /rear brakes/.test(page.querySelector('[data-gk="brakesLimit"]').textContent) && /R13-H/.test(page.querySelector('[data-gk="brakesPhys"]').textContent);
  applyLang('el');
  o.guideEl = /πίσω φρένα/.test(page.querySelector('[data-gk="brakesLimit"]').textContent) && /R13-H/.test(page.querySelector('[data-gk="brakesPhys"]').textContent);
  applyLang('en');
  return o;
});
await browser.close();

const f = (x, d = 2) => (+x).toFixed(d);
const byName = n => r.cars.find(c => c.n.includes(n));
console.log('== the front share of the braking, against fWt + 0.8 h/L ==');
for (const n of ['911 GT3 (991.2', 'Porsche 911 Carrera RS 2.7', 'BMW M3 (E46', 'F-150 Raptor', 'Golf GTI (Mk7', 'Toyota Aygo', 'Tesla Model 3 RWD']) {
  const c = byName(n); if (c) console.log(`  ${c.n.slice(0, 36).padEnd(36)} front weight ${f(c.fWt)}  front braking ${f(c.fH)}  (brakes ${f(c.cap)} g)`);
}
for (const c of r.cars) {
  if (Math.abs(c.fH - c.want) > 1e-9) fails.push(`${c.n}: front braking ${f(c.fH, 3)}, not ${f(c.want, 3)} (fWt + 0.8 h/L)`);
  if (!c.lockFirst) fails.push(`${c.n}: the rear axle locks first somewhere between 0.15 and 0.8 g`);
}
const gt3 = byName('911 GT3 (991.2'), golf = byName('Golf GTI (Mk7');
if (!(gt3.fH < golf.fH - 0.15)) fails.push(`a 911 GT3 (${f(gt3.fH)}) does not brake far more on its rears than a Golf GTI (${f(golf.fH)})`);
const spread = Math.max(...r.cars.map(c => c.fH)) - Math.min(...r.cars.map(c => c.fH));
console.log(`== ${r.cars.length} cars, front braking ${f(Math.min(...r.cars.map(c => c.fH)))} to ${f(Math.max(...r.cars.map(c => c.fH)))}; guide: English ${r.guideEn}, Greek ${r.guideEl} ==`);
if (!(spread > 0.2)) fails.push('the brake split hardly varies between cars: it is still the kit\'s');
if (!r.guideEn || !r.guideEl) fails.push('the guide does not explain the brake split and the cool rear brakes in both languages');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: every car brakes on the split its maker would give it, the front locking first to 0.8 g, and the guide says why its rears stay cool.');
process.exit(fails.length || errors.length ? 1 : 0);
