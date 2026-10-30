// The HYBRID TUNE (build 192, step 3.6c of plans/hybrid-electric/; decision 16).
//
// WHY THIS EXISTS. A hybrid's calibration is now the engineer's: a HYBRID TUNE section on the ENGINE tab, saved with the
// build, read by the 0-100, the lap, the race, the WLTP cycle and the LIVE bench (src/js/hybrid.js, fuel-cycle.js,
// hybrid-bench.js). What must hold:
//   · untouched, the tune is the controller of builds 186-191 (tests 103-108 hold their numbers), and a save carries it;
//   · ASSIST ABOVE / BELOW an rpm give the motor's help only on that side of it, and the 0-100 pays for what is taken away;
//   · the ASSIST MAP scales the help: its flat-out row the 0-100's and the lap's curve, its pedal rows the bench's;
//   · REGENERATION OFF takes no braking back (and a charge-sustaining lap then has nothing to deploy), LOW half;
//   · EV UP TO and EV POWER keep the energy manager from driving on the motor alone past them, and the engine runs more;
//   · LOAD-POINT SHIFTING OFF: the bench's AUTO stops charging from the engine while the pack is above its low; on the
//     cycle the pack can no longer be sustained, and its fuel is charge-corrected as WLTP corrects such a hybrid's;
//   · the CHARGE window: the bench's AUTO holds the new target, the cycle sustains it;
//   · the form: the section only for a hybrid, ASSIST RPM only for ABOVE and BELOW, a map cell steps down a click.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const g = id => document.getElementById(id), o = {};
  const vis = sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; };
  const step = s => { const dt = 1 / 60; for (let i = 0; i < s / dt; i++) { stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); } };
  const set = (vals) => { for (const [k, v] of Object.entries(vals)) g(k).value = v; syncDesignEnable(); buildEngine(); };
  const cyc = () => { engine._hcyc = null; const c = hybridCycle(vehicle); return { l100: c.l100, ev: c.evShare, on: c.onShare, dE: c.dSocKJ, cap: engine.hy.pack.kWh * 3600, corrected: c.corrected }; };
  const motAt = rpm => hybMotorAt(rpm);
  // a plain engine: no tune section
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) }); setTab('design');
  o.plainSection = vis('.design-section[data-hy]');
  // the Ioniq on FULL, untouched
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => /Ioniq/.test(x.name))); setTab('design');
  set({ edHyDeploy: 'full' });
  const t0 = hybTune(engine);
  o.defaults = { same: JSON.stringify(Object.assign({}, t0, { flat: undefined })) === JSON.stringify(Object.assign({}, HYB_TUNE_DEFAULT, { flat: undefined })), saved: !!serializeBuild('x', '').engine.hyTune,
    section: vis('.design-section[data-hy]'), rpmOff: g('edHyRpm').disabled };
  o.full = { t100: perf.t100, m2000: motAt(2000), m5000: motAt(5000), lap: simulateLap('tech') };
  o.full.lap = { t: o.full.lap.time || o.full.lap.lapTime, share: o.full.lap.hy.share, reg: o.full.lap.hy.regenKJ };
  o.base = cyc();
  // ASSIST ABOVE / BELOW
  set({ edHyDeploy: 'above', edHyRpm: 4500 }); o.above = { t100: perf.t100, m2000: motAt(2000), m5000: motAt(5000), rpmOn: !g('edHyRpm').disabled };
  set({ edHyDeploy: 'below', edHyRpm: 2500 }); o.below = { t100: perf.t100, m2000: motAt(2000), m5000: motAt(5000) };
  set({ edHyDeploy: 'full' });
  // the assist map: the flat-out row at 50%, and a map cell clicked
  const cell = () => document.querySelector('#hyAssistMap td[data-k="17"]');   // the table is redrawn after each click
  cell().click(); cell().click();   // pedal 100%, speed 50%: 100 -> 75 -> 50
  o.mapCell = hybMapForm[17];
  for (let i = 15; i < 20; i++) hybMapForm[i] = 50;
  buildEngine(); o.half = { t100: perf.t100, m2000: motAt(2000), m5000: motAt(5000) };
  const kd = document.querySelector('#hyAssistMap td[data-k="15"]'); kd.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); o.mapKey = hybMapForm[15];
  // a save carries the tune, and loads it back
  const rec = serializeBuild('tuned', ''); applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) }); applyBuild(rec);
  o.reload = { map15: engine.hyTune.map[15], map17: engine.hyTune.map[17], form17: hybMapForm[17] };
  for (let i = 0; i < 20; i++) hybMapForm[i] = 100;
  buildEngine();
  // regeneration
  set({ edHyRegen: 'off' }); { const L = simulateLap('tech'); o.regenOff = { table: Math.max(...hybRegenTable(engine.redline)), reg: L.hy.regenKJ, share: L.hy.share, t: L.time || L.lapTime }; }
  set({ edHyRegen: 'low' }); o.regenLow = { table: Math.max(...hybRegenTable(engine.redline)) };
  set({ edHyRegen: 'high' }); o.regenHigh = { table: Math.max(...hybRegenTable(engine.redline)) };
  // electric driving limits
  set({ edHyEvKmh: 30 }); o.ev30 = cyc();
  set({ edHyEvKmh: 0, edHyEvKw: 4 }); o.ev4kw = cyc();
  set({ edHyEvKw: 0 });
  // the bench: load-point shifting and the charge target
  setTab('engine'); state.load = 0.5;
  let H = hybBenchState(); H.mode = 'auto'; H.soc = 0.5; state.throttle = 0.4; step(6); o.lpsOn = { Pb: H.Pb, soc: H.soc };
  setTab('design'); set({ edHyLps: 'off' }); setTab('engine'); H = hybBenchState(); H.mode = 'auto'; H.soc = 0.5; state.throttle = 0.4; step(6); o.lpsOff = { Pb: H.Pb, soc: H.soc };
  o.lpsCyc = cyc();
  setTab('design'); set({ edHyLps: 'on', edHySocT: 75 }); o.t75cyc = cyc();
  setTab('engine'); H = hybBenchState(); H.mode = 'auto'; H.soc = 0.6; state.throttle = 0.4; step(15); o.t75 = { soc: H.soc };
  setTab('design'); set({ edHySocT: 60 });
  // a power-split: ASSIST is FULL, the tune section shown
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => /Prius/.test(x.name))); setTab('design');
  o.ps = { assistOff: g('edHyDeploy').disabled, rpmOff: g('edHyRpm').disabled, section: vis('.design-section[data-hy]') };
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  return o;
});
const f = (x, d = 1) => (+x).toFixed(d);

