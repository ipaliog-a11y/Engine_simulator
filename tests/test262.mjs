// Drive tab landing pages, Track conditions, and ECU removal from Drive tabs.
//
// WHY THIS EXISTS. The ECU laptop did not work on Drive tabs, and opening TRACK or CHALLENGES
// immediately ran the car instead of letting the player pick a circuit, conditions or challenge
// from a preview first. What must hold:
//   · #ecuComputer and #btnEcu are hidden on all four Drive sub-tabs (track, race, champ, challenges)
//     and remain visible on LIVE;
//   · opening TRACK lands on #trackSetup with a non-blank circuit map preview and quiet audio;
//     START LAP runs the lap and enters #trackLive; CHANGE TRACK returns to #trackSetup;
//   · RACE and CHAMP landing pages draw non-blank circuit map previews on the canvas;
//   · opening CHALLENGES lands in setup with a non-blank route/course preview; START CHALLENGE
//     solves and enters live; CHANGE CHALLENGE returns to setup;
//   · TRACK weather (dry < damp < wet lap time), wet tyres vs own slicks in the wet, and air
//     temperature (cooler brakes at 5 C than 35 C) move the lap honestly;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => { const t = document.getElementById('titleScreen'); if (t) t.hidden = true; });
await page.waitForTimeout(300);

const fails = [];

// 1. ECU visibility: shown on LIVE, hidden on every Drive sub-tab.
const ecuCheck = await page.evaluate(() => {
  const out = {};
  for (const m of ['engine', 'track', 'race', 'champ', 'challenges']) {
    setTab(m);
    const el = document.getElementById('ecuComputer'), btn = document.getElementById('btnEcu');
    out[m] = { ecuHidden: el.hidden, btnHidden: btn.hidden };
  }
  return out;
});
console.log('ecuCheck', ecuCheck);
if (ecuCheck.engine.ecuHidden) fails.push('ECU should be visible on LIVE');
for (const m of ['track', 'race', 'champ', 'challenges']) {
  if (!ecuCheck[m].ecuHidden || !ecuCheck[m].btnHidden) fails.push(`ECU not hidden on Drive tab "${m}"`);
}

// Helper to count non-background pixels on the main canvas.
const canvasInk = () => page.evaluate(() => {
  const g = canvas.getContext('2d'), d = g.getImageData(0, 32, canvas.width, Math.max(1, canvas.height - 80)).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 64) if (d[i] > 28 || d[i + 1] > 28 || d[i + 2] > 42) ink++;
  return ink;
});

// 2. TRACK landing page + conditions.
await page.evaluate(() => { lapResult = null; setTab('track'); });
await page.waitForTimeout(250);
const trkLand = await page.evaluate(() => ({
  phase: trackUI.phase,
  setupHidden: document.getElementById('trackSetup').hidden,
  liveHidden: document.getElementById('trackLive').hidden,
  solved: !!lapResult,
  sound: soundSource() ? 'on' : 'none',
  head: document.getElementById('trkPreviewHead').textContent
}));
const trkPreviewInk = await canvasInk();
console.log('track landing', trkLand, 'ink', trkPreviewInk);
if (trkLand.phase !== 'setup' || trkLand.setupHidden || !trkLand.liveHidden) fails.push('TRACK did not open on setup landing page');
if (trkLand.solved) fails.push('TRACK solved a lap before START LAP was pressed');
if (trkLand.sound !== 'none') fails.push('TRACK played sound on landing page');
if (trkPreviewInk < 100) fails.push(`TRACK landing map preview looks blank (ink ${trkPreviewInk})`);

// Changing circuit on landing page updates preview without solving.
await page.evaluate(() => {
  const sel = document.getElementById('trkSel');
  sel.value = 'tech';
  sel.dispatchEvent(new Event('change'));
});
await page.waitForTimeout(150);
const trkChanged = await page.evaluate(() => ({
  phase: trackUI.phase, solved: !!lapResult, key: trackKey,
  head: document.getElementById('trkPreviewHead').textContent
}));
if (trkChanged.phase !== 'setup' || trkChanged.solved || trkChanged.key !== 'tech') {
  fails.push('Changing circuit on TRACK landing solved prematurely or did not update trackKey');
}

// Start lap, check live, then return to setup.
await page.evaluate(() => document.getElementById('btnTrackStart').click());
await page.waitForTimeout(250);
const trkLive = await page.evaluate(() => ({
  phase: trackUI.phase,
  setupHidden: document.getElementById('trackSetup').hidden,
  liveHidden: document.getElementById('trackLive').hidden,
  lap: lapResult ? lapResult.lap : 0
}));
console.log('track live', trkLive);
if (trkLive.phase !== 'live' || !trkLive.setupHidden || trkLive.liveHidden || !(trkLive.lap > 10)) {
  fails.push('START LAP did not enter live track view with a valid lap');
}

await page.evaluate(() => document.getElementById('btnTrackSetup').click());
const trkBack = await page.evaluate(() => trackUI.phase);
if (trkBack !== 'setup') fails.push('CHANGE TRACK did not return to setup');

