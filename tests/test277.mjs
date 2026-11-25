// WHY THIS EXISTS (B14): Build 441 & EV diagnostics across LIVE bench, OBD, ECU Computer, Guided Build, and Reports.
// What must hold:
//   · LIVE bench updates #statPmax / #statPreIgn (and #statOilP when present), hides #liveCylRow on EV, and
//     renderDynoResult() memo key refreshes when state.blown / state.wearCause changes;
//   · OBD defines & triggers P0326 (pre-ignition), P0330 (over-pressure), P0196 (oil over-temp), P0524 (low oil P),
//     and P0234 (ECU boost cut), records pMax/preIgn/oil/oilP in freeze frames, and ecuRenderDiag() displays them;
//   · ECU Computer scope includes cylPmax, preIgn, egt, oil, oilP, boostActual with finite readings, and ecuLeds()
//     lights #ecuLedEgt in AUTO mode when turbo EGT enrichment is active;
//   · Guided Build gwLimit() and gfLimit() surface Build 441 (pre-ignition, over-pressure) and EV (evdCompute) limits;
//   · Reports include engine.icPart in reportSpecRows(), diagnoseEngine() findings on Dyno sheets, Build 436 track
//     conditions on Hot Lap sheets, real EV specs in lapVehicleRows(), and full EV Dyno canvas export;
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

  // 1. LIVE bench tiles + renderDynoResult memo key
  state.cylPmax = 145;
  state.preIgn = 1.15;
  state.oilP = 0.5;
  state.rpm = 2000;
  state.firing = true;
  state.blown = false;
  updateUI();
  out.pmaxVal = document.getElementById('statPmax').querySelector('.value').textContent;
  out.pmaxDanger = document.getElementById('statPmax').classList.contains('danger');
  out.preIgnVal = document.getElementById('statPreIgn').querySelector('.value').textContent;
  out.preIgnDanger = document.getElementById('statPreIgn').classList.contains('danger');
  out.oilPShown = document.getElementById('statOilP').style.display !== 'none';
  out.oilPDanger = document.getElementById('statOilP').classList.contains('danger');
  out.cylRowIce = document.getElementById('liveCylRow').style.display !== 'none';

  // renderDynoResult memo key includes blown & wearCause
  setTab('dyno');
  renderDynoResult(true);
  const key0 = dynoResultKey;
  state.blown = true;
  state.wearCause = 'PRE-IGNITION';
  renderDynoResult(false);
  const key1 = dynoResultKey;
  out.dynoMemoChanged = key1 !== key0 && key1.includes('PRE-IGNITION');
  state.blown = false;
  state.wearCause = '';

  // 2. OBD codes, freeze frame, ecuRenderDiag, scope channels, EGT LED
  out.obdCodesPresent = ['P0326', 'P0330', 'P0196', 'P0524', 'P0234'].every(k => !!OBD_CODES[k]);
  state.oil = OIL_WEAR_C + 5;
  state.cylPmax = cylPmaxLimit() + 10;
  state.preIgn = 1.2;
  state.oilP = 0.5;
  state.rpm = 2500;
  state.firing = true;
  const conds = obdConditions();
  out.condP0326 = !!conds.P0326;
  out.condP0330 = !!conds.P0330;
  out.condP0196 = !!conds.P0196;
  out.condP0524 = !!conds.P0524;
  const ff = obdFreezeFrame();
  out.ffHasNew = ff.pMax > 0 && ff.preIgn >= 1 && ff.oil > OIL_WEAR_C && ff.oilP === 0.5;
  obd.codes.P0330 = { status: 'confirmed', ff };
  ecuRenderDiag();
  const diagHtml = document.getElementById('ecuDiag').innerHTML;
  out.ecuDiagRich = diagHtml.includes('P0330') && diagHtml.includes('CONFIRMED') && diagHtml.includes('Pmax');
  obdClear();

  // Scope channels
  const needCh = ['cylPmax', 'preIgn', 'egt', 'oil', 'oilP', 'boostActual'];
  const chMap = Object.fromEntries(ECU_SIG.ice.map(c => [c[0], c]));
  out.scopeAllPresent = needCh.every(k => !!chMap[k]);
  out.scopeAllFinite = needCh.every(k => Number.isFinite(chMap[k][5]()));

  // EGT LED in AUTO mode on a turbo engine at high RPM/boost
  const turboCar = FACTORY_CARS.find(c => {
    const fe = FACTORY_ENGINES.find(x => x.name === c.engine);
    return fe && fe.engine && fe.engine.intake === 'turbo' && !fe.engine.ci;
  });
  loadVehiclePreset(turboCar);
  state.rpm = engine.redline * 0.9;
  state.map = engine.mapMax;
  state.throttle = 1;
  state.firing = true;
  state.coolant = 90;
  state.oil = 95;
  state.oilP = null;
  state.cylPmax = 80;
  state.preIgn = 0;
  ecuLeds();
  const preLam = knockEnrichLambda(state.rpm, state.map, baseFuelLambda(state.rpm, state.map));
  const egtActive = egtEnrichLambda(state.rpm, state.map, preLam) < preLam * 0.99;
  const ledOn = document.getElementById('ecuLedEgt').classList.contains('on');
  out.egtLedMatches = ledOn === egtActive;

  // 3. Guided Build limits (Build 441 + EV)
  out.gwPreIgn = gwLimit('ice', { float: 0, redline: 7000, preIgn: 1.1, pMax: 100, pMaxLim: 130, knock: 10 });
  out.gwPmax = gwLimit('ice', { float: 0, redline: 7000, preIgn: 0.2, pMax: 155, pMaxLim: 130, knock: 10 });
  out.gwEvFreq = gwLimit('ev', { nTip: 25000, nFreq: 14000, maxRpm: 18000, pk: 200, pkM: 200 });

  // 4. Reports: icPart, diagnoseEngine warnings, Hot Lap Build 436 conditions
  engine.icPart = { name: 'Spearco W2A', type: 'water', w: 220, h: 160, d: 90, pipe_m: 1.2 };
  const iceSpec = reportSpecRows().map(x => x.join(': ')).join('\n');
  out.icPartInSpec = iceSpec.includes('Spearco W2A') && iceSpec.includes('water-to-air');
  engine.icPart = null;

  // Force a Build 441 warning so reportDiagRows() has findings and dynoReportCanvas renders cleanly
  engine.peakPmax = cylPmaxLimit() + 15;
  out.diagHasPmax = reportDiagRows().some(f => f.id === 'pmax');
  const cvIce = dynoReportCanvas(1);
  out.iceCvOk = cvIce.width === 1240 && cvIce.height === 1754;

  // Hot Lap report with Build 436 track conditions
  trackUI.weather = 'wet';
  trackUI.air = 12;
  trackUI.tyre = 'inter';
  runHotLap();
  out.lapCond = lapCondSummary(lapResult);
  const cvLap = hotLapReportCanvas(1);
  out.lapCvOk = !!cvLap && cvLap.width === 1240 && cvLap.height === 1754;
  trackUI.weather = 'dry';
  trackUI.air = 22;
  trackUI.tyre = 'own';

  // 5. EV: LIVE cylRow hidden, Guided Build gfLimit(), EV Dyno report & EV lapVehicleRows
  const evIdx = FACTORY_CARS.findIndex(c => {
    const fe = FACTORY_ENGINES.find(x => x.name === c.engine);
    return fe && fe.engine && fe.engine.type === 'electric';
  });
  loadFactoryCarUI(evIdx);
  updateUI();
  out.cylRowEvHidden = document.getElementById('liveCylRow').style.display === 'none';
  const btnRptRow = document.getElementById('btnReportPng').closest('.btn-row');
  out.evReportBtnVisible = btnRptRow.style.display !== 'none';

  const evSpec = reportSpecRows().map(x => x.join(': ')).join('\n');
  out.evSpecValid = evSpec.includes('Electric') && evSpec.includes('kWh') && !evSpec.includes('0.00 L');
  const cvEv = dynoReportCanvas(1);
  out.evCvOk = cvEv.width === 1240 && cvEv.height === 1754;

  const evLapRows = lapVehicleRows().map(x => x.join(': ')).join('\n');
  out.evLapValid = evLapRows.includes('Drive:') && evLapRows.includes('kW') && !evLapRows.includes('0.00 L') && !evLapRows.includes('4-cyl NA');

  // EV Guided Build finish limit
  const re = evdCompute();
  const evLimExpected = re && (re.pk < re.pkM * 0.99 || re.nTip < Math.min(re.maxRpm || Infinity, re.nFreq) - 1 || re.nFreq < Math.min(re.maxRpm || Infinity, re.nTip) - 1);
  const evGfLim = gfLimit();
  out.evGfOk = !evLimExpected || evGfLim === EVD.cfg.limits(re).verdict;

  return out;
});

