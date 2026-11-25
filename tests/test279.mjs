// WHY THIS EXISTS (B16): Vehicle & Engine Designer fixes, setup safety warnings, and layout validation.
// What must hold:
//   · vcdSummary('dims') displays ballast kg when vhBallast > 0;
//   · updateGearingLabel() displays actual vehicle.finalDrive (not dummy lerp);
//   · renderChallenge() circuit challenge budget bar/label uses total car cost (ev.cost) rather than engine-only cost;
//   · vhAwdMode selector appears on AWD and syncs with #trkAwdMode and vehicle.awdMode;
//   · VCD.cfg.warnings triggers rotor-in-wheel clearance, rollover hazard, tyre load overload, rear-before-front brake
//     lockup, 200–0 brake fade, and aero spring bottoming warnings;
//   · syncDesignEnable() blocks 1/3/5-cyl V/Boxer and 12-cyl Inline, syncs rotary edEcc.max to floor(bore/5),
//     disables edTaperPct when edTaperRpm === 0, and disables edCompWheel/edHousing on custom turboPart;
//   · Engine Designer surfaces turboLoad, spool RPM, compEff, and peak EGT;
//   · engine.icPart (water-to-air / custom) is priced in computeCost() and shown in updateDesignSummary();
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
  const g = id => document.getElementById(id);

  // 1. vcdSummary ballast display
  g('vhBallast').value = 50;
  out.ballastSummary = vcdSummary('dims', vcdCompute());
  g('vhBallast').value = 0;

  // 2. updateGearingLabel displays actual vehicle.finalDrive
  buildVehicle();
  updateGearingLabel();
  out.gearingLabel = g('valGearing').textContent;
  out.actualFd = vehicle.finalDrive.toFixed(2) + ':1';

  // 3. renderChallenge uses ev.cost (total car cost) for circuit challenge budget bar
  const circCh = CHALLENGES.find(c => c.circuit && c.budget);
  if (circCh) {
    const prevCh = activeChallenge;
    activeChallenge = circCh.id;
    renderChallenge();
    const budLbl = g('challengeCard').querySelector('.ch-bud-lbl')?.textContent || '';
    const m = buildMetrics(circCh);
    out.circBudgetMatchesCar = budLbl.includes(fmtCost(m.buildCost)) && m.buildCost !== m.cost;
    activeChallenge = prevCh;
    renderChallenge();
  }

  // 4. vhAwdMode syncs with #trkAwdMode
  g('vhDrive').value = 'awd';
  buildVehicle();
  out.vhAwdVisible = g('vhAwdMode').closest('.field').style.display !== 'none';
  g('vhAwdMode').value = 'sport';
  g('vhAwdMode').dispatchEvent(new Event('change'));
  out.awdSynced = g('trkAwdMode').value === 'sport' && vehicle.awdMode === 'sport';
  g('vhAwdMode').value = 'auto';
  g('vhAwdMode').dispatchEvent(new Event('change'));

  // 5. Vehicle Designer safety warnings (VCD.cfg.warnings)
  const base = vcdCompute();
  const wRotor = VCD.cfg.warnings(Object.assign({}, base, { rotor: 450, wheel: 13 }));
  out.warnRotor = !!wRotor.vhRotor;
  const wRoll = VCD.cfg.warnings(Object.assign({}, base, { track: 1.3, cg: 0.75, mu: 1.2 }));
  out.warnRoll = !!wRoll.vhCg;
  const wLoad = VCD.cfg.warnings(Object.assign({}, base, { mass: 3000, tyreRatedKg: 500 }));
  out.warnLoad = !!wLoad.vhTireW;
  const wLock = VCD.cfg.warnings(Object.assign({}, base, { brakeFrontShare: 0.55, mu: 1.1, fWt: 0.55, cg: 0.5, wb: 2.5 }));
  out.warnLock = !!wLock.vhBrakeBal;
  const wFade = VCD.cfg.warnings(Object.assign({}, base, { b200tF: 700, brakeOnset: 500 }));
  out.warnFade = !!wFade.vhBrake;
  const wBot = VCD.cfg.warnings(Object.assign({}, base, { aeroBottomed: true }));
  out.warnBottom = !!wBot.vhSusp;

  // 6. Engine Designer layout validation, rotary edEcc max, disabled states
  g('edType').value = 'petrol4';
  g('edCyl').value = '1';
  g('edLayout').value = 'v';
  syncDesignEnable();
  out.cyl1Layout = g('edLayout').value;
  out.cyl1VDisabled = [...g('edLayout').options].find(o => o.value === 'v').disabled;
  g('edCyl').value = '12';
  g('edLayout').value = 'inline';
  syncDesignEnable();
  out.cyl12Layout = g('edLayout').value;
  out.cyl12InlineDisabled = [...g('edLayout').options].find(o => o.value === 'inline').disabled;
  g('edCyl').value = '4';
  g('edLayout').value = 'inline';

  // Rotary edEcc max synced to floor(bore/5)
  g('edType').value = 'rotary';
  g('edBore').value = '90';
  syncDesignEnable();
  out.rotaryEccMax = +g('edEcc').max;
  g('edType').value = 'petrol4';
  g('edBore').value = '86';

  // edTaperPct disabled when edTaperRpm === 0; enabled when > 0
  g('edIntake').value = 'turbo';
  g('edTaperRpm').value = '0';
  syncDesignEnable();
  out.taperDisabledAt0 = g('edTaperPct').disabled;
  g('edTaperRpm').value = '5500';
  syncDesignEnable();
  out.taperEnabledAt5500 = !g('edTaperPct').disabled;
  g('edTaperRpm').value = '0';

  // Custom turboPart disables edCompWheel & edHousing
  const ts = g('edTurboSize');
  const tmpOpt = document.createElement('option');
  tmpOpt.value = 'part:test-turbo';
  tmpOpt.textContent = 'Test Turbo';
  ts.appendChild(tmpOpt);
  ts.value = 'part:test-turbo';
  syncDesignEnable();
  out.customTurboDisables = g('edCompWheel').disabled && g('edHousing').disabled;
  ts.value = 'medium';
  tmpOpt.remove();
  syncDesignEnable();

  // 7. Engine Designer readouts: turboLoad, spool RPM, compEff, peak EGT
  buildEngine();
  const icdRes = icdCompute();
  const slow = ICD.cfg.slowText(icdRes);
  out.icdHasEgt = icdRes.peakEgtC > 0 && slow.includes('EGT');
  out.icdHasTurbo = icdRes.turbo && icdRes.spoolRpm > 0 && icdRes.turboLoad > 0 && icdRes.compEff > 0 &&
    slow.includes('50% boost') && slow.includes('turbo load') && slow.includes('eff');

  // 8. engine.icPart pricing & summary
  const costStock = computeCost();
  engine.icPart = { name: 'Custom W2A', type: 'water', w: 220, h: 160, d: 90, pipe_m: 1.2 };
  const costW2A = computeCost();
  updateDesignSummary();
  const sumHtml = g('designSummary') ? g('designSummary').innerHTML : '';
  out.icPartPriced = costW2A > costStock;
  out.icPartSummarized = sumHtml.includes('Custom W2A') && sumHtml.includes('W2A');
  engine.icPart = null;

  return out;
});

