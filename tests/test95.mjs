// Springs and anti-roll bars per axle (build 174). The body's roll is the car's own: its roll moment about the roll axis,
// m g (h - z_axis) per g, over the roll stiffness of its two axles, each the springs (from the kit's ride frequency,
// m_axle (2 pi f)^2 t^2 / 4) plus a bar of BAR_SHARE of that. The front's share of that stiffness is the elastic part
// of the load transfer split. Build 419: stiffer or softer springs and bars are a SPRINGS, BARS & DAMPERS part (here
// the kit's, its wires and bars scaled to build 174's old steps: a spring step 1.3x, a bar step 1.5x); an old save's
// steps or ROLL BALANCE load on the kit.
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
  const snap = () => ({ roll: vehicle.rollGrad, lltd: vehicle.lltdF, kF: vehicle.rollKF, K: vehicle.rollK, cost: vehicle.cost,
    stock: isFactoryFit(readVehicleFromForm()), key: carLineKey() });
  const out = {};
  // the kits on a typical car: roll arm 0.40 m, track 1.55 m both ends, 55% front
  out.kits = Object.fromEntries(Object.keys(SUSPENSION).map(k => {
    const v = { suspension: k, mass: 1400, fWt: 0.55, trackF: 1.55, trackR: 1.55 }, K = rollStiffness(v);
    return [k, { roll: 1400 * 9.81 * 0.40 / (K.F + K.R) * 180 / Math.PI, kF: K.F / (K.F + K.R) }];
  }));
  // the M3's own numbers against the formula
  load('M3 (E46');
  const v = vehicle, w = 2 * Math.PI * SUSPENSION[v.suspension].hz;
  const KF = v.mass * v.fWt * w * w * v.trackF ** 2 / 4 * (1 + BAR_SHARE), KR = v.mass * (1 - v.fWt) * w * w * v.trackR ** 2 / 4 * (1 + BAR_SHARE);
  const arm = v.cg - (v.fWt * v.rcF + (1 - v.fWt) * v.rcR);
  out.m3 = { roll: v.rollGrad, want: v.mass * 9.81 * arm / (KF + KR) * 180 / Math.PI, kF: v.rollKF, wantKF: KF / (KF + KR) };
  out.base = snap();
  // a part: the kit's, each spring's rate and each bar's stiffness times 1.3^n and 1.5^n (wire and bar diameter by the 4th root)
  const kit = partFromFactory('kit', 'susp');
  const fit = (sF, sR, bF, bR) => { const p = Object.assign({}, kit, { id: '', name: 'T' + [sF, sR, bF, bR].join() });
    p.wireDF_mm *= 1.3 ** (sF / 4); p.wireDR_mm *= 1.3 ** (sR / 4); p.barDF_mm *= 1.5 ** (bF / 4); p.barDR_mm *= 1.5 ** (bR / 4);
    set('vhSuspPart', 'part:' + ensurePart(p)); };
  fit(0, 0, 1, 0); out.barF1 = snap();
  fit(0, 0, 2, 0); out.barF2 = snap();
  fit(0, 0, 0, 2); out.barR2 = snap();
  fit(2, 0, 0, 0); out.springF2 = snap();
  fit(2, 2, 2, 2); out.allStiff = snap();
  fit(-2, -2, -2, -2); out.allSoft = snap();
  fit(0, 0, 0, 0); out.kitPart = snap();
  // lap balance moves with the bars
  set('vhSuspPart', 'kit');
  const lap = () => simulateLap('mixed').balance.margin;
  out.margin = { base: lap() }; fit(0, 0, 2, 0); out.margin.stiffFront = lap(); fit(0, 0, -2, 0); out.margin.softFront = lap(); set('vhSuspPart', 'kit');
  // a tall, narrow car rolls more than a low, wide one on the same kit
  load('Alto Works'); set('vhSusp', 'sport'); out.alto = vehicle.rollGrad;
  load('911 GT3'); set('vhSusp', 'sport'); out.gt3 = vehicle.rollGrad;
  // a save from before build 174: ROLL BALANCE +1 becomes the front bar
  load('Golf GTI'); const rec = readVehicleFromForm();
  rec.springF = 2; rec.barR = -1; rec.arbBal = 1;
  applyVehicleToForm(rec); buildVehicle();
  out.oldSave = { susp: g('vhSuspPart').value, stock: isFactoryFit(readVehicleFromForm()) };
  // REFIT puts the kit's back
  fit(2, 2, 2, 2); g('btnRefit').click(); out.refit = g('vhSuspPart').value;
  out.summary = g('vehicleSummary').textContent;
  return out;
});

