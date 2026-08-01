import { chromium } from './pw.mjs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`file://${repo}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// 1. All four gearboxes on the same car
console.log('== same car (3.0T coupe), four gearboxes ==');
const gbs = await page.evaluate(() => ['manual', 'sequential', 'dct', 'auto'].map(g => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 6, bore_mm: 84, stroke_mm: 90, intake: 'turbo', boost_bar: 1.0, turboSize: 'medium' })); buildEngine();
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, { chassis: 'coupe', gearbox: g })); buildVehicle();
  return {
    g, label: vehicle.gbLabel, shift: vehicle.shiftTime, eff: +vehicle.driveEff.toFixed(3),
    r1: +vehicle.ratios[0].toFixed(2), rn: +vehicle.ratios[vehicle.ratios.length - 1].toFixed(2),
    t100: +perf.t100.toFixed(2), q400: +perf.q400.t.toFixed(2), top: Math.round(perf.topSpeed), cost: vehicle.cost
  };
}));
console.log('  type        shift  drvEff  1st   top   0-100   400m    Vmax   cost');
for (const r of gbs) console.log(`  ${r.g.padEnd(11)} ${String(r.shift * 1000).padStart(4)}ms ${r.eff}  ${r.r1}  ${r.rn}  ${String(r.t100).padStart(5)}s ${String(r.q400).padStart(6)}s ${String(r.top).padStart(4)}  ${r.cost}`);

const by = Object.fromEntries(gbs.map(r => [r.g, r]));
if (!(by.dct.t100 < by.sequential.t100)) fails.push('DCT should beat sequential (faster shifts)');
if (!(by.sequential.t100 < by.manual.t100)) fails.push('sequential should beat manual (faster shifts)');
if (!(by.manual.eff > by.auto.eff)) fails.push('manual driveline efficiency should exceed the auto');
if (!(by.auto.r1 > by.manual.r1)) fails.push('auto should have a lower (numerically higher) 1st gear');
if (!(by.sequential.r1 < by.manual.r1)) fails.push('sequential should have closer ratios than manual');

// 2. Torque converter: the auto must out-launch the manual off the line on a heavy torquey car,
//    while still losing on efficiency at the top end.
console.log('\n== torque converter launch: heavy diesel pickup ==');
const tc = await page.evaluate(() => ['manual', 'auto'].map(g => {
  const p = PRESETS.find(x => x.name === '6.6 V8 Turbodiesel');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine();
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, { chassis: 'pickup' })); applyChassisFit('pickup');
  document.getElementById('vhGearbox').value = g; buildVehicle();
  // sample launch force at a crawl
  const r0 = vehicle.rTire, tot = vehicle.ratios[0] * vehicle.finalDrive, TWO_PI = Math.PI * 2;
  const gb = vehicle.gb, idle = engine.idleRpmEff, rl = engine.redline;
  const at = v => {
    const rpm = v * tot / r0 * 60 / TWO_PI;
    let er, mult = 1;
    if (gb.stall) { const st = clamp(gb.stall, idle, rl * 0.85); if (rpm < st) { er = st; mult = 1 + (gb.mult - 1) * (1 - rpm / st); } else er = rpm; er = clamp(er, idle, rl); }
    else { const lr = clamp(rl * 0.55, idle + 400, rl * 0.72); er = clamp(rpm < lr ? lr : rpm, idle, rl); }
    return { v, er: Math.round(er), mult: +mult.toFixed(2) };
  };
  return { g, t100: +perf.t100.toFixed(2), q400: +perf.q400.t.toFixed(2), top: Math.round(perf.topSpeed), pts: [1, 3, 6].map(at) };
}));
tc.forEach(r => console.log(`  ${r.g.padEnd(7)} 0-100 ${r.t100}s  400m ${r.q400}s  top ${r.top}  | launch: ` + r.pts.map(p => `${p.v}m/s→${p.er}rpm x${p.mult}`).join('  ')));
if (!(tc.find(r => r.g === 'auto').t100 < tc.find(r => r.g === 'manual').t100)) fails.push('torque-conv auto should out-launch the manual on a heavy diesel pickup');
if (!(tc.find(r => r.g === 'auto').pts[0].mult > 1.5)) fails.push('converter should multiply torque off the line');
if (!(tc.find(r => r.g === 'auto').pts[2].mult < tc.find(r => r.g === 'auto').pts[0].mult)) fails.push('converter multiplication should fade as the turbine catches up');

