// WHY THIS EXISTS (E7): Diesel common rail (1600-2500 bar), pilot/main split, and glow plugs.
// What must hold:
//   · default/petrol engines have railPress='stock', pilotSplit=false, glowPlugs=false, and E7 controls disabled;
//   · stock CI diesel presets keep railPress='stock', pilotSplit=false, glowPlugs=false (0 dB delta, 0 CR pump FMEP, 0 preheat);
//   · enabling 2500 bar common rail lowers PM/soot, raises NOx (NOx/soot trade-off), lowers combustion noise,
//     shortens mixing burn (higher high-rpm burnPhasing), and adds CP3/CP4 pump FMEP;
//   · enabling pilot+main split further lowers combustion noise (dB) and cuts NOx vs single-injection 2500 bar;
//   · enabling glow plugs sets ambient-dependent preheat time & electrical energy on WLTP cold start, and cuts cold HC;
//   · no console or page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const out = {};
  // 1. Default petrol engine: E7 disabled and off
  out.petrol = {
    rail: engine.railPress,
    pilot: engine.pilotSplit,
    glow: engine.glowPlugs,
    disRail: document.getElementById('edRailPress').disabled,
    disPilot: document.getElementById('edPilotSplit').disabled,
    disGlow: document.getElementById('edGlowPlugs').disabled
  };

  // 2. Load 2.0 Turbo Diesel I4 (stock)
  const pr = PRESETS.find(x => x.name.includes('2.0 Turbo Diesel'));
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, pr.engine));
  syncDesignEnable();
  buildEngine();
  const veh = vehicleFromPreset(VEHICLE_PRESETS.find(v => v.name.includes('Golf')) || VEHICLE_PRESETS[0]);
  applyVehicleToForm(veh);
  buildVehicle();

  const emStock = calcPipeEmissions(2200, 1.6, 1.35, 0.003, 0, 90, 350, false);
  const cycStock = engineCycle(vehicle);
  out.stock = {
    rail: engine.railPress,
    pilot: engine.pilotSplit,
    glow: engine.glowPlugs,
    disRail: document.getElementById('edRailPress').disabled,
    railBar: dieselRailBar(engine),
    noiseDb: dieselCombNoiseDbDelta(engine),
    burn4000: burnPhasing(4000),
    fmep: mechFrictionMEP(2200, 1.6, 1),
    pm: emStock.pm,
    nox: emStock.nox,
    mass: engineMass(),
    cost: engine.cost,
    cycPreheat: cycStock.glowPreheatS,
    cycGlowJ: cycStock.glowEnergyJ,
    coldHC: cycStock.cold.hcGkm
  };

  // 3. Enable 2500 bar common rail
  const selRail = document.getElementById('edRailPress');
  selRail.value = '2500';
  selRail.dispatchEvent(new Event('change'));
  buildEngine();
  const em2500 = calcPipeEmissions(2200, 1.6, 1.35, 0.003, 0, 90, 350, false);
  out.cr2500 = {
    railBar: dieselRailBar(engine),
    noiseDb: dieselCombNoiseDbDelta(engine),
    burn4000: burnPhasing(4000),
    fmep: mechFrictionMEP(2200, 1.6, 1),
    pm: em2500.pm,
    nox: em2500.nox,
    mass: engineMass(),
    cost: engine.cost
  };

  // 4. Enable pilot+main split + glow plugs
  const selPilot = document.getElementById('edPilotSplit');
  selPilot.value = 'yes';
  selPilot.dispatchEvent(new Event('change'));
  const selGlow = document.getElementById('edGlowPlugs');
  selGlow.value = 'yes';
  selGlow.dispatchEvent(new Event('change'));
  buildEngine();
  buildVehicle();
  const emSplit = calcPipeEmissions(2200, 1.6, 1.35, 0.003, 0, 90, 350, false);
  const cycGlow = engineCycle(vehicle);
  out.splitGlow = {
    noiseDb: dieselCombNoiseDbDelta(engine),
    pm: emSplit.pm,
    nox: emSplit.nox,
    mass: engineMass(),
    cost: engine.cost,
    preheat23: glowPreheatTime(23, engine),
    preheat0: glowPreheatTime(0, engine),
    preheat45: glowPreheatTime(45, engine),
    energy23: glowPreheatEnergyJ(23, engine),
    cycPreheat: cycGlow.glowPreheatS,
    cycGlowJ: cycGlow.glowEnergyJ,
    coldHC: cycGlow.cold.hcGkm
  };

  return out;
});

