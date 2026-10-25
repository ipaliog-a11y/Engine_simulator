// Suspension geometry per axle (build 173). Each axle has its own linkage (strut, wishbone, multi-link, twist beam,
// solid axle) and its own track. The geometry sets the share of the body roll the loaded wheel's camber wins back,
// (t/2)/fvsa for an independent wheel, and the axle's roll centre, which puts the transfer of the axle's own mass on
// its own tyres. The real cars carry their published geometry and tracks; saves from before carry none and take the
// factory's.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const r = await page.evaluate(() => {
  const g = id => document.getElementById(id);
  const set = (id, v) => { const el = g(id); el.value = String(v); el.dispatchEvent(new Event('input')); };
  const load = n => loadVehiclePreset(VEHICLE_PRESETS.find(x => x.name.includes(n)));
  const out = {};
  // every real car: its own entry, its own tracks and geometry, still the factory fit
  out.cars = VEHICLE_PRESETS.map(p => {
    loadVehiclePreset(p);
    const e = SUSP_REAL[p.name] || null;
    return { name: p.name, e, tf: vehicle.trackF, tr: vehicle.trackR, f: vehicle.suspFront, r: vehicle.suspRear,
      recF: vehicle.camRecF, recR: vehicle.camRecR, camF: vehicle.camberF, camR: vehicle.camberR,
      rcR: vehicle.rcR, rTire: vehicle.rTire, stock: isFactoryFit(readVehicleFromForm()) };
  });
  out.geo = JSON.parse(JSON.stringify(SUSP_GEO));
  // build 157's split comes back with both roll centres on the ground
  load('M3 (E46');
  const fw = vehicle.fWt, kF = vehicle.rollKF, zF = vehicle.rcF, zR = vehicle.rcR, h = vehicle.cg;
  const zAx = fw * zF + (1 - fw) * zR;
  out.split = { lltd: vehicle.lltdF, kF, fw, want: ((h - zAx) * kF + fw * zF) / h,
    ground: ((h - 0) * kF + fw * 0) / h };
  // a solid rear axle on a Golf: its roll centre at the wheel centre loads the rear, its wheels stay square, no static
  // camber, and it is a conversion
  load('Golf GTI');
  const golf = { lltd: vehicle.lltdF, cost: vehicle.cost, key: carLineKey(), camR: vehicle.camberR };
  set('vhGeoR', 'solid');
  out.golfSolid = { lltd: vehicle.lltdF, cost: vehicle.cost, key: carLineKey(), camR: vehicle.camberR, recR: vehicle.camRecR,
    stock: isFactoryFit(readVehicleFromForm()), summary: g('vehicleSummary').textContent };
  out.golf = golf;
  // at 1 g on COMFORT, a strut's camber costs more grip than a wishbone's
  set('vhGeoR', 'multilink'); set('vhSusp', 'comfort');
  out.camStrut = latCamberF(9.81, vehicle.camberF, geoRecovery(SUSP_GEO.strut, vehicle.trackF));
  out.camWish = latCamberF(9.81, vehicle.camberF, geoRecovery(SUSP_GEO.wishbone, vehicle.trackF));
  out.camSolid = latCamberF(9.81, 0, 1);
  // a wider front track transfers less across the front: the front holds more
  load('M3 (E46');
  const N = vehicle.mass * 9.81, b0 = latBalance(N, 9, 0, 0);
  const tf = vehicle.trackF; vehicle.trackF = tf + 0.1; const b1 = latBalance(N, 9, 0, 0); vehicle.trackF = tf;
  out.track = { narrow: b0.muF, wide: b1.muF, rearSame: Math.abs(b0.muR - b1.muR) < 1e-12 };
  // a save from before build 173 carries no geometry: the factory's, and still the factory fit
  load('AE86'); const rec = readVehicleFromForm(); delete rec.suspFront; delete rec.suspRear;
  set('vhGeoF', 'wishbone'); set('vhGeoR', 'multilink');
  applyVehicleToForm(rec); buildVehicle();
  out.oldSave = { f: g('vhGeoF').value, r: g('vhGeoR').value, stock: isFactoryFit(readVehicleFromForm()) };
  // an archetype takes its class's geometry; a twist beam is offered at the rear only
  set('vhChassis', 'hatch');
  out.arch = { f: g('vhGeoF').value, r: g('vhGeoR').value, tf: vehicle.trackF, tr: vehicle.trackR, track: CHASSIS.hatch.track,
    frontTwist: [...g('vhGeoF').options].some(o => o.value === 'twist'), rearTwist: [...g('vhGeoR').options].some(o => o.value === 'twist') };
  // Greek
  load('Golf GTI'); applyLang('el');
  out.el = { label: document.querySelector('label[for="vhGeoF"]').textContent, opt: g('vhGeoR').selectedOptions[0].textContent,
    summary: g('vehicleSummary').textContent };
  applyLang('en');
  return out;
});

