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

// 1. Ordering on a traction-limited car: open < viscous < clutch LSD < spool
console.log('== 842 hp muscle car (traction-limited) ==');
const strong = await page.evaluate(() => ['open', 'visc', 'clsd', 'spool'].map(d => {
  const p = PRESETS.find(x => x.name === '6.2 Supercharged V8');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine();
  applyChassisFit('muscle'); document.getElementById('vhDiff').value = d; buildVehicle();
  return { d, label: vehicle.diffLabel, tr: vehicle.diffTraction, t100: +perf.t100.toFixed(2), q400: +perf.q400.t.toFixed(2), top: Math.round(perf.topSpeed), cost: vehicle.cost };
}));
strong.forEach(r => console.log(`  ${r.label.padEnd(18)} ${(r.tr * 100).toFixed(0)}% grip: 0-100 ${r.t100}s  400m ${r.q400}s  top ${r.top}  $${r.cost}`));
for (let i = 1; i < strong.length; i++) if (!(strong[i].t100 <= strong[i - 1].t100)) fails.push(`${strong[i].d} should not be slower than ${strong[i - 1].d}`);
if (!(strong[0].t100 - strong[3].t100 > 0.3)) fails.push('diff choice should matter substantially on a traction-limited car');

// 2. An engine-limited car should barely care
console.log('\n== 48 hp 2-stroke kei (engine-limited) ==');
const weak = await page.evaluate(() => ['open', 'spool'].map(d => {
  const p = PRESETS.find(x => x.name === '500cc 2-Stroke Twin');
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine();
  applyChassisFit('kei'); document.getElementById('vhDiff').value = d; buildVehicle();
  return { d, t100: +perf.t100.toFixed(2), top: Math.round(perf.topSpeed) };
}));
weak.forEach(r => console.log(`  ${r.d.padEnd(6)} 0-100 ${r.t100}s  top ${r.top}`));
const weakDelta = weak[0].t100 - weak[1].t100, strongDelta = strong[0].t100 - strong[3].t100;
console.log(`  open→spool gain: engine-limited ${weakDelta.toFixed(2)}s vs traction-limited ${strongDelta.toFixed(2)}s`);
if (!(weakDelta < strongDelta * 0.5)) fails.push('diff should matter far less on an engine-limited car');

// 3. Top speed must be unaffected (drag-limited, not traction-limited)
if (!(strong[0].top === strong[3].top)) fails.push('diff should not change top speed');
console.log('\ntop speed unaffected by diff:', strong[0].top === strong[3].top);

// 4. Chassis fits carry a diff, round-trip, and use a range of types
console.log('\n== chassis factory differentials ==');
const fits = await page.evaluate(() => Object.keys(CHASSIS).map(k => {
  applyChassisFit(k); buildVehicle();
  const v = readVehicleFromForm();
  return { label: vehicle.chLabel, gb: v.gearbox, df: v.diff, stock: isFactoryFit(v) };
}));
fits.forEach(f => console.log(`  ${f.label.padEnd(18)} ${f.gb.padEnd(11)} ${f.df.padEnd(6)} stock=${f.stock}`));
if (fits.some(f => !f.stock)) fails.push('a chassis fit does not round-trip through isFactoryFit');
if (new Set(fits.map(f => f.df)).size < 4) fails.push('chassis fits do not use all four diff types');

// 5. Serialize + legacy defaults
const ser = await page.evaluate(() => {
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, { chassis: 'rally', diff: 'spool' })); buildVehicle();
  const before = readVehicleFromForm(), s = serializeBuild('t', '');
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE)); buildVehicle(); applyBuild(s);
  const same = JSON.stringify(before) === JSON.stringify(readVehicleFromForm());
  // legacy save with neither gearbox nor diff
  applyBuild({ app: APP_TAG, v: APP_VER, engine: Object.assign({}, DEFAULT_ENGINE), vehicle: { chassis: 'coupe', drive: 'rwd', gears: 6, gearing: 55, tireType: 'sport', tireWidth: 235, tireAspect: 40, wheelDia: 18, aeroFront: 'none', aeroRear: 'none', aeroFloor: 'none', weightRed: 'none', brakeType: 'slotted', rotor: 330, suspension: 'sport' } });
  const lv = readVehicleFromForm();
  return { same, legacyDiff: lv.diff, legacyGb: lv.gearbox, legacyOk: !!vehicle.df && perf != null };
});
console.log('\nserialize round-trip:', ser.same, '| legacy save →', ser.legacyGb + '/' + ser.legacyDiff, '| computes:', ser.legacyOk);
if (!ser.same) fails.push('serialize round-trip broken');
// A legacy save must land on clutch-LSD (traction 1.00) — the pre-diff model had no traction
// penalty at all, so this reproduces old saves' numbers exactly.
if (ser.legacyDiff !== 'clsd' || !ser.legacyOk) fails.push('legacy save should default to the traction-neutral clutch LSD');
const backCompat = await page.evaluate(() => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, { cylinders: 8, intake: 'turbo', boost_bar: 1.2 })); buildEngine();
  applyVehicleToForm(Object.assign({}, DEFAULT_VEHICLE, { chassis: 'muscle', diff: 'clsd' })); buildVehicle();
  return { tr: vehicle.diffTraction, t100: +perf.t100.toFixed(3) };
});
console.log('back-compat: clutch LSD traction factor =', backCompat.tr, '(1.0 → identical to the pre-diff model)');
if (backCompat.tr !== 1) fails.push('clutch LSD must be traction-neutral for back-compat');

// 6. UI + Greek
await page.click('#tabVehicle'); await page.waitForTimeout(150);
await page.selectOption('#vhDiff', 'open'); await page.waitForTimeout(120);
const sum = await page.evaluate(() => document.getElementById('vehicleSummary').textContent);
console.log('summary has diff line:', /puts down 78% of axle grip/.test(sum));
if (!/puts down 78% of axle grip/.test(sum)) fails.push('summary missing diff detail');
await page.evaluate(() => applyLang('el')); await page.waitForTimeout(150);
const el = await page.evaluate(() => ({
  lbl: document.querySelector('label[for="vhDiff"]').textContent,
  sum: /ΑΝΟΙΧΤΟ/.test(document.getElementById('vehicleSummary').textContent),
  guide: /διαφορικό/i.test(document.querySelector('[data-gk="vehicle"]').textContent)
}));
console.log('EL label:', el.lbl, '| summary translated:', el.sum, '| guide covers diff:', el.guide);
if (!el.sum || !el.guide) fails.push('Greek diff strings missing');
await page.evaluate(() => applyLang('en'));

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