if (r.petrol.rail !== 'stock' || r.petrol.pilot !== false || r.petrol.glow !== false) {
  fails.push(`petrol defaults wrong: ${JSON.stringify(r.petrol)}`);
}
if (!r.petrol.disRail || !r.petrol.disPilot || !r.petrol.disGlow) {
  fails.push('E7 controls should be disabled on petrol engine');
}
if (r.stock.rail !== 'stock' || r.stock.pilot !== false || r.stock.glow !== false || r.stock.disRail) {
  fails.push(`diesel stock defaults/enable wrong: ${JSON.stringify(r.stock)}`);
}
if (r.stock.railBar !== 0 || r.stock.noiseDb !== 0 || r.stock.cycPreheat !== 0 || r.stock.cycGlowJ !== 0) {
  fails.push(`diesel stock should have 0 CR/noise/glow deltas: ${JSON.stringify(r.stock)}`);
}
if (!(r.cr2500.pm < r.stock.pm * 0.65)) fails.push(`2500 bar CR did not cut PM enough: ${r.cr2500.pm} vs ${r.stock.pm}`);
if (!(r.cr2500.nox > r.stock.nox * 1.15)) fails.push(`2500 bar CR did not raise NOx (trade-off): ${r.cr2500.nox} vs ${r.stock.nox}`);
if (!(r.cr2500.noiseDb < -1.5)) fails.push(`2500 bar CR did not lower combustion noise: ${r.cr2500.noiseDb} dB`);
if (!(r.cr2500.burn4000 > r.stock.burn4000)) fails.push(`2500 bar CR should improve 4000 rpm burnPhasing: ${r.cr2500.burn4000} vs ${r.stock.burn4000}`);
if (!(r.cr2500.fmep > r.stock.fmep + 0.25)) fails.push(`2500 bar CR should add pump FMEP: ${r.cr2500.fmep} vs ${r.stock.fmep}`);

if (!(r.splitGlow.noiseDb < r.cr2500.noiseDb - 2.0)) fails.push(`pilot split should lower combustion noise further: ${r.splitGlow.noiseDb} vs ${r.cr2500.noiseDb}`);
if (!(r.splitGlow.nox < r.cr2500.nox)) fails.push(`pilot split should cut NOx vs single 2500 bar: ${r.splitGlow.nox} vs ${r.cr2500.nox}`);
if (!(r.splitGlow.pm < r.stock.pm)) fails.push(`2500 bar + pilot split PM should remain below stock: ${r.splitGlow.pm} vs ${r.stock.pm}`);

if (!(r.splitGlow.preheat0 > r.splitGlow.preheat23 && r.splitGlow.preheat23 > 0 && r.splitGlow.preheat45 === 0)) {
  fails.push(`glow preheat time vs temp wrong: 0C=${r.splitGlow.preheat0}, 23C=${r.splitGlow.preheat23}, 45C=${r.splitGlow.preheat45}`);
}
if (!(r.splitGlow.cycPreheat > 0 && r.splitGlow.cycGlowJ > 500)) {
  fails.push(`WLTP cold start did not record glow preheat: t=${r.splitGlow.cycPreheat}, J=${r.splitGlow.cycGlowJ}`);
}
if (!(r.splitGlow.coldHC < r.stock.coldHC)) {
  fails.push(`glow plugs should reduce WLTP cold-phase HC: ${r.splitGlow.coldHC} vs ${r.stock.coldHC}`);
}
if (r.splitGlow.mass !== r.stock.mass + 5 || !(r.splitGlow.cost > r.stock.cost)) {
  fails.push(`mass/cost delta wrong: mass ${r.splitGlow.mass} vs ${r.stock.mass}, cost ${r.splitGlow.cost} vs ${r.stock.cost}`);
}
if (errors.length) fails.push(...errors);

await browser.close();
console.log(`test291: stock PM=${(r.stock.pm*1000).toFixed(2)}mg/s -> 2500bar=${(r.cr2500.pm*1000).toFixed(2)}mg/s, ` +
  `noise=${r.splitGlow.noiseDb.toFixed(1)}dB, glow23=${r.splitGlow.preheat23.toFixed(1)}s/${Math.round(r.splitGlow.energy23)}J`);
if (fails.length) { fails.forEach(f => console.error('FAIL:', f)); process.exit(1); }
console.log('PASS');
