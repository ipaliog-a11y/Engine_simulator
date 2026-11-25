// WHY THIS EXISTS (E10): Opt-in DPF / GPF particulate filter on EXHAUST.
// What must hold:
//   · default-off (partFilter: false): backPressureBar, exhaustReport, and tailpipe PM are unchanged,
//     and #statPF is hidden on the LIVE bench;
//   · fitting DPF/GPF (partFilter: true) cuts tailpipe PM by >90% (96% wall-flow trapping);
//   · Darcy-flow pressure drop (partFilterDpPa) raises backPressureBar() when fitted and rises further
//     as soot (state.pfSootG) accumulates;
//   · running under load accumulates soot (state.pfSootG > 0);
//   · high exhaust/filter temperature (~600 °C) burns off soot and restores back-pressure;
//   · exceeding the soot threshold triggers active regeneration (state.pfRegen === true) with a fuel
//     flow penalty (+8%), burning soot down to completion and clearing state.pfRegen;
//   · #statPF is visible on ICE with DPF/GPF fitted and hidden on pure EVs;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const out = {};
  const load = (name, over) => {
    const pr = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine, over || {}));
    syncDesignEnable();
    buildEngine();
  };

  // 1. Default-off check on 2.0 Turbo Diesel I4 (without cat so PM is raw engine-out)
  load('2.0 Turbo Diesel I4', { cat: 'none' });
  out.defPartFilter = !!engine.partFilter;
  out.statPFHiddenOff = document.getElementById('statPF').style.display === 'none';
  state.rpm = 3000; state.throttle = 0.85; state.coolant = 90; state.tCat = 350; state.fuelCut = false;
  state.ve = computeVE(state.rpm, liveMap());
  updateEnginePhysics();
  out.pmNoPf = state.emPM;
  const Tex = exhaustGasT(1.0, 3500);
  out.bpNoPf = backPressureBar(3500, Tex);
  out.repNoPf = exhaustReport(engine.exhaust).bpKPa;

  // 2. Fit DPF / GPF (partFilter: true)
  load('2.0 Turbo Diesel I4', { cat: 'none', partFilter: true });
  out.onPartFilter = !!engine.partFilter;
  updateUI();
  out.statPFVisibleOn = document.getElementById('statPF').style.display !== 'none';
  state.rpm = 3000; state.throttle = 0.85; state.coolant = 90; state.tCat = 350; state.fuelCut = false;
  state.ve = computeVE(state.rpm, liveMap());
  updateEnginePhysics();
  out.pmWithPf = state.emPM;
  out.bpCleanPf = backPressureBar(3500, Tex);
  out.repCleanPf = exhaustReport(engine.exhaust).bpKPa;
  out.sootRate = state.pfSootRate;

  // 3. Accumulate soot at moderate EGT (<450 C) over 10 min -> soot rises & Darcy back-pressure rises
  state.pfSootG = 0;
  for (let i = 0; i < 60; i++) {
    state.tCat = 350;
    updateEnginePhysics();
    stepPartFilter(10);
  }
  out.sootAfterLoad = state.pfSootG;
  out.bpLoadedPf = backPressureBar(3500, Tex);

  // 4. Passive regeneration at high EGT (~620 C) -> soot burns off & back-pressure drops
  const sootBeforeBurn = state.pfSootG;
  state.tCat = 620;
  state.throttle = 0.2;
  for (let i = 0; i < 60; i++) {
    updateEnginePhysics();
    stepPartFilter(0.5);
  }
  out.sootBeforeBurn = sootBeforeBurn;
  out.sootAfterBurn = state.pfSootG;
  out.bpAfterBurn = backPressureBar(3500, Tex);

  // 5. Active regeneration trigger + fuel penalty + completion
  state.throttle = 0.5; state.rpm = 2200; state.tCat = 350; state.coolant = 90;
  state.pfSootG = 0; state.pfRegen = false;
  updateEnginePhysics();
  out.fuelNormal = state.fuelFlowLph;
  state.pfSootG = pfMaxSootG() + 0.5;
  stepPartFilter(0.1);
  out.regenTriggered = !!state.pfRegen;
  updateEnginePhysics();
  out.fuelRegen = state.fuelFlowLph;
  updateUI();
  out.statPFTextRegen = document.getElementById('statPF').querySelector('.unit').textContent;
  for (let i = 0; i < 250 && state.pfRegen; i++) {
    updateEnginePhysics();
    stepPartFilter(0.2);
  }
  out.regenCleared = !state.pfRegen;
  out.sootPostRegen = state.pfSootG;

  // 6. Pure EV hides #statPF
  const ev = FACTORY_CARS.find(c => c.engine && c.engine.type === 'electric');
  if (ev) {
    loadVehiclePreset(ev);
    updateUI();
    out.statPFHiddenEV = document.getElementById('statPF').style.display === 'none';
  } else {
    out.statPFHiddenEV = true;
  }

  return out;
});

if (r.defPartFilter !== false) fails.push('default partFilter should be false');
if (!r.statPFHiddenOff) fails.push('#statPF should be hidden when partFilter is false');
if (!r.onPartFilter) fails.push('partFilter should be true when enabled');
if (!r.statPFVisibleOn) fails.push('#statPF should be visible when partFilter is true');
if (!(r.pmWithPf < r.pmNoPf * 0.1)) fails.push(`expected >90% PM reduction: ${r.pmWithPf} vs ${r.pmNoPf}`);
if (!(r.bpCleanPf > r.bpNoPf)) fails.push(`expected clean DPF back-pressure > none: ${r.bpCleanPf} vs ${r.bpNoPf}`);
if (!(r.repCleanPf > r.repNoPf)) fails.push(`expected exhaustReport bpKPa > none: ${r.repCleanPf} vs ${r.repNoPf}`);
if (!(r.sootAfterLoad > 0.1)) fails.push(`expected soot accumulation under load, got ${r.sootAfterLoad}`);
if (!(r.bpLoadedPf > r.bpCleanPf)) fails.push(`expected loaded DPF back-pressure > clean: ${r.bpLoadedPf} vs ${r.bpCleanPf}`);
if (!(r.sootAfterBurn < r.sootBeforeBurn * 0.3)) fails.push(`expected passive regen burn-off at 620 C: ${r.sootAfterBurn} vs ${r.sootBeforeBurn}`);
if (!(r.bpAfterBurn < r.bpLoadedPf)) fails.push(`expected back-pressure to drop after burn-off: ${r.bpAfterBurn} vs ${r.bpLoadedPf}`);
if (!r.regenTriggered) fails.push('expected active regen to trigger above threshold');
if (!(r.fuelRegen > r.fuelNormal * 1.05)) fails.push(`expected regen fuel penalty: ${r.fuelRegen} vs ${r.fuelNormal}`);
if (!r.statPFTextRegen.includes('REGEN')) fails.push(`expected REGEN unit text, got "${r.statPFTextRegen}"`);
if (!r.regenCleared) fails.push('expected active regen to clear once soot drops below low threshold');
if (!r.statPFHiddenEV) fails.push('#statPF should be hidden on pure EV');
if (errors.length) fails.push(...errors);

console.log(JSON.stringify(r, null, 2));
if (fails.length) {
  console.error('FAILS:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('test290 PASS');
await browser.close();
