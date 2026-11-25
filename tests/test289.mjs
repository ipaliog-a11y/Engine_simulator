// WHY THIS EXISTS (E6): Wet vs dry sump lubrication on BLOCK card.
// What must hold:
//   · default drySump is false ('wet'), leaving default/preset 0 g oil pressure, FMEP, power, mass, and cost unchanged;
//   · #edDrySump is disabled on 2-strokes (premix) and enabled on 4-strokes / rotaries;
//   · sustained high lateral g (> WET_SUMP_G_THRESH = 1.05 g) on wet sump drains the pickup pocket, drops oilP,
//     and causes OIL STARVATION bearing wear in stepWear();
//   · dry sump eliminates lateral-g starvation completely (both in stepWear() and lapSumpReport()), at a derived cost
//     in scavenge pump FMEP, +8 kg mass, and +$2,200 build cost, and appears in #designSummary;
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
  out.defDry = engine.drySump;
  out.defSel = document.getElementById('edDrySump').value;
  out.defDis = document.getElementById('edDrySump').disabled;

  // 2-stroke disables edDrySump
  const ts = PRESETS.find(x => x.name.includes('500cc 2-Stroke'));
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, ts.engine));
  syncDesignEnable();
  out.tsDis = document.getElementById('edDrySump').disabled;
  out.tsVal = document.getElementById('edDrySump').value;

  // Baseline 4-stroke wet sump
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE));
  syncDesignEnable();
  buildEngine();
  out.wet0 = {
    hp: engine.score.peakHP,
    tq: engine.score.peakTQ,
    mass: engineMass(),
    cost: engine.cost,
    fmep: mechFrictionMEP(6000, 1.0, 1),
    oilP0: oilPressureBar(5000, 100, engine, 0)
  };

  // Sustained 1.45 g cornering on wet sump
  const prevWear = wearEnabled;
  wearEnabled = true;
  state.engineHealth = 1.0; state.blown = false; state.wearCause = '';
  state.firing = true; state.rpm = 5000; state.oil = 100; state.coolant = 90;
  state.knockRisk = 0; state.cylPmax = 40; state.bmep = 8; state.powerHP = 90;
  state.latG = 1.45; state.sumpStarve = 0;
  for (let i = 0; i < 40; i++) stepWear(0.1);   // 4.0 s sustained 1.45 g
  out.wetStarve = {
    starve: state.sumpStarve,
    oilP: state.oilP,
    health: state.engineHealth,
    cause: state.wearCause
  };

  // High-grip lap report with wet sump
  applyVehicleToForm(vehicleFromPreset(VEHICLE_PRESETS.find(p => p.name.includes('Radical'))));
  buildVehicle();
  const lapWet = simulateLap('tech');
  out.lapWet = lapSumpReport(lapWet);

  // Switch to DRY SUMP via UI
  const sel = document.getElementById('edDrySump');
  sel.value = 'dry';
  sel.dispatchEvent(new Event('change'));
  buildEngine();
  out.dry0 = {
    drySump: engine.drySump,
    hp: engine.score.peakHP,
    tq: engine.score.peakTQ,
    mass: engineMass(),
    cost: engine.cost,
    fmep: mechFrictionMEP(6000, 1.0, 1),
    sumHtml: document.getElementById('designSummary').innerHTML
  };

  // Sustained 1.45 g cornering on dry sump
  state.engineHealth = 1.0; state.blown = false; state.wearCause = '';
  state.firing = true; state.rpm = 5000; state.oil = 100; state.coolant = 90;
  state.knockRisk = 0; state.cylPmax = 40; state.bmep = 8; state.powerHP = 90;
  state.latG = 1.45; state.sumpStarve = 0;
  for (let i = 0; i < 40; i++) stepWear(0.1);
  out.dryStarve = {
    starve: state.sumpStarve,
    oilP: state.oilP,
    health: state.engineHealth,
    cause: state.wearCause
  };

  buildVehicle();
  const lapDry = simulateLap('tech');
  out.lapDry = lapSumpReport(lapDry);

  wearEnabled = prevWear;
  return out;
});

if (r.defDry !== false || r.defSel !== 'wet') fails.push(`default drySump=${r.defDry}, sel=${r.defSel}`);
if (r.defDis) fails.push('#edDrySump should be enabled on default 4-stroke');
if (!r.tsDis || r.tsVal !== 'wet') fails.push(`#edDrySump should be disabled & wet on 2-stroke (dis=${r.tsDis}, val=${r.tsVal})`);

if (!(r.wetStarve.starve > 0.7)) fails.push(`wet sump 1.45 g did not starve: starve=${r.wetStarve.starve.toFixed(3)}`);
if (!(r.wetStarve.oilP < 1.5)) fails.push(`wet sump starved oilP=${r.wetStarve.oilP.toFixed(2)} bar not low enough`);
if (!(r.wetStarve.health < 1.0) || r.wetStarve.cause !== 'OIL STARVATION') {
  fails.push(`wet sump starvation wear wrong: health=${r.wetStarve.health.toFixed(4)}, cause='${r.wetStarve.cause}'`);
}

if (r.dry0.drySump !== true) fails.push('drySump flag not set');
if (r.dryStarve.starve !== 0) fails.push(`dry sump starved: ${r.dryStarve.starve}`);
if (Math.abs(r.dryStarve.oilP - r.wet0.oilP0) > 1e-6) fails.push(`dry sump oilP=${r.dryStarve.oilP} != baseline ${r.wet0.oilP0}`);
if (r.dryStarve.cause !== '') fails.push(`dry sump had wear cause='${r.dryStarve.cause}'`);

if (!(r.dry0.fmep > r.wet0.fmep)) fails.push(`dry sump did not add scavenge FMEP: ${r.wet0.fmep.toFixed(4)} -> ${r.dry0.fmep.toFixed(4)}`);
if (r.dry0.mass - r.wet0.mass !== 8) fails.push(`dry sump mass delta ${r.dry0.mass - r.wet0.mass} kg, expected 8`);
if (r.dry0.cost - r.wet0.cost !== 2200) fails.push(`dry sump cost delta $${r.dry0.cost - r.wet0.cost}, expected $2200`);
if (!(r.dry0.hp <= r.wet0.hp)) fails.push(`dry sump should not increase peak HP: ${r.wet0.hp} -> ${r.dry0.hp}`);
if (!r.dry0.sumHtml.includes('DRY SUMP')) fails.push('designSummary missing DRY SUMP');

if (!(r.lapWet.gLatMax > 1.1 && r.lapWet.starveTime > 0 && r.lapWet.oilWearPct > 0)) {
  fails.push(`lapWet expected starvation on slicks: ${JSON.stringify(r.lapWet)}`);
}
if (r.lapDry.starveTime !== 0 || r.lapDry.oilWearPct !== 0) {
  fails.push(`lapDry expected 0 starvation: ${JSON.stringify(r.lapDry)}`);
}

fails.push(...errors);
console.log(`Wet 1.45g: starve=${r.wetStarve.starve.toFixed(2)}, oilP=${r.wetStarve.oilP.toFixed(2)} bar, cause=${r.wetStarve.cause} | Dry: oilP=${r.dryStarve.oilP.toFixed(2)} bar, FMEP ${r.wet0.fmep.toFixed(3)}->${r.dry0.fmep.toFixed(3)} bar | Lap slicks: ${r.lapWet.starveTime.toFixed(1)}s starve -> Dry: 0s`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
