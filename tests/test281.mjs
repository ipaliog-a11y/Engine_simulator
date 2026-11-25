// WHY THIS EXISTS (build 458): Canvas/HUD layout fixes, challenge replay controls, EV drift tach,
// challenge error verdicts/tooltips, GPX track deletion, wheel-in-air legend, valvetrain cutaway, and paused particles.
// What must hold:
//   · Dynamic challenge replays show #btnChalPlay and #chalReplayScrub, toggle pause/play, and scrub chalReplay.t;
//   · Genuine failure reasons (no-clear, no-hold, no-run) show distinct verdicts instead of "This challenge is not ready yet.";
//   · drawDriftHud uses engine.motor.nMax as tachometer redline when isElectric() is true;
//   · chal-rank failed rows with r.err expose r.err in a title tooltip;
//   · Imported GPX tracks show #btnDeleteGpx and deleting removes them from TRACKS and localStorage['pes.tracks'];
//   · Suspension calculator step legend (#susLegS) includes the red "wheel in air" entry;
//   · Engine cutaway uses e.valvetrain (not e.valves===2) to select OHV vs SOHC/DOHC;
//   · track-scene-v2 freezes particle spawning and integration while track replay is paused.
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

  // 1. Challenge replay Play/Pause & scrub slider on skidpad
  const mx5 = FACTORY_CARS.find(c => c.name.includes('MX-5'));
  loadVehiclePreset(mx5);
  setTab('challenges');
  activeRunChallenge = 'skidpad';
  refreshChallenge();
  const row = document.getElementById('chalReplayRow');
  const pb = document.getElementById('btnChalPlay');
  const sc = document.getElementById('chalReplayScrub');
  const shown = !!row && !row.hidden;
  const playBefore = chalReplay.playing;
  pb.click();
  const playAfterPause = chalReplay.playing;
  const labelPaused = pb.textContent;
  sc.value = '500';
  sc.dispatchEvent(new Event('input', { bubbles: true }));
  const tScrub = chalReplay.t;
  pb.click();
  const playAfterResume = chalReplay.playing;
  out.chalReplay = { shown, playBefore, playAfterPause, labelPaused, tScrub, playAfterResume };

  // 2. Genuine failure verdicts vs "not ready yet"
  const head = document.getElementById('chalHead');
  const checkFail = (reason) => {
    chalResult = { ok: false, reason };
    renderRunChallenge();
    return head.textContent;
  };
  out.verdicts = {
    noClear: checkFail('no-clear'),
    noHold: checkFail('no-hold'),
    noRun: checkFail('no-run'),
    unknown: checkFail('unimplemented')
  };

  // 3. chal-rank r.err title tooltip
  chalRank.ch = runChallengeById('skidpad');
  chalRank.busy = false;
  chalRank.rows = [{ name: 'Broken Car', s: null, err: 'Solver boom 42' }];
  renderChalRank();
  const errTd = document.querySelector('#chalRankOut td[title="Solver boom 42"]');
  out.rankTooltip = errTd ? errTd.getAttribute('title') : null;

  // 4. EV Drift tach redline uses engine.motor.nMax
  const evCar = FACTORY_CARS.find(c => c.name.includes('Model 3'));
  loadVehiclePreset(evCar);
  const expectedNMax = engine.motor && engine.motor.nMax;
  drawDriftHud({ rpm: 8000, v: 20, gear: 1, thr: 0.8, brk: 0, hb: 0.5, ax: 0, ay: 5, delta: 0.1 });
  out.evDrift = { isEv: isElectric(), expectedNMax, hudRl: drawDriftHud.lastRl };

  // 5. Susp-window wheel-in-air legend
  openSuspWin();
  out.suspLegend = document.getElementById('susLegS').textContent;
  closeSuspWin();

  // 6. Engine cutaway valvetrain check (2V SOHC -> SOHC, 4V OHV -> OHV)
  loadVehiclePreset(mx5);
  engine.valves = 2; engine.valvetrain = 'sohc-rocker';
  drawEngine(0);
  const vt2Sohc = drawPistonCutaway.dbg && drawPistonCutaway.dbg.valvetrain;
  engine.valves = 4; engine.valvetrain = 'ohv';
  drawEngine(0);
  const vt4Ohv = drawPistonCutaway.dbg && drawPistonCutaway.dbg.valvetrain;
  out.valvetrain = { vt2Sohc, vt4Ohv };

  // 7. GPX track delete from TRACKS and localStorage['pes.tracks']
  const fakePts = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2;
    return [Math.cos(a) * 120, Math.sin(a) * 80, 0];
  });
  const gpxKey = 'gpx_test281';
  TRACKS[gpxKey] = { imported: true, label: 'Test GPX 281', width: 12, wvar: 0, wprof: [], blurb: '', pts: fakePts, names: [] };
  trackKey = gpxKey;
  saveImportedTracks();
  refreshTrackList();
  const delBtn = document.getElementById('btnDeleteGpx');
  const delVisibleBefore = !!delBtn && !delBtn.hidden;
  const storedBefore = JSON.parse(localStorage.getItem('pes.tracks') || '{}');
  delBtn.click();
  const delVisibleAfter = !!delBtn && !delBtn.hidden;
  const storedAfter = JSON.parse(localStorage.getItem('pes.tracks') || '{}');
  out.gpxDelete = {
    delVisibleBefore,
    hadInStore: !!storedBefore[gpxKey],
    delVisibleAfter,
    inTracksAfter: !!TRACKS[gpxKey],
    inStoreAfter: !!storedAfter[gpxKey]
  };

  // 8. track-scene-v2 paused replay freezes particles
  setTab('track');
  trackKey = 'mixed';
  const T = buildTrack(trackKey);
  sceneBind(T);
  const p0 = T.pts[0];
  const hd0 = Math.atan2(p0.ty || 0, p0.tx || 1);
  const car = { x: p0.x, y: p0.y, hd: hd0, brk: 1, col: '#ff4444' };
  const cam = sceneChase(car, 320, 200, 14, 0.72);
  lapReplay.playing = true;
  for (let i = 0; i < 40; i++) scenePaintV2(ctx, cam, { cars: [car] });
  const playingStats = window.sceneV2Stats();
  lapReplay.playing = false;
  const pBefore = window.sceneV2Stats();
  for (let i = 0; i < 20; i++) scenePaintV2(ctx, cam, { cars: [car] });
  const pAfter = window.sceneV2Stats();
  lapReplay.playing = true;
  out.particles = { playingCount: playingStats.particles, pBefore, pAfter };

  return out;
});

