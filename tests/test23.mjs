import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

async function run(eng, veh) {
  return page.evaluate(({ eng, veh }) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, eng)); buildEngine();
    applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, veh)); buildVehicle();
    const p = perf;
    return {
      hp: engine.score.peakHP, mass: Math.round(vehicle.mass), mu: +vehicle.mu.toFixed(2), capG: +(vehicle.brakeDecelCap / 9.81).toFixed(2),
      t100: p.t100 ? +p.t100.toFixed(2) : null, top: Math.round(p.topSpeed),
      b100: p.brake100 ? +p.brake100.dist.toFixed(1) : null,
      t200: p.t200 ? +p.t200.toFixed(1) : null, zt: p.zt ? +p.zt.toFixed(1) : null, zd: p.zd ? Math.round(p.zd) : null
    };
  }, { eng, veh });
}

const perfEng = { cylinders: 8, bore_mm: 94, stroke_mm: 89, layout: 'v', intake: 'turbo', boost_bar: 1.2, turboConfig: 'twin', turboSize: 'large', cam: 'sport', exhaust: 'race' };

// Brake type: bigger/better = shorter 100-0 (up to the tyre limit)
console.log('== brakes (super, semi-slicks) ==');
for (const b of ['steel', 'slotted', 'big', 'carbon']) {
  const r = await run(perfEng, { chassis: 'super', drive: 'awd', tireType: 'semi', tireWidth: 315, brakeType: b, rotor: 350, suspension: 'sport' });
  console.log(`  ${b.padEnd(8)} cap ${r.capG}g: 100-0 ${r.b100} m  |  0-200-0 ${r.zt}s (${r.zd} m, reached 200 @ ${r.t200}s)`);
}

// Tyre grip on braking (carbon brakes, so tyre-limited)
console.log('\n== tyre grip on 100-0 (carbon brakes) ==');
for (const t of ['eco', 'street', 'sport', 'slick']) {
  const r = await run(perfEng, { chassis: 'coupe', drive: 'rwd', tireType: t, tireWidth: 275, brakeType: 'carbon', rotor: 380 });
  console.log(`  ${t.padEnd(7)} μ${r.mu}: 100-0 ${r.b100} m`);
}

// Suspension grip effect
console.log('\n== suspension (grip → accel & braking) ==');
for (const s of ['comfort', 'sport', 'coilover', 'race']) {
  const r = await run(perfEng, { chassis: 'coupe', drive: 'rwd', tireType: 'sport', tireWidth: 265, suspension: s, brakeType: 'big', rotor: 360 });
  console.log(`  ${s.padEnd(9)} μ${r.mu}: 0-100 ${r.t100}s  100-0 ${r.b100} m`);
}

// Slow car can't reach 200 → 0-200-0 shows null
console.log('\n== slow car cannot reach 200 ==');
const slow = await run({ cylinders: 3, bore_mm: 73, stroke_mm: 79.6, intake: 'na', redline: 6500 }, { chassis: 'kei', drive: 'fwd', tireType: 'eco', tireWidth: 165 });
console.log('  kei 1.0 NA: top', slow.top, 'km/h  0-200-0:', slow.zt, '(null expected)  100-0', slow.b100, 'm');

// UI: perf grid now has 8 cells incl braking
await page.click('#tabVehicle'); await page.waitForTimeout(120);
const cells = await page.evaluate(() => [...document.querySelectorAll('#perfGrid .perf-cell .k')].map(e => e.textContent));
console.log('\nperf cells:', cells.join(' | '));

console.log('\nERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
