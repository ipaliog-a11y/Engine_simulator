// WHY THIS EXISTS (build 453): regression coverage for championship completion, timed-race countdown, and cross-mode audio:
//   · all 5 previously unreachable classes (kei_cup, muscle, touring, proto, hyb_cup) have unlocked series with valid tracks and eligible presets;
//   · player team class eligibility blocks ineligible cars in champCheckTeamEligibility / champNewSeason and updates #champEligNote;
//   · S.economy.tyres consumes dry/wet sets per stint across rounds, and CAREER mode persists credits and charges extra tyre sets while sandbox does not;
//   · WATCH REPLAY button wires champUI.lastRun to raceUI.run and opens the race tab;
//   · timed races (cfg.durationSec > 0) render countdown clock (MM:SS / HH:MM:SS) in #raceHead and #raceTopInfo instead of LAP X/0;
//   · skidpad-run.js records per-wheel alpha and mu; motorSoundState, soundSource, and screechSlide work across Skidpad, Drift (incl. EV & Hybrid with bench off), and Race focus car.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const fails = [];
  const out = {};

  // 1. All 5 new series exist, are unlocked, have valid tracks and >= 2 eligible presets
  const newSeriesIds = ['kei_cup', 'muscle_cup', 'touring_cup', 'proto_cup', 'hybrid_cup'];
  const unlocked = champUnlockedIds();
  out.newSeries = {};
  for (const sid of newSeriesIds) {
    const s = CHAMP_SERIES.find(x => x.id === sid);
    if (!s) { fails.push('missing series ' + sid); continue; }
    const badTracks = s.calendar.filter(rd => !TRACKS[rd.track]).map(rd => rd.track);
    const eligN = champEligiblePresets(s.classId).length;
    out.newSeries[sid] = { unlocked: unlocked.includes(sid), badTracks, eligN };
    if (!unlocked.includes(sid)) fails.push('series ' + sid + ' should be unlocked');
    if (badTracks.length) fails.push('series ' + sid + ' has unknown tracks: ' + badTracks.join(','));
    if (eligN < 2) fails.push('series ' + sid + ' class ' + s.classId + ' has only ' + eligN + ' eligible presets');
  }

  // 2. Player team class eligibility
  const gtIdx = champEligibleIndices('gt')[0];
  const keiIdx = champEligibleIndices('kei_cup')[0];
  const hatchIdx = champEligibleIndices('hot_hatch')[0];
  const chkBad = champCheckTeamEligibility({ cars: [{ ref: 'p:' + gtIdx, driver: 'balanced' }] }, champSeries('kei_cup'));
  const chkOk = champCheckTeamEligibility({ cars: [{ ref: 'p:' + keiIdx, driver: 'balanced' }] }, champSeries('kei_cup'));
  out.elig = { badOk: chkBad.ok, badLen: chkBad.bad.length, okOk: chkOk.ok };
  if (chkBad.ok || chkBad.bad.length !== 1) fails.push('GT car should be ineligible for kei_cup: ' + JSON.stringify(chkBad));
  if (!chkOk.ok) fails.push('Kei car should be eligible for kei_cup: ' + JSON.stringify(chkOk));

  champSaveTeam({ id: 'player_team', name: 'PLAYER', cars: [{ ref: 'p:' + gtIdx, driver: 'balanced' }] });
  const sInelig = champNewSeason('kei_cup', { seed: 5, useTeam: true });
  const dropped = !sInelig.entrants.some(e => e.teamId === 'player_team') && sInelig.ineligibleTeam.length === 1;
  out.eligDropped = dropped;
  if (!dropped) fails.push('ineligible team car was not dropped in champNewSeason');

  // 3. Tyre allocation consumption & CAREER vs sandbox credits persistence
  champSaveTeam({ id: 'player_team', name: 'PLAYER', cars: [{ ref: 'p:' + hatchIdx, driver: 'balanced' }] });
  champSaveCareer({ unlocked: champUnlockedIds(), finished: [], credits: 50000 });
  const sSand = champNewSeason('hatch_cup', { seed: 11, mode: 'round', useTeam: true, credits: 50000 });
  const pSand = sSand.entrants.findIndex(e => e.teamId === 'player_team');
  const dryBeforeSand = sSand.economy.tyres[pSand].dry;
  const fakeRace = (S, pIdx, stints) => ({
    cfg: { track: 'tech', seed: 11, weather: 'dry' },
    events: [],
    cars: S.entrants.map((e, k) => ({
      id: k, M: { name: e.name, fuelRho: 0.75, ev: false },
      lapsDone: 2, finishT: k === pIdx ? 120 : 121 + k, sTot: 5000 - k,
      best: 60, stopsDone: stints.length - 1, fuelUsed: 2, state: 'fin', grid: k + 1,
      stints: k === pIdx ? stints : [{ tyre: 'sport', from: 1 }],
      cc: { mode: 'normal', drv: { label: 'BALANCED' } },
      laps: [{ brake: 200 }], timePenalty: 0, blueIgnore: 0
    }))
  });
  champApplyRaceToSeason(sSand, fakeRace(sSand, pSand, [{ tyre: 'sport', from: 1 }, { tyre: 'sport', from: 5 }]), {});
  const dryAfterSand = sSand.economy.tyres[pSand].dry;
  const careerAfterSand = champCareer().credits;
  out.sandbox = { dryBefore: dryBeforeSand, dryAfter: dryAfterSand, careerCredits: careerAfterSand };
  if (dryAfterSand !== dryBeforeSand - 2) fails.push(`sandbox dry tyres expected ${dryBeforeSand - 2}, got ${dryAfterSand}`);
  if (careerAfterSand !== 50000) fails.push(`sandbox mode should not mutate career credits, got ${careerAfterSand}`);

  const sCar = champNewSeason('hatch_cup', { seed: 12, mode: 'career', useTeam: true, credits: 50000 });
  const pCar = sCar.entrants.findIndex(e => e.teamId === 'player_team');
  // Exhaust all dry sets + 1 extra to verify CHAMP.tyreSetCost charge
  const initDryCar = sCar.economy.tyres[pCar].dry;
  const manyStints = Array.from({ length: initDryCar + 1 }, (_, idx) => ({ tyre: 'sport', from: idx + 1 }));
  champApplyRaceToSeason(sCar, fakeRace(sCar, pCar, manyStints), {});
  const expectedCarCredits = 50000 - CHAMP.entryFee - CHAMP.tyreSetCost + CHAMP.prize[0];
  out.career = {
    initDryCar,
    dryLeft: sCar.economy.tyres[pCar].dry,
    tyresBought: sCar.economy.tyresBought,
    credits: sCar.economy.credits,
    persisted: champCareer().credits,
    expected: expectedCarCredits
  };
  if (sCar.economy.tyres[pCar].dry !== 0) fails.push('career dry tyres should clamp to 0');
  if (sCar.economy.tyresBought !== 1) fails.push('career tyresBought expected 1, got ' + sCar.economy.tyresBought);
  if (sCar.economy.credits !== expectedCarCredits || champCareer().credits !== expectedCarCredits) {
    fails.push(`career credits mismatch: season=${sCar.economy.credits}, persisted=${champCareer().credits}, expected=${expectedCarCredits}`);
  }

  // 4. CHAMP tab hub preview redraw, eligibility note, and WATCH REPLAY button
  champClearActive();
  setTab('champ');
  const serSel = document.getElementById('champSeries');
  const hasAllNewOpts = newSeriesIds.every(id => [...serSel.options].some(o => o.value === id));
  if (!hasAllNewOpts) fails.push('#champSeries missing one or more new series options');
  // Test eligibility note with GT car selected for kei_cup
  champSaveTeam({ id: 'player_team', name: 'PLAYER', cars: [{ ref: 'p:' + gtIdx, driver: 'balanced' }] });
  champRenderHub();
  const serSel2 = document.getElementById('champSeries');
  serSel2.value = 'kei_cup';
  serSel2.dispatchEvent(new Event('change'));
  const useT = document.getElementById('champUseTeam');
  useT.checked = true;
  useT.dispatchEvent(new Event('change'));
  const eligNoteVisible = !document.getElementById('champEligNote').hidden;
  out.eligNoteVisible = eligNoteVisible;
  if (!eligNoteVisible) fails.push('#champEligNote did not appear for ineligible GT car in kei_cup');

  // 5. Timed race countdown clock + WATCH REPLAY button
  out.fmtClock = { m: fmtRaceClock(125), h: fmtRaceClock(3665) };
  if (out.fmtClock.m !== '02:05') fails.push('fmtRaceClock(125) expected 02:05, got ' + out.fmtClock.m);
  if (out.fmtClock.h !== '01:01:05') fails.push('fmtRaceClock(3665) expected 01:01:05, got ' + out.fmtClock.h);

  const entries2 = champEligibleIndices('hot_hatch').slice(0, 2).map(i => champEntrantFromPreset(i, { classId: 'hot_hatch' }));
  const models2 = entries2.map(e => raceCarModel(e, 'tech', { wet: false }));
  const Rtimed = raceInit(models2, { track: 'tech', laps: 0, durationSec: 30, weather: 'dry', air: 22, seed: 3, grid: 'quali', warmers: false });
  raceRun(Rtimed);

  // Wire WATCH REPLAY on CHAMP tab
  champUI.lastRun = Rtimed;
  champSaveActive(sCar);
  champShowSeason(sCar);
  const watchBtn = document.getElementById('champWatch');
  out.hasWatchBtn = !!watchBtn;
  if (!watchBtn) fails.push('#champWatch button missing on season view with results');
  else watchBtn.click();
  out.afterWatch = { tab: vizMode, sameRun: raceUI.run === Rtimed, phase: raceUI.phase };
  if (vizMode !== 'race' || raceUI.run !== Rtimed || raceUI.phase !== 'live') {
    fails.push('WATCH REPLAY did not open race tab with lastRun: ' + JSON.stringify(out.afterWatch));
  }

  raceUI.t = 5;
  raceUI.playing = true;
  renderRacePanel(true);
  const headTxt = document.getElementById('raceHead').textContent;
  const topTxt = document.getElementById('raceTopInfo').textContent;
  out.timedClock = { headTxt, topTxt };
  if (!headTxt.includes('00:25') || headTxt.includes('/0')) fails.push('timed #raceHead missing countdown or has /0: ' + headTxt);
  if (!topTxt.includes('00:25') || topTxt.includes('/0')) fails.push('timed #raceTopInfo missing countdown or has /0: ' + topTxt);

  // 6. Cross-mode audio: Race focus car (ICE & EV), Skidpad alpha + EV motorSoundState + screechSlide, Hybrid in Drift
  Sound.on = true;
  // 6a. Race focus car audio (ICE)
  loadVehiclePreset(FACTORY_CARS.find(c => c.name.includes('MX-5')));
  const rfIce = raceFocusCar();
  const srcIce = soundSource();
  const scrRace = screechSlide();
  out.raceAudioIce = { hasFocus: !!rfIce, hasSrc: !!srcIce, rpm: srcIce && srcIce.rpm, scrFinite: Number.isFinite(scrRace) && scrRace >= 0 };
  if (!rfIce || !srcIce || !(srcIce.rpm > 0)) fails.push('race ICE audio missing: ' + JSON.stringify(out.raceAudioIce));
  if (!out.raceAudioIce.scrFinite) fails.push('race screechSlide invalid: ' + scrRace);

  // 6b. EV in Race and Skidpad (alpha recorded + motorSoundState + screechSlide)
  loadVehiclePreset(FACTORY_CARS.find(c => c.name.includes('Tesla Model 3')));
  const motRaceEv = motorSoundState(motorSoundConfig(engine));
  out.raceAudioEv = motRaceEv;
  if (!motRaceEv || !Number.isFinite(motRaceEv.rpm) || !Number.isFinite(motRaceEv.T)) {
    fails.push('race EV motorSoundState missing: ' + JSON.stringify(motRaceEv));
  }

  const skidRes = simulateSkidpadChallenge();
  const skidHasAlpha = skidRes.samples.length > 0 && Array.isArray(skidRes.samples[0].alpha) && skidRes.samples[0].alpha.length === 4;
  vizMode = 'challenges';
  chalResult = skidRes;
  chalUI.phase = 'live';
  chalMooseT0 = performance.now() - 500;
  const motSkidEv = motorSoundState(motorSoundConfig(engine));
  const scrSkid = screechSlide();
  out.skidEv = {
    ok: skidRes.ok,
    mu: skidRes.mu,
    hasAlpha: skidHasAlpha,
    mot: motSkidEv,
    scrFinite: Number.isFinite(scrSkid) && scrSkid >= 0
  };
  if (!skidHasAlpha || !(skidRes.mu > 0)) fails.push('skidpad-run missing alpha/mu: ' + JSON.stringify(out.skidEv));
  if (!motSkidEv || !Number.isFinite(motSkidEv.rpm) || !(motSkidEv.rpm > 0)) fails.push('EV skidpad motorSoundState missing: ' + JSON.stringify(motSkidEv));
  if (!out.skidEv.scrFinite) fails.push('skidpad screechSlide invalid: ' + scrSkid);

  // 6c. Hybrid in Drift when bench engine was off
  const hyCar = FACTORY_CARS.find(c => c.cat === 'Hybrid');
  loadVehiclePreset(hyCar);
  // Simulate bench engine off state
  if (state) state.rpm = 0;
  const driftRes = {
    ok: true, kind: 'drift', pkR: 0.12, mu: 1.0,
    samples: [
      { t: 0, v: 18, rpm: 3200, thr: 0.7, brk: 0, alpha: [0.05, 0.05, 0.25, 0.25] },
      { t: 1, v: 18, rpm: 3400, thr: 0.8, brk: 0, alpha: [0.05, 0.05, 0.28, 0.28] }
    ]
  };
  chalResult = driftRes;
  chalUI.phase = 'live';
  chalMooseT0 = performance.now() - 500;
  const hySrc = soundSource();
  const hyMot = motorSoundState(motorSoundConfig(engine));
  const hyMutedInChal = vizMode === 'dyno' && hybBenchEngineOff();
  out.hybridDrift = { hasSrc: !!hySrc, rpm: hySrc && hySrc.rpm, hasMot: !!hyMot, mutedInChal: hyMutedInChal };
  if (!hySrc || !(hySrc.rpm > 0) || hyMutedInChal) fails.push('hybrid drift audio muted or missing: ' + JSON.stringify(out.hybridDrift));
  if (!hyMot || !Number.isFinite(hyMot.rpm)) fails.push('hybrid drift motorSoundState missing: ' + JSON.stringify(out.hybridDrift));

  Sound.on = false;
  return { fails, out };
});

await browser.close();
console.log(JSON.stringify(r.out, null, 2));
const allFails = [...r.fails, ...errors];
if (allFails.length) {
  console.error('FAIL:', allFails);
  process.exit(1);
}
console.log('PASS');
process.exit(0);