// 3. Track conditions physics: dry < damp < wet, wet tyres help slick car in wet, 5 C cooler brakes than 35 C.
const conds = await page.evaluate(() => {
  const run = (weather, air, tyre) => {
    trackUI.weather = weather; trackUI.air = air; trackUI.tyre = tyre;
    refreshLap();
    return { lap: lapResult.lap, brakeMaxF: lapResult.brakeMaxF, grip: lapResult.cond.grip };
  };
  trackKey = 'mixed';
  const dry = run('dry', 22, 'own');
  const damp = run('damp', 22, 'own');
  const wet = run('wet', 22, 'own');
  const cold = run('dry', 5, 'own');
  const hot = run('dry', 35, 'own');
  // Test slicks vs full wet tyres in wet conditions on a fast car/circuit (past hydroplaning speed)
  const gt = FACTORY_CARS.findIndex(p => /GT3|Huracan|488|Z06/i.test(p.name));
  if (gt >= 0) loadFactoryCarUI(gt);
  trackKey = 'monza';
  document.getElementById('vhTire').value = 'slick';
  buildVehicle();
  const wetSlick = run('wet', 22, 'own');
  const wetFull = run('wet', 22, 'wet');
  trackKey = 'mixed';
  trackUI.weather = 'dry'; trackUI.air = 22; trackUI.tyre = 'own';
  return { dry, damp, wet, cold, hot, wetSlick, wetFull };
});
console.log('track conditions', conds);
if (!(conds.damp.lap > conds.dry.lap + 1)) fails.push(`damp lap (${conds.damp.lap.toFixed(2)}) not slower than dry (${conds.dry.lap.toFixed(2)})`);
if (!(conds.wet.lap > conds.damp.lap + 1)) fails.push(`wet lap (${conds.wet.lap.toFixed(2)}) not slower than damp (${conds.damp.lap.toFixed(2)})`);
if (!(conds.wetFull.lap < conds.wetSlick.lap - 2)) fails.push(`full wet tyres (${conds.wetFull.lap.toFixed(2)}) not faster than slicks (${conds.wetSlick.lap.toFixed(2)}) in the wet`);
if (!(conds.cold.brakeMaxF < conds.hot.brakeMaxF - 10)) fails.push(`5 C brakes (${conds.cold.brakeMaxF.toFixed(1)}) not cooler than 35 C (${conds.hot.brakeMaxF.toFixed(1)})`);

// 4. RACE landing page map preview.
await page.evaluate(() => setTab('race'));
await page.waitForTimeout(250);
const raceInk = await canvasInk();
console.log('race landing ink', raceInk);
if (raceInk < 100) fails.push(`RACE landing map preview looks blank (ink ${raceInk})`);

// 5. CHAMP landing page map preview.
await page.evaluate(() => setTab('champ'));
await page.waitForTimeout(250);
const champInk = await canvasInk();
console.log('champ landing ink', champInk);
if (champInk < 100) fails.push(`CHAMP landing map preview looks blank (ink ${champInk})`);

// 6. CHALLENGES landing page (route + closed course) + START CHALLENGE + CHANGE CHALLENGE.
await page.evaluate(() => { chalResult = null; setTab('challenges'); });
await page.waitForTimeout(250);
const chalLand = await page.evaluate(() => ({
  phase: chalUI.phase,
  solved: !!chalResult,
  backHidden: document.getElementById('btnChalBack').hidden
}));
const chalRouteInk = await canvasInk();
await page.evaluate(() => {
  const s = document.getElementById('chalSel');
  s.value = 'moose';
  s.dispatchEvent(new Event('change'));
});
await page.waitForTimeout(200);
const chalMooseInk = await canvasInk();
const chalStillSetup = await page.evaluate(() => chalUI.phase === 'setup' && !chalResult);
console.log('challenges landing', chalLand, 'routeInk', chalRouteInk, 'mooseInk', chalMooseInk, 'stillSetup', chalStillSetup);
if (chalLand.phase !== 'setup' || chalLand.solved || !chalLand.backHidden) fails.push('CHALLENGES did not open on setup landing page');
if (chalRouteInk < 30) fails.push(`CHALLENGES route preview looks blank (ink ${chalRouteInk})`);
if (chalMooseInk < 30) fails.push(`CHALLENGES moose preview looks blank (ink ${chalMooseInk})`);
if (!chalStillSetup) fails.push('Changing challenge on landing solved prematurely');

await page.evaluate(() => document.getElementById('btnChalSolve').click());
await page.waitForTimeout(250);
const chalLive = await page.evaluate(() => ({
  phase: chalUI.phase,
  ok: !!(chalResult && chalResult.ok),
  backHidden: document.getElementById('btnChalBack').hidden
}));
console.log('challenges live', chalLive);
if (chalLive.phase !== 'live' || !chalLive.ok || chalLive.backHidden) fails.push('START CHALLENGE did not enter live state');

await page.evaluate(() => document.getElementById('btnChalBack').click());
const chalBack = await page.evaluate(() => chalUI.phase);
if (chalBack !== 'setup') fails.push('CHANGE CHALLENGE did not return to setup');

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