if (!r.ballastSummary || !r.ballastSummary.includes('+50 kg')) fails.push('vcdSummary missing ballast: ' + r.ballastSummary);
if (!r.gearingLabel || !r.gearingLabel.includes(r.actualFd)) fails.push(`valGearing "${r.gearingLabel}" != "${r.actualFd}"`);
if (!r.circBudgetMatchesCar) fails.push('circuit challenge budget bar does not display total car cost');
if (!r.vhAwdVisible || !r.awdSynced) fails.push(`vhAwdMode visibility=${r.vhAwdVisible}, synced=${r.awdSynced}`);
if (!r.warnRotor) fails.push('rotor-in-wheel warning did not trigger');
if (!r.warnRoll) fails.push('rollover hazard warning did not trigger');
if (!r.warnLoad) fails.push('tyre load-rating overload warning did not trigger');
if (!r.warnLock) fails.push('rear-before-front brake lockup warning did not trigger');
if (!r.warnFade) fails.push('200-0 brake fade warning did not trigger');
if (!r.warnBottom) fails.push('aero spring bottoming warning did not trigger');
if (r.cyl1Layout !== 'inline' || !r.cyl1VDisabled) fails.push(`1-cyl V not blocked: layout=${r.cyl1Layout}, vDisabled=${r.cyl1VDisabled}`);
if (r.cyl12Layout !== 'v' || !r.cyl12InlineDisabled) fails.push(`12-cyl Inline not blocked: layout=${r.cyl12Layout}, inlineDisabled=${r.cyl12InlineDisabled}`);
if (r.rotaryEccMax !== 18) fails.push(`rotary edEcc.max expected 18 for bore=90, got ${r.rotaryEccMax}`);
if (!r.taperDisabledAt0 || !r.taperEnabledAt5500) fails.push(`edTaperPct disabled state wrong: at0=${r.taperDisabledAt0}, at5500=${r.taperEnabledAt5500}`);
if (!r.customTurboDisables) fails.push('custom turboPart did not disable edCompWheel and edHousing');
if (!r.icdHasEgt || !r.icdHasTurbo) fails.push(`ICD readouts missing: egt=${r.icdHasEgt}, turbo=${r.icdHasTurbo}`);
if (!r.icPartPriced || !r.icPartSummarized) fails.push(`icPart cost/summary missing: priced=${r.icPartPriced}, summarized=${r.icPartSummarized}`);
if (errors.length) fails.push(...errors);

await browser.close();
if (fails.length) {
  console.error('FAIL:\n' + fails.map(f => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('PASS: B16 Vehicle & Engine Designer fixes, warnings, and layout validation verified.');
