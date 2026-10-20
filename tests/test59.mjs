// A spark engine's torque, from the fuel it burns.
//
// WHY THIS EXISTS. Spark engines took IMEP from air times a fitted constant (IMEP_K = 13.2) and gave
// every fuel the same energy per kg of air. The shape was already fuel-shaped (air x phi x faEta is fuel
// x an efficiency); the constant was the fit. Now the efficiency is Heywood's: a real engine reaches
// ~0.8 of the fuel-air cycle, 0.47 at CR 10 and phi 1. These checks are against that published figure
// and against measured full-load fuel consumption, not against the model's own earlier output.
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
  // 1. the efficiency: 0.8 x fuel-air, 0.47 at CR 10 (Heywood fig. 5-9)
  out.faCR10 = 1 - Math.pow(10, 1 - GAMMA_FA);
  // 2. the implied gross indicated efficiency, from torque, against fuel energy
  const mx5 = { type: 'petrol4', cylinders: 4, bore_mm: 78.0, stroke_mm: 83.6, compression: 9.4, redline: 7200, intake: 'na',
    cam: 'stock', injector: 'port', octane: 95, intakeSys: 'efi', exhaust: 'stock', airFilter: 'stock', vvt: false };
  const implied = (eng, lam) => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, eng)); buildEngine();
    const e = engine; e.afrMode = 'fixed'; Object.assign(state, DYNO_STD, { systemVoltage: 14 }); state.afr = e.stoichAFR * lam;
    const n = e.score.peakTQrpm, map = wotMapAt(n), c = calcAtRpm(n), { oilFrictionMult } = tempFactors(90, 100);
    const imep = c.bmep + pumpFrictionMEP(n, map, oilFrictionMult);
    const fuelE = map * 1e5 / (287 * (effIAT(map, n) + 273.15)) * c.ve / (lam * e.stoichAFR) * e.fuelLHV * 1e6;
    return { etaI: imep * 1e5 / fuelE, bsfc: 3600 / (c.bmep * 1e5 / fuelE * e.fuelLHV), cr: e.compression };
  };
  out.mx5 = { stoich: implied(mx5, 1.0), rich: implied(mx5, 0.86) };
  // 3. fuels: torque follows energy per kg of air, LHV / AFR_st
  out.fuels = ['gasoline', 'race', 'e85', 'methanol'].map(f => {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(p => p.name === '1.6 Sport NA I4').engine, { fuel: f, octane: 98 })); buildEngine();
    const e = engine; e.afrMode = 'fixed'; Object.assign(state, DYNO_STD, { systemVoltage: 14, iat: 25 }); state.afr = e.stoichAFR * 1.0;
    const n = 3000, map = wotMapAt(n);
    // gross IMEP per unit trapped air, so charge cooling (which changes the AIR) does not enter
    const air = map * 1e5 / (287 * (effIAT(map, n) + 273.15)) * computeVE(n, map);
    return { f, perAir: sparkGrossImep(n, map, computeVE(n, map)) / air, energy: e.fuelLHV / e.stoichAFR };
  });
  return out;
});

console.log(`== fuel-air cycle at CR 10, phi 1: ${r.faCR10.toFixed(3)} (Heywood ~0.47); a real engine reaches 0.8 of it ==`);
if (Math.abs(r.faCR10 - 0.47) > 0.015) fails.push(`the fuel-air efficiency at CR 10 is ${r.faCR10.toFixed(3)}, not Heywood's ~0.47`);
const want = (cr) => 0.8 * (1 - Math.pow(cr, -0.28));
console.log(`== MX-5 B6 at peak torque: gross indicated ${r.mx5.stoich.etaI.toFixed(3)} at λ1 (0.8 x fuel-air ${want(9.4).toFixed(3)}), full-load BSFC ${Math.round(r.mx5.rich.bsfc)} g/kWh at λ0.86 ==`);
if (Math.abs(r.mx5.stoich.etaI - want(9.4)) > 0.01) fails.push(`implied gross efficiency ${r.mx5.stoich.etaI.toFixed(3)} is not 0.8 x the fuel-air cycle (${want(9.4).toFixed(3)})`);
// Published: an NA spark engine at full load, rich for power, burns 270-300 g/kWh.
if (!(r.mx5.rich.bsfc > 260 && r.mx5.rich.bsfc < 310)) fails.push(`full-load BSFC ${Math.round(r.mx5.rich.bsfc)} g/kWh is outside a real NA engine's 270-300`);

console.log('\n== gross IMEP per kg of trapped air follows the fuel\'s energy per kg of air ==');
const g = r.fuels.find(x => x.f === 'gasoline');
for (const x of r.fuels) console.log(`  ${x.f.padEnd(9)} LHV/AFR ${x.energy.toFixed(3)} MJ/kg air   IMEP per air ${(x.perAir / g.perAir).toFixed(3)} x gasoline`);
for (const x of r.fuels) {
  const ratio = (x.perAir / g.perAir) / (x.energy / g.energy);
  if (Math.abs(ratio - 1) > 1e-6) fails.push(`${x.f}: IMEP per air does not follow LHV/AFR (${ratio.toFixed(4)})`);
}

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