if (r.pmaxVal !== '145' || !r.pmaxDanger) fails.push('LIVE #statPmax did not show 145 danger: ' + JSON.stringify(r));
if (r.preIgnVal !== 'ACTIVE' || !r.preIgnDanger) fails.push('LIVE #statPreIgn did not show ACTIVE danger');
if (!r.oilPShown || !r.oilPDanger) fails.push('LIVE #statOilP did not show danger at 0.5 bar');
if (!r.cylRowIce || !r.cylRowEvHidden) fails.push('LIVE #liveCylRow visibility wrong for ICE/EV');
if (!r.dynoMemoChanged) fails.push('renderDynoResult() memo key did not update on state.blown / state.wearCause');
if (!r.obdCodesPresent) fails.push('OBD_CODES missing one of P0326/P0330/P0196/P0524/P0234');
if (!r.condP0326 || !r.condP0330 || !r.condP0196 || !r.condP0524) fails.push('obdConditions() did not trigger new fault codes');
if (!r.ffHasNew) fails.push('obdFreezeFrame() missing pMax/preIgn/oil/oilP');
if (!r.ecuDiagRich) fails.push('ecuRenderDiag() missing status or Pmax freeze-frame');
if (!r.scopeAllPresent || !r.scopeAllFinite) fails.push('ECU_CH.ice missing new channels or non-finite values');
if (!r.egtLedMatches) fails.push('ecuLeds() #ecuLedEgt did not match AUTO EGT enrichment');
if (!r.gwPreIgn || !r.gwPmax || !r.gwEvFreq) fails.push('gwLimit() missing Build 441 or EV frequency limit text');
if (!r.icPartInSpec) fails.push('reportSpecRows() missing engine.icPart');
if (!r.diagHasPmax || !r.iceCvOk) fails.push('ICE dyno report missing diagnoseEngine() findings or canvas failed');
if (!r.lapCond.includes('12 °C') || !r.lapCond.includes('Inters') || !r.lapCvOk) fails.push('Hot Lap report missing Build 436 conditions: ' + r.lapCond);
if (!r.evReportBtnVisible || !r.evSpecValid || !r.evCvOk) fails.push('EV dyno report failed or button hidden');
if (!r.evLapValid) fails.push('EV lapVehicleRows() still shows ICE fallback or missing EV specs');
if (!r.evGfOk) fails.push('gfLimit() did not return EVD verdict for EV');

await browser.close();
console.log('B14 test277:', JSON.stringify(r));
if (errors.length) fails.push(...errors);
if (fails.length) {
  console.error('FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS: all B14 LIVE, OBD, ECU, Guided Build, and Report checks passed.');