// 2b. Character check: the converter suits a heavy torquey engine and HURTS a light peaky one
console.log('\n== auto vs manual by engine character ==');
const chars = await page.evaluate(() => [['6.6 V8 Turbodiesel', 'pickup', 'heavy torquey'], ['2.0 ITB NA Screamer I4', 'roadster', 'light peaky']].map(([nm, ch, desc]) => {
  const pr = PRESETS.find(x => x.name === nm), o = { desc };
  for (const g of ['manual', 'auto']) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine)); buildEngine();
    applyChassisFit(ch); document.getElementById('vhGearbox').value = g; buildVehicle();
    o[g] = +perf.t100.toFixed(2);
  }
  return o;
}));
chars.forEach(c => console.log(`  ${c.desc.padEnd(14)} manual ${c.manual}s  auto ${c.auto}s  → auto is ${c.auto < c.manual ? 'BETTER' : 'WORSE'}`));
if (!(chars[0].auto < chars[0].manual)) fails.push('auto should help the heavy torquey engine');
if (!(chars[1].auto > chars[1].manual)) fails.push('auto should hurt the light peaky engine (stall well below its launch rpm)');

// 3. Chassis fits carry a coherent gearbox and isFactoryFit round-trips
console.log('\n== chassis factory gearboxes ==');
const fits = await page.evaluate(() => Object.keys(CHASSIS).map(k => {
  applyChassisFit(k); buildVehicle();
  return { k, label: vehicle.chLabel, gb: readVehicleFromForm().gearbox, stock: isFactoryFit(readVehicleFromForm()) };
}));
fits.forEach(f => console.log(`  ${f.label.padEnd(18)} ${f.gb.padEnd(11)} stock=${f.stock}`));
if (fits.some(f => !f.stock)) fails.push('a chassis fit does not round-trip through isFactoryFit');
if (new Set(fits.map(f => f.gb)).size < 4) fails.push('chassis fits do not use all four gearbox types');

// 4. Serialize round-trip
const rt = await page.evaluate(() => {
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, { chassis: 'super', gearbox: 'sequential' })); buildVehicle();
  const before = readVehicleFromForm(), s = serializeBuild('t', '');
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE)); buildVehicle();
  applyBuild(s);
  return { same: JSON.stringify(before) === JSON.stringify(readVehicleFromForm()), gb: readVehicleFromForm().gearbox };
});
console.log('\nserialize round-trip:', rt.same, '| gearbox', rt.gb);
if (!rt.same) fails.push('vehicle serialize round-trip broken');

// 5. Legacy saves with no gearbox field must default cleanly
const legacy = await page.evaluate(() => {
  const s = { app: APP_TAG, v: APP_VER, engine: Object.assign({}, DEFAULT_ENGINE), vehicle: { chassis: 'coupe', drive: 'rwd', gears: 6, gearing: 55, tireType: 'sport', tireWidth: 235, tireAspect: 40, wheelDia: 18, aeroFront: 'none', aeroRear: 'none', aeroFloor: 'none', weightRed: 'none', brakeType: 'slotted', rotor: 330, suspension: 'sport' } };
  applyBuild(s);
  return { gb: readVehicleFromForm().gearbox, ok: !!vehicle.gb, t100: perf.t100 ? +perf.t100.toFixed(2) : null };
});
console.log('legacy save (no gearbox field) →', legacy.gb, '| perf computed:', legacy.t100 + 's');
if (legacy.gb !== 'manual' || !legacy.ok) fails.push('legacy save without a gearbox field does not default to manual');

// 6. UI + Greek
await page.click('#tabVehicle'); await page.waitForTimeout(150);
await page.selectOption('#vhGearbox', 'auto'); await page.waitForTimeout(120);
const summary = await page.evaluate(() => document.getElementById('vehicleSummary').textContent);
console.log('\nsummary contains converter line:', /converter stall/.test(summary));
if (!/converter stall/.test(summary)) fails.push('summary missing torque-converter detail');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(150);
const el = await page.evaluate(() => ({ lbl: document.querySelector('label[for="vhGearbox"]').textContent, sum: document.getElementById('vehicleSummary').textContent.match(/ΑΥΤΟΜΑΤΟ[^•]*/) }));
console.log('EL label:', el.lbl, '| EL summary gearbox:', el.sum ? el.sum[0].trim() : 'MISSING');
if (!el.sum) fails.push('Greek summary does not translate the gearbox label');
await page.evaluate(() => applyLang('en'));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
