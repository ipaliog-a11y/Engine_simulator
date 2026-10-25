// The diesel governor (build 172).
//
// WHY THIS EXISTS. A diesel was fuelled at its smoke limit (or its turbine's temperature limit) right to its redline,
// so it made its peak power there, which a diesel never does: the Cummins's 400 hp at 2800 rpm came out as 546 hp at
// 3500, and every other diesel carried a boost taper solved to its rating in its place. A diesel's governor takes the
// fuel away from its rated speed to its governed maximum, where what is left only meets friction. What must hold:
//   · past the rated speed the full-pedal fuel falls in proportion to the speed, to phi0 of the full fuel at the
//     maximum, and phi0 is the share whose work only meets friction, pumping and the alternator: no torque there;
//   · each real diesel makes its peak power at or just past its maker's rated speed, not at its limit;
//   · the mixture leans out past the rated speed, and the exhaust cools with it;
//   · below the rated speed nothing changes; with the governor off the old curve returns;
//   · it is a diesel's: the field is off for a petrol engine, and it survives a save.
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
  const out = {};
  const load = (nm, patch) => { const p = PRESETS.find(q => q.name.includes(nm)); applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine, patch || {})); buildEngine(); return p; };
  const tqAt = rpm => brakeTorqueRaw(rpm, wotMapAt(rpm), false);
  // 1. the law, on the Duramax (GM: rated 2800, maximum powered speed 3450)
  load('Duramax');
  const e = engine, rl = e.redline, g0 = e.govRpm, mid = (g0 + rl) / 2;
  const phi0 = govPhi0();
  e.govBusy = true; const map = wotMapAt(rl), gross = dieselGrossImep(rl, map, computeVE(rl, map)), fr = pumpFrictionMEP(rl, map, 1), lamFullMid = dieselLambdaFloor(mid); e.govBusy = false;
  out.law = { g0, rl, phi0, want: fr / gross, fracMid: govFuelFrac(mid), wantMid: 1 - 0.5 * (1 - phi0), fracBelow: govFuelFrac(g0 - 100),
    lamMid: dieselLambdaFloor(mid), lamFullMid, tqMax: tqAt(rl), tqPeak: e.score.peakTQ,
    egtRated: egtAt(g0, wotMapAt(g0)), egtMid: egtAt(mid, wotMapAt(mid)) };
  // 2. every real diesel: its peak at its rated speed
  out.real = PRESETS.filter(p => p.engine.type === 'diesel' && p.real).map(p => { load(p.name);
    return { name: p.name, rated: p.real.hpRpm, gov: engine.govRpm, peak: engine.score.peakHPrpm, hp: engine.score.peakHP, real: p.real.hp, rl: engine.redline,
      tqMaxShare: tqAt(engine.redline) / engine.score.peakTQ }; });
  // 3. off: the old curve (peak at the limiter for the Cummins, untouched below the rated speed)
  load('Cummins'); const onLow = tqAt(2000), onPeak = engine.score.peakHPrpm;
  load('Cummins', { govRpm: 0 }); out.off = { offPeak: engine.score.peakHPrpm, onPeak, onLow, offLow: tqAt(2000), rl: engine.redline };
  // 4. a diesel's field, and the save
  load('Cummins'); const sv = serializeBuild('t', ''); load('2JZ'); const petrolOff = document.getElementById('edGovRpm').disabled;
  applyBuild(JSON.parse(JSON.stringify(sv)));
  out.ui = { petrolOff, dieselOn: !document.getElementById('edGovRpm').disabled, saved: readEngineFromForm().govRpm };
  return out;
});

const L = r.law;
console.log(`== the law (Duramax: rated ${L.g0}, maximum ${L.rl}) ==`);
console.log(`  phi0 ${L.phi0.toFixed(4)} (in proportion to work it would be ${L.want.toFixed(4)}); halfway ${L.fracMid.toFixed(4)} (want ${L.wantMid.toFixed(4)}); below rated ${L.fracBelow}`);
console.log(`  lambda halfway ${L.lamMid.toFixed(3)} (full fuel ${L.lamFullMid.toFixed(3)}); torque at the maximum ${L.tqMax.toFixed(1)} Nm of a ${L.tqPeak} Nm peak; EGT ${Math.round(L.egtRated)} K at rated, ${Math.round(L.egtMid)} K halfway`);
if (!(L.phi0 > 0.5 * L.want && L.phi0 < 1.5 * L.want)) fails.push('phi0 is nowhere near friction and pumping over the full fuel\'s gross work at the maximum');
if (Math.abs(L.fracMid - L.wantMid) > 1e-9) fails.push('the fuel does not fall in proportion to the speed');
if (L.fracBelow !== 1) fails.push('the governor takes fuel below the rated speed');
if (!(Math.abs(L.lamMid - L.lamFullMid / L.wantMid) < 1e-9)) fails.push('the governor does not lean the mixture by the fuel it takes');
if (!(Math.abs(L.tqMax) < 0.005 * L.tqPeak)) fails.push(`${L.tqMax.toFixed(0)} Nm at the governed maximum: it should be next to none`);
if (!(L.egtMid < L.egtRated)) fails.push('the exhaust does not cool as the governor takes the fuel');

console.log('\n== the real diesels ==');
for (const x of r.real) console.log(`  ${x.name.slice(0, 36).padEnd(36)} peak ${x.hp} hp at ${x.peak} rpm (rated ${x.real} hp at ${x.rated}; governor from ${x.gov}, max ${x.rl}); torque at the max ${(x.tqMaxShare * 100).toFixed(1)}% of peak`);
for (const x of r.real) {
  if (!(x.gov > 0)) fails.push(`${x.name}: no governor`);
  if (!(x.peak <= x.rated + 150)) fails.push(`${x.name}: peak power at ${x.peak} rpm, past its rated ${x.rated}`);
  if (!(Math.abs(x.tqMaxShare) < 0.005)) fails.push(`${x.name}: ${(x.tqMaxShare * 100).toFixed(0)}% of its torque at its governed maximum`);
}

console.log(`\n== off: Cummins peak at ${r.off.offPeak} rpm (on: ${r.off.onPeak}); at 2000 rpm ${r.off.offLow.toFixed(1)} / ${r.off.onLow.toFixed(1)} Nm ==`);
if (!(r.off.offPeak >= r.off.rl - 100)) fails.push('with the governor off the Cummins does not make its peak at its limit again');
if (Math.abs(r.off.offLow - r.off.onLow) > 1e-6) fails.push('the governor changes the torque below the rated speed');
console.log(`== the field: off on a petrol engine ${r.ui.petrolOff}, on on a diesel ${r.ui.dieselOn}, saved ${r.ui.saved} ==`);
if (!r.ui.petrolOff || !r.ui.dieselOn || r.ui.saved !== 2800) fails.push('the rated-speed field is not a diesel\'s, or does not survive a save');

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS');
