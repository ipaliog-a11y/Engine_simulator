// Championship season engine (build 387): classes, points, seeds, race hooks.
//
// WHY THIS EXISTS. The CHAMP tab orchestrates simulateRace into seasons. What must hold:
//   · every racing class has at least one eligible factory car (open: all);
//   · Top-8 points sum to 39 for a full finishing order;
//   · round seeds are stable (seed + i * prime);
//   · a new season persists under pes.champ.active and advances standings after a short race;
//   · raceInit accepts durationSec / vsc / minStops without throwing;
//   · soft BoP ballast is a non-negative multiple of the step on a hot GT.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(async () => {
  const out = { fails: [] };
  // classes
  out.classCounts = {};
  for (const id of Object.keys(CHAMP_CLASSES)) {
    const n = champEligiblePresets(id).length;
    out.classCounts[id] = n;
    if (n < 1) out.fails.push('class ' + id + ' has no cars');
  }
  // points
  const table = champPointsTable('top8');
  out.pointsSum = table.reduce((a, b) => a + b, 0);
  if (out.pointsSum !== 39) out.fails.push('top8 points sum ' + out.pointsSum);
  const standings = champBlankStandings([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  champApplyPoints(standings, [
    { id: 0, state: 'fin' }, { id: 1, state: 'fin' }, { id: 2, state: 'dnf' }
  ], table, { flId: 1, flPoint: true });
  out.ptsA = standings.find(s => s.id === 0).pts;
  out.ptsB = standings.find(s => s.id === 1).pts;
  out.ptsC = standings.find(s => s.id === 2).pts;
  if (out.ptsA !== 10) out.fails.push('winner pts ' + out.ptsA);
  if (out.ptsB !== 9) out.fails.push('P2+FL pts ' + out.ptsB); // 8+1
  if (out.ptsC !== 0) out.fails.push('DNF scored ' + out.ptsC);
  // seeds
  out.seed0 = champRoundSeed(42, 0);
  out.seed1 = champRoundSeed(42, 1);
  out.seed1b = champRoundSeed(42, 1);
  if (out.seed0 === out.seed1) out.fails.push('round seeds collide');
  if (out.seed1 !== out.seed1b) out.fails.push('round seed unstable');
  // BoP
  const gt = CHAMP_CLASSES.gt;
  const pool = champEligiblePresets('gt');
  const hot = pool.slice().sort((a, b) => champEngineHp(b) / ((b.body && b.body.kg) || 1) - champEngineHp(a) / ((a.body && a.body.kg) || 1))[0];
  out.ballast = champBallastKg(hot, gt);
  if (out.ballast < 0 || out.ballast % CHAMP.ballastStep) out.fails.push('bad ballast ' + out.ballast);
  // race hooks: short timed race with VSC on, 2 cars
  const idxs = champEligibleIndices('hot_hatch').slice(0, 2);
  const entries = idxs.map(i => champEntrantFromPreset(i, { classId: 'hot_hatch' }));
  const cfg = { track: 'tech', laps: 2, durationSec: 0, minStops: 0, weather: 'dry', air: 22, seed: 7, grid: 'quali', vsc: true, warmers: false };
  const R = simulateRace(entries, cfg);
  out.raceDone = !!R.done;
  out.raceCars = R.cars.length;
  out.hasResults = raceResults(R).length === 2;
  if (!out.raceDone) out.fails.push('race did not finish');
  // season create + one round (2 laps, 2 cars — keep CI short)
  try { localStorage.removeItem('pes.champ.active'); } catch (e) {}
  const S = champNewSeason('hatch_cup', {
    seed: 11, mode: 'round',
    entrants: entries
  });
  S.calendar = [{ track: 'tech', laps: 2, weather: 'dry' }];
  S.regs = Object.assign({}, S.regs, { weekend: 'feature', flPoint: true, economy: false, vsc: true });
  champSaveActive(S);
  const loaded = champActive();
  out.persisted = !!(loaded && loaded.seriesId === 'hatch_cup' && loaded.entrants.length === 2);
  await champSimulateRound(S);
  out.afterPts = S.standings[0].pts;
  out.roundIdx = S.roundIdx;
  if (!out.persisted) out.fails.push('season did not persist');
  if (!(out.afterPts > 0)) out.fails.push('no points after round');
  if (out.roundIdx !== 1) out.fails.push('roundIdx ' + out.roundIdx);
  // UI tab present
  out.hasTab = !!document.getElementById('tabChamp');
  out.hasPanel = !!document.getElementById('champPanel');
  if (!out.hasTab || !out.hasPanel) out.fails.push('CHAMP UI missing');
  return out;
});
await browser.close();
const fails = [...errors, ...(r.fails || [])];
console.log('== class counts ==', JSON.stringify(r.classCounts));
console.log('== points sum', r.pointsSum, 'A/B/C', r.ptsA, r.ptsB, r.ptsC, '==');
console.log('== seeds', r.seed0, r.seed1, 'ballast', r.ballast, '==');
console.log('== race done', r.raceDone, 'season pts', r.afterPts, 'round', r.roundIdx, '==');
if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