console.log('== the kits on a typical car (roll arm 0.40 m, track 1.55 m) ==');
const want = { comfort: 6, sport: 4, coilover: 2.5, race: 1.5 };
for (const [k, x] of Object.entries(r.kits)) {
  console.log(`  ${k.padEnd(9)} ${x.roll.toFixed(2)} deg/g (skidpad figure ${want[k]}) · front share ${x.kF.toFixed(3)}`);
  if (Math.abs(x.roll - want[k]) / want[k] > 0.1) fails.push(`${k} does not roll within 10% of ${want[k]} deg/g on a typical car`);
  if (Math.abs(x.kF - 0.55) > 1e-12) fails.push(`${k}: equal tracks at STANDARD do not split the roll stiffness by the weight`);
}
console.log(`  M3: roll ${r.m3.roll.toFixed(3)} (formula ${r.m3.want.toFixed(3)}) · front share ${r.m3.kF.toFixed(4)} (${r.m3.wantKF.toFixed(4)})`);
if (Math.abs(r.m3.roll - r.m3.want) > 1e-9 || Math.abs(r.m3.kF - r.m3.wantKF) > 1e-12) fails.push('the M3 roll or split is not the formula');
const row = (n, x) => console.log(`  ${n.padEnd(22)} roll ${x.roll.toFixed(2)} deg/g · transfer ${(x.lltd * 100).toFixed(1)}% front · $${x.cost}${x.stock ? ' (factory)' : ''}`);
row('M3 standard', r.base); row('front bar +1', r.barF1); row('front bar +2', r.barF2); row('rear bar +2', r.barR2);
row('front springs +2', r.springF2); row('all STIFF +2', r.allStiff); row('all SOFT -2', r.allSoft); row("the kit's as a part", r.kitPart);
if (Math.abs(r.kitPart.roll / r.base.roll - 1) > 1e-4 || Math.abs(r.kitPart.lltd - r.base.lltd) > 1e-5) fails.push("the kit's springs and bars as a part do not roll as the kit");
const step = r.barF1.lltd - r.base.lltd;
if (!(step > 0.02 && step < 0.06)) fails.push(`a front bar step moves ${(step * 100).toFixed(1)}% of the transfer, not about 4%`);
if (!(r.barF2.lltd > r.barF1.lltd && r.barR2.lltd < r.base.lltd && r.springF2.lltd > r.base.lltd)) fails.push('stiffer front springs or bars do not move the transfer forward, or a stiffer rear bar back');
if (!(r.barF1.roll < r.base.roll && r.springF2.roll < r.base.roll)) fails.push('stiffening an axle does not reduce the roll');
if (!(r.allStiff.roll < r.base.roll * 0.6 && r.allSoft.roll > r.base.roll * 1.5)) fails.push('the range of the steps is too narrow');
if (!r.base.stock || r.barF1.stock || r.springF2.stock) fails.push('the springs and bars are not part of the factory fit');
if (!(r.barF1.cost > r.base.cost)) fails.push('a SPRINGS, BARS & DAMPERS part costs nothing');
if (r.barF1.key === r.base.key) fails.push('the racing line cache does not see the bars');
console.log(`  lap margin: standard ${(r.margin.base * 100).toFixed(2)}% · stiff front bar ${(r.margin.stiffFront * 100).toFixed(2)}% · soft ${(r.margin.softFront * 100).toFixed(2)}%`);
if (!(r.margin.softFront < r.margin.base && r.margin.base < r.margin.stiffFront)) fails.push('the front bar does not move the lap balance');
console.log(`  on SPORT: Alto Works ${r.alto.toFixed(2)} deg/g · 911 GT3 ${r.gt3.toFixed(2)} deg/g`);
if (!(r.alto > r.gt3 * 1.5)) fails.push('a tall narrow kei car does not roll more than a low wide 911');
if (!(r.oldSave.susp === 'kit' && r.oldSave.stock)) fails.push("an old save's steps or ROLL BALANCE do not load on the kit: " + JSON.stringify(r.oldSave));
if (r.refit !== 'kit') fails.push("REFIT does not put the kit's springs and bars back: " + r.refit);
if (!/roll \d+\.\d°\/g/.test(r.summary)) fails.push('the summary does not show the roll');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