const D = r.defaults;
console.log(`== untouched: the defaults ${D.same}, saved ${D.saved}; the section for a hybrid ${D.section}, for a plain engine ${r.plainSection}; ASSIST RPM off on FULL ${D.rpmOff} ==`);
if (!D.same || !D.saved || !D.section || r.plainSection || !D.rpmOff) fails.push('the tune is not the old controller, not saved, or not shown only for a hybrid');
const F = r.full, A = r.above, B = r.below, Hf = r.half;
console.log(`== FULL: motor ${f(F.m2000, 0)} Nm at 2000, ${f(F.m5000, 0)} at 5000, 0-100 ${f(F.t100, 2)} s; ABOVE 4500: ${f(A.m2000, 0)} / ${f(A.m5000, 0)} Nm, ${f(A.t100, 2)} s (rpm field on ${A.rpmOn}); ` +
  `BELOW 2500: ${f(B.m2000, 0)} / ${f(B.m5000, 0)} Nm, ${f(B.t100, 2)} s ==`);
if (!(A.m2000 === 0 && Math.abs(A.m5000 - F.m5000) < 1e-9 && A.t100 > F.t100 && A.rpmOn)) fails.push('ASSIST ABOVE does not give the help only above its rpm');
if (!(B.m5000 === 0 && Math.abs(B.m2000 - F.m2000) < 1e-9 && B.t100 > F.t100)) fails.push('ASSIST BELOW does not give the help only below its rpm');
console.log(`== map at 50% flat out: ${f(Hf.m2000, 1)} / ${f(Hf.m5000, 1)} Nm, 0-100 ${f(Hf.t100, 2)} s; a cell clicked twice ${r.mapCell}, Enter on another ${r.mapKey}; reloaded ${r.reload.map15} / ${r.reload.map17} (form ${r.reload.form17}) ==`);
if (Math.abs(Hf.m2000 - F.m2000 / 2) > 0.01 || Math.abs(Hf.m5000 - F.m5000 / 2) > 0.01 || !(Hf.t100 > F.t100)) fails.push('the assist map does not scale the help');
if (r.mapCell !== 50 || r.mapKey !== 25 || r.reload.map15 !== 25 || r.reload.map17 !== 50 || r.reload.form17 !== 50) fails.push('the map does not edit, save and load');
const RO = r.regenOff;
console.log(`== regeneration: HIGH ${f(r.regenHigh.table, 0)} Nm, LOW ${f(r.regenLow.table, 0)}, OFF ${f(RO.table, 0)}; the lap OFF takes back ${f(RO.reg, 0)} kJ (HIGH ${f(F.lap.reg, 0)}), deploys ${f(RO.share * 100, 0)}% (HIGH ${f(F.lap.share * 100, 0)}%) ==`);
if (RO.table !== 0 || Math.abs(r.regenLow.table - r.regenHigh.table / 2) > 1e-9 || !(RO.reg < 1) || !(RO.share < F.lap.share)) fails.push('REGENERATION does not scale what braking takes back');
const Bc = r.base;
console.log(`== cycle: untouched ${f(Bc.l100, 2)} L/100 km, electric ${f(Bc.ev * 100, 0)}%; EV up to 30 km/h ${f(r.ev30.l100, 2)}, electric ${f(r.ev30.ev * 100, 0)}%; EV power 4 kW ${f(r.ev4kw.l100, 2)}, electric ${f(r.ev4kw.ev * 100, 0)}%; ` +
  `no load-point shifting ${f(r.lpsCyc.l100, 2)} (pack ${f(r.lpsCyc.dE, 0)} kJ${r.lpsCyc.corrected ? ', charge-corrected' : ''}); target 75% ${f(r.t75cyc.l100, 2)} (pack ${f(r.t75cyc.dE, 0)} kJ) ==`);