if (!r.chalReplay.shown) fails.push('chalReplayRow not shown on dynamic challenge');
if (!r.chalReplay.playBefore || r.chalReplay.playAfterPause || !r.chalReplay.playAfterResume) {
  fails.push('btnChalPlay did not toggle playing state: ' + JSON.stringify(r.chalReplay));
}
if (!(r.chalReplay.tScrub > 0)) fails.push('chalReplayScrub did not advance chalReplay.t: ' + r.chalReplay.tScrub);

for (const k of ['noClear', 'noHold', 'noRun']) {
  if (/not ready yet/i.test(r.verdicts[k])) fails.push(`verdict ${k} fell back to "not ready yet": ${r.verdicts[k]}`);
}
if (!/not ready yet/i.test(r.verdicts.unknown)) fails.push('unknown reason did not fall back to "not ready yet"');

if (r.rankTooltip !== 'Solver boom 42') fails.push('chal-rank error row missing title tooltip: ' + r.rankTooltip);

if (!r.evDrift.isEv || r.evDrift.hudRl !== r.evDrift.expectedNMax) {
  fails.push(`EV drawDriftHud redline mismatch: got ${r.evDrift.hudRl}, expected ${r.evDrift.expectedNMax}`);
}

if (!/wheel in air/i.test(r.suspLegend)) fails.push('susLegS missing "wheel in air": ' + r.suspLegend);

if (!/^SOHC/.test(r.valvetrain.vt2Sohc || '')) fails.push('2V SOHC cutaway should report SOHC, got: ' + r.valvetrain.vt2Sohc);
if (r.valvetrain.vt4Ohv !== 'OHV') fails.push('4V OHV cutaway should report OHV, got: ' + r.valvetrain.vt4Ohv);

if (!r.gpxDelete.delVisibleBefore || !r.gpxDelete.hadInStore || r.gpxDelete.delVisibleAfter || r.gpxDelete.inTracksAfter || r.gpxDelete.inStoreAfter) {
  fails.push('GPX delete failed: ' + JSON.stringify(r.gpxDelete));
}

if (!(r.particles.playingCount > 0)) fails.push('expected particles to spawn while playing');
if (r.particles.pBefore.particles !== r.particles.pAfter.particles) {
  fails.push(`paused particle count changed: ${r.particles.pBefore.particles} -> ${r.particles.pAfter.particles}`);
}
if (r.particles.pBefore.particle0 && r.particles.pAfter.particle0) {
  if (r.particles.pBefore.particle0.x !== r.particles.pAfter.particle0.x ||
      r.particles.pBefore.particle0.y !== r.particles.pAfter.particle0.y ||
      r.particles.pBefore.particle0.life !== r.particles.pAfter.particle0.life) {
    fails.push('paused particle moved or aged: ' + JSON.stringify({ b: r.particles.pBefore.particle0, a: r.particles.pAfter.particle0 }));
  }
}

if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) {
  console.error('FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('PASS test281:', JSON.stringify({
  chalReplay: r.chalReplay,
  evDrift: r.evDrift,
  valvetrain: r.valvetrain,
  gpxDelete: r.gpxDelete,
  particles: { count: r.particles.pBefore.particles, frozen: true }
}));