console.log('== the real cars ==');
for (const c of r.cars) console.log(`  ${c.name.padEnd(42)} ${(c.f + '/' + c.r).padEnd(20)} track ${c.tf.toFixed(3)}/${c.tr.toFixed(3)}  recovery ${c.recF.toFixed(2)}/${c.recR.toFixed(2)}`);
const bad = r.cars.filter(c => !c.e || !r.geo[c.e.f] || !r.geo[c.e.r] || !(c.e.tf > 1.2 && c.e.tf < 1.8 && c.e.tr > 1.2 && c.e.tr < 1.8));
if (bad.length) fails.push('real cars without a complete geometry entry: ' + bad.map(c => c.name).join(', '));
for (const c of r.cars.filter(c => c.e)) {
  if (c.f !== c.e.f || c.r !== c.e.r || Math.abs(c.tf - c.e.tf) > 1e-9 || Math.abs(c.tr - c.e.tr) > 1e-9) fails.push(c.name + ' does not load its own geometry and tracks');
  if (!c.stock) fails.push(c.name + ' is not its own factory fit');
  if (r.geo[c.f].front === false) fails.push(c.name + ' steers on a twist beam');
  for (const [k, t, rec] of [[c.f, c.tf, c.recF], [c.r, c.tr, c.recR]]) {
    const G = r.geo[k], want = G.recov != null ? G.recov : t / 2 / G.fvsa;
    if (Math.abs(rec - want) > 1e-9) fails.push(`${c.name}: ${k} recovery ${rec} is not (t/2)/fvsa ${want}`);
  }
  if (c.r === 'solid' && (c.camR !== 0 || Math.abs(c.rcR - c.rTire) > 1e-9)) fails.push(c.name + ': a solid axle has static camber, or its roll centre is not at its wheel centre');
}
console.log(`\n  M3 split ${r.split.lltd.toFixed(4)} (want ${r.split.want.toFixed(4)}; both roll centres on the ground ${r.split.ground.toFixed(4)} = roll stiffness ${r.split.kF.toFixed(4)})`);
if (Math.abs(r.split.lltd - r.split.want) > 1e-9) fails.push('the load transfer split is not the roll centres plus the roll stiffness');
if (Math.abs(r.split.ground - r.split.kF) > 1e-12) fails.push('roll centres on the ground do not give build 157\'s split');
console.log(`  Golf GTI rear: multi-link ${(r.golf.lltd * 100).toFixed(1)}% front, $${r.golf.cost} · solid axle ${(r.golfSolid.lltd * 100).toFixed(1)}% front, $${r.golfSolid.cost}`);
if (!(r.golfSolid.lltd < r.golf.lltd - 0.05)) fails.push('a solid rear axle does not move the transfer to the rear');
if (!(r.golfSolid.camR === 0 && r.golf.camR < 0 && r.golfSolid.recR === 1)) fails.push('a solid axle keeps static camber or does not keep its wheels square');
if (r.golfSolid.stock) fails.push('a converted axle still reads as the factory fit');
if (!(r.golfSolid.cost > r.golf.cost)) fails.push('a conversion costs nothing');
if (r.golfSolid.key === r.golf.key) fails.push('the racing line cache does not see the geometry');
if (!/SOLID AXLE/.test(r.golfSolid.summary) || !/load transfer \d+% front/.test(r.golfSolid.summary)) fails.push('the summary does not show the geometry: ' + r.golfSolid.summary.slice(0, 200));
console.log(`  camber factor at 1 g on COMFORT: strut ${r.camStrut.toFixed(4)} · wishbone ${r.camWish.toFixed(4)} · solid ${r.camSolid.toFixed(4)}`);
if (!(r.camStrut < r.camWish && r.camWish < r.camSolid)) fails.push('a strut does not lose more camber in roll than a wishbone, and a wishbone than a solid axle');
console.log(`  M3 front axle at 0.92 g: track +0 ${r.track.narrow.toFixed(4)} · +100 mm ${r.track.wide.toFixed(4)}`);
if (!(r.track.wide > r.track.narrow && r.track.rearSame)) fails.push('a wider front track does not help the front alone');
if (!(r.oldSave.f === 'strut' && r.oldSave.r === 'solid' && r.oldSave.stock)) fails.push('a save without geometry does not take the factory\'s: ' + JSON.stringify(r.oldSave));
if (!(r.arch.f === 'strut' && r.arch.r === 'twist' && r.arch.tf === r.arch.track && r.arch.tr === r.arch.track)) fails.push('an archetype does not take its class geometry and track: ' + JSON.stringify(r.arch));
if (r.arch.frontTwist || !r.arch.rearTwist) fails.push('the twist beam is offered at the front, or not at the rear');
console.log(`  Greek: "${r.el.label}" · "${r.el.opt}"`);
if (r.el.label !== 'ΓΕΩΜΕΤΡΙΑ ΕΜΠΡΟΣ' || r.el.opt !== 'ΠΟΛΛΑΠΛΩΝ ΒΡΑΧΙΟΝΩΝ' || !/Γεωμετρία/.test(r.el.summary)) fails.push('the geometry is not in Greek');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