if (!(r.ev30.ev < Bc.ev && r.ev4kw.ev < Bc.ev && r.ev30.on > Bc.on)) fails.push('the EV limits do not keep the motor from driving alone');
if (Math.abs(r.lpsCyc.l100 - Bc.l100) < 1e-6) fails.push('load-point shifting off changes nothing on the cycle');
if (Math.abs(r.lpsCyc.dE) > r.lpsCyc.cap * 0.005 && !r.lpsCyc.corrected) fails.push('a cycle that does not sustain the charge is not charge-corrected');
if (Bc.corrected) fails.push('an untuned cycle is charge-corrected');
if (Math.abs(r.t75cyc.dE) > r.t75cyc.cap * 0.005) fails.push('the cycle does not sustain a new charge target');
console.log(`== bench AUTO at 50%: load-point shifting on, pack ${f(r.lpsOn.Pb)} kW; off, ${f(r.lpsOff.Pb)} kW; target 75% from 60% -> ${f(r.t75.soc * 100)}% ==`);
if (!(r.lpsOn.Pb < -1 && r.lpsOff.Pb > -0.5)) fails.push('LOAD-POINT SHIFTING OFF still charges from the engine on the bench');
if (!(r.t75.soc > 0.61)) fails.push('the bench does not hold a new charge target');
console.log(`== power-split: ASSIST off ${r.ps.assistOff}, ASSIST RPM off ${r.ps.rpmOff}, tune shown ${r.ps.section} ==`);
if (!r.ps.assistOff || !r.ps.rpmOff || !r.ps.section) fails.push('a power-split does not show its tune as it should');

await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the hybrid tune shapes the motor\'s help, the regeneration, electric driving and the charge, everywhere the hybrid runs.');
process.exit(fails.length || errors.length ? 1 : 0);
