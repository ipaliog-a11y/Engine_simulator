// WHY THIS EXISTS (build 442): regression coverage for race and championship critical bugs:
//   · factory 'p:<idx>' team cars are included in champNewSeason grids with valid classTag (incl. multi-class);
//   · champApplyRaceToSeason awards prize money only for the player's team entrant(s), not every car on the grid;
//   · timed races with cfg.laps === 0 and durationSec > 0 keep rec.dt/rec.cap finite and finish cleanly;
//   · raceConfig() preserves 0°C air temperature instead of reverting to RACE.air (22°C);
//   · blue-flag ignore checks the lapping car's forward gap (by._ahead === c) and VSC trigger resets R.mistakeN to 0;
//   · raceStandings() sorts finished cars by penalty-adjusted finishT (agreeing with raceResults), and missing TRACKS
//     keys in raceTopInfo/renderRacePanel do not throw TypeError.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const fails = [];
  const out = {};

  // 1. Factory 'p:<idx>' team car inclusion & multi-class classTag
  const hatchIdx = champEligibleIndices('hot_hatch')[0];
  champSaveTeam({ id: 'player_team', name: 'PLAYER', cars: [{ ref: 'p:' + hatchIdx, driver: 'balanced' }] });
  const sMulti = champNewSeason('multi_open', { seed: 7, useTeam: true });
  const pEnt = sMulti.entrants.find(e => e.teamId === 'player_team');
  const clsStand = pEnt ? champClassStandings(sMulti.standings, pEnt.classTag) : [];
  out.teamCar = {
    found: !!pEnt,
    name: pEnt && pEnt.name,
    classTag: pEnt && pEnt.classTag,
    inClassStandings: clsStand.some(s => s.teamId === 'player_team'),
    gridLen: sMulti.entrants.length
  };
  if (!out.teamCar.found) fails.push('factory p: team car was dropped from championship grid');
  if (out.teamCar.classTag !== 'hot_hatch') fails.push('multi-class team car classTag expected hot_hatch, got ' + out.teamCar.classTag);
  if (!out.teamCar.inClassStandings) fails.push('team car missing from champClassStandings');

  // 2. Economy prize money: player-only payout (not all 8 cars)
  const sEco = champNewSeason('hatch_cup', { seed: 9, useTeam: true, credits: 50000 });
  const playerIdx = sEco.entrants.findIndex(e => e.teamId === 'player_team');
  const fakeR = {
    cfg: { track: 'tech', seed: 9 },
    events: [],
    cars: sEco.entrants.map((e, k) => ({
      id: k, M: { name: e.name, fuelRho: 0.75, ev: false },
      lapsDone: 2, finishT: k === playerIdx ? 120 : 121 + k, sTot: 5000 - k,
      best: 60, stopsDone: 0, fuelUsed: 2, state: 'fin', grid: k + 1,
      stints: [{ tyre: 'sport', from: 1 }], cc: { mode: 'normal', drv: { label: 'BALANCED' } },
      laps: [{ brake: 200 }], timePenalty: 0, blueIgnore: 0
    }))
  };
  champApplyRaceToSeason(sEco, fakeR, {});
  const expectedCredits = 50000 - CHAMP.entryFee + CHAMP.prize[0];
  out.economy = { credits: sEco.economy.credits, expected: expectedCredits };
  if (sEco.economy.credits !== expectedCredits) {
    fails.push(`economy credits ${sEco.economy.credits}, expected ${expectedCredits} (player P1 only)`);
  }

  // Solve 2 hot-hatch models once and reuse across race tests
  const entries2 = champEligibleIndices('hot_hatch').slice(0, 2).map(i => champEntrantFromPreset(i, { classId: 'hot_hatch' }));
  const models2 = entries2.map(e => raceCarModel(e, 'tech', { wet: false }));

  // 3. Timed race with cfg.laps === 0 and durationSec > 0
  const Rtimed = raceInit(models2, { track: 'tech', laps: 0, durationSec: 45, weather: 'dry', air: 22, seed: 3, grid: 'quali', warmers: false });
  raceRun(Rtimed);
  out.timed = {
    done: Rtimed.done,
    recDtFinite: Number.isFinite(Rtimed.rec.dt) && Rtimed.rec.dt > 0,
    recCapFinite: Number.isFinite(Rtimed.rec.cap) && Rtimed.rec.cap > 0,
    recN: Rtimed.rec.n,
    finishers: Rtimed.cars.filter(c => c.state === 'fin').length
  };
  if (!out.timed.done || !out.timed.recDtFinite || !out.timed.recCapFinite || out.timed.finishers !== 2) {
    fails.push('timed race laps:0 failed: ' + JSON.stringify(out.timed));
  }

  // 4. 0°C air temp preserved in raceConfig()
  const airEl = document.getElementById('raceAir');
  const prevAir = airEl.value;
  const opt0 = document.createElement('option');
  opt0.value = '0'; opt0.textContent = '0';
  airEl.appendChild(opt0);
  airEl.value = '0';
  const cfg0 = raceConfig();
  airEl.value = prevAir;
  opt0.remove();
  out.airZero = cfg0.air;
  if (cfg0.air !== 0) fails.push('raceConfig air at 0°C reverted to ' + cfg0.air);

  // 5a. Blue-flag ignore checks lapping car's forward gap (by._ahead === c && by._gap < RACE.follow*2)
  const placeAt = (R, c, sTarget) => {
    let i = 0;
    while (i + 1 < R.cS.length && R.cS[i + 1] <= sTarget) i++;
    const a = R.cS[i], b = i + 1 < R.cS.length ? R.cS[i + 1] : R.Lc;
    c.i = i; c.f = b > a ? (sTarget - a) / (b - a) : 0;
  };
  const Rbf = raceInit(models2, { track: 'tech', laps: 3, weather: 'dry', air: 22, seed: 5, grid: 'quali', vsc: true });
  const lapper = Rbf.cars[0], lapped = Rbf.cars[1];
  // Position lapper ~1.3*RACE.follow behind lapped (> RACE.follow so blue isn't re-armed, < RACE.follow*2 so expiry penalises)
  lapped.lapsDone = 0; placeAt(Rbf, lapped, 200 + RACE.follow * 1.3); lapped.v = 20; lapped.launch = null; lapped.sTot = raceDist(Rbf, lapped);
  lapper.lapsDone = 1; placeAt(Rbf, lapper, 200); lapper.v = 20; lapper.launch = null; lapper.sTot = raceDist(Rbf, lapper);
  lapped.blue = RACE.dt * 0.5; lapped._blueBy = lapper.id;
  raceStepOnce(Rbf);
  out.bluePenBlocking = { pen: lapped.timePenalty, gap: lapper._gap, ahead: lapper._ahead === lapped };
  if (!(lapped.timePenalty > 0)) fails.push('blue-flag penalty did not trigger when lapper was behind lapped car: ' + JSON.stringify(out.bluePenBlocking));

  // Now test when lapper has already passed lapped (c._gap < RACE.follow*2, but by._gap is ~Lc)
  const Rbf2 = raceInit(models2, { track: 'tech', laps: 3, weather: 'dry', air: 22, seed: 5, grid: 'quali', vsc: true });
  const lapper2 = Rbf2.cars[0], lapped2 = Rbf2.cars[1];
  lapped2.lapsDone = 0; placeAt(Rbf2, lapped2, 200); lapped2.v = 20; lapped2.launch = null; lapped2.sTot = raceDist(Rbf2, lapped2);
  lapper2.lapsDone = 1; placeAt(Rbf2, lapper2, 200 + RACE.follow * 1.3); lapper2.v = 20; lapper2.launch = null; lapper2.sTot = raceDist(Rbf2, lapper2);
  lapped2.blue = RACE.dt * 0.5; lapped2._blueBy = lapper2.id;
  raceStepOnce(Rbf2);
  out.bluePenPassed = lapped2.timePenalty;
  if (lapped2.timePenalty !== 0) fails.push('false blue-flag penalty triggered after lapper was already ahead: ' + lapped2.timePenalty);

  // 5b. VSC trigger resets R.mistakeN to 0 so a single subsequent mistake does not immediately re-trigger VSC
  const Rvsc = raceInit(models2, { track: 'tech', laps: 3, weather: 'dry', air: 22, seed: 5, grid: 'quali', vsc: true });
  const c0 = Rvsc.cars[0];
  c0.lapsDone = 0; c0.i = 5; c0.f = 0.99; c0.v = 30; c0.launch = null; c0.sTot = raceDist(Rvsc, c0);
  Rvsc.mistakeN = CHAMP.vscMistakes - 1;
  c0.mistake = { at: 6, d: null };
  raceStepOnce(Rvsc);
  const afterTrigger = { vscActive: !!Rvsc.vsc, mistakeN: Rvsc.mistakeN };
  // End VSC and trigger one more mistake: VSC must NOT re-trigger
  Rvsc.vsc = null;
  c0.i = 7; c0.f = 0.99; c0.mistake = { at: 8, d: null };
  raceStepOnce(Rvsc);
  out.vscAfterTrigger = { ...afterTrigger, retriggeredAfterOne: !!Rvsc.vsc, mistakeNAfterOne: Rvsc.mistakeN };
  if (!afterTrigger.vscActive || afterTrigger.mistakeN !== 0 || Rvsc.vsc || Rvsc.mistakeN !== 1) {
    fails.push('VSC trigger/reset failed: ' + JSON.stringify(out.vscAfterTrigger));
  }

  // 6. Penalty-aware raceStandings & missing TRACKS guard
  const Rpen = raceInit(models2, { track: 'tech', laps: 2, weather: 'dry', air: 22, seed: 11, grid: 'quali' });
  raceRun(Rpen);
  const resBefore = raceResults(Rpen);
  const origP1 = Rpen.cars.find(c => c.id === resBefore[0].id);
  const origP2 = Rpen.cars.find(c => c.id === resBefore[1].id);
  const penAdd = Math.ceil((origP2.finishT - origP1.finishT) + 10);
  origP1.timePenalty = (origP1.timePenalty || 0) + penAdd;
  origP1.finishT += penAdd;
  const resAfter = raceResults(Rpen);
  const standAfter = raceStandings(Rpen, Rpen.t);
  out.penaltyOrder = {
    resultsWinner: resAfter[0].id,
    standingsWinner: standAfter[0].c.id,
    standingsGapP2: standAfter[1].gap
  };
  if (standAfter[0].c.id !== resAfter[0].id) {
    fails.push(`raceStandings winner ${standAfter[0].c.id} disagrees with raceResults winner ${resAfter[0].id}`);
  }

  // Missing TRACKS guard in renderRacePanel / raceTopInfo
  Rpen.cfg.track = 'missing_circuit_pack';
  raceUI.run = Rpen; raceUI.phase = 'live'; raceUI.t = Rpen.t;
  let missingTrkErr = null;
  try {
    raceTopInfo();
    renderRacePanel(true);
  } catch (e) {
    missingTrkErr = e && e.message || String(e);
  }
  raceUI.phase = 'setup'; raceUI.run = null;
  out.missingTrkErr = missingTrkErr;
  if (missingTrkErr) fails.push('missing TRACKS threw: ' + missingTrkErr);

  return { out, fails };
});

await browser.close();
const fails = [...errors, ...(r.fails || [])];
console.log(JSON.stringify(r.out, null, 2));
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
