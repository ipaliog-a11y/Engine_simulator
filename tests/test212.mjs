// Challenges: moose avoidance ISO 3888-2 (build 345; EV coast build).
//
// WHY THIS EXISTS. The CHALLENGES tab gains a moose kind: max clear entry speed
// on the ISO 3888-2 double lane change, with a frontal replay of the solved run.
// What must hold:
//   · RUN_CHALLENGES includes kind moose;
//   · MX-5 solve returns ok with entry speed 55–90 km/h and samples past the exit;
//   · Model Y (EV) also clears past the exit — throttle=0 must not full-regen stop it;
//   · peak |roll| or load split appears in samples;
//   · selecting moose fills chalHead with km/h and no page error.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const fails = [];

const r = await page.evaluate(() => {
  const has = RUN_CHALLENGES.some(c => c.kind === 'moose' && c.id === 'moose');
  const run = name => {
    loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes(name)));
    const M = simulateMooseChallenge();
    const S = M && M.samples || [];
    let maxRoll = 0, loadSplit = false, maxX = -1e9;
    for (const s of S) {
      maxRoll = Math.max(maxRoll, Math.abs(s.roll || 0));
      maxX = Math.max(maxX, s.x || 0);
      const Fz = s.Fz || [];
      if (Fz.length >= 2 && Math.abs(Fz[0] - Fz[1]) > 200) loadSplit = true;
    }
    return M && {
      ok: M.ok, speed: M.speedKmh, ay: M.peakAy, beta: M.peakBeta,
      nSamples: S.length, maxRoll, loadSplit, maxX, lastV: S.length ? S[S.length - 1].v * 3.6 : 0
    };
  };
  const mx5 = run('MX-5');
  const my = run('Model Y');
  activeRunChallenge = 'moose';
  setTab('challenges');
  refreshChallenge();
  const head = (document.getElementById('chalHead') || {}).textContent || '';
  const paceField = document.getElementById('chalPace');
  const paceHidden = paceField && paceField.closest('.field') && paceField.closest('.field').style.display === 'none';
  return {
    has, mx5, my, head, paceHidden,
    kind: chalResult && chalResult.kind
  };
});

console.log(JSON.stringify(r, null, 2));
if (!r.has) fails.push('moose not in RUN_CHALLENGES');
if (!r.mx5 || !r.mx5.ok) fails.push('MX-5 moose solve failed');
else {
  if (!(r.mx5.speed >= 55 && r.mx5.speed <= 90)) fails.push('MX-5 speed ' + r.mx5.speed + ' km/h out of 55–90');
  if (!(r.mx5.nSamples > 10)) fails.push('no replay samples: ' + r.mx5.nSamples);
  if (!(r.mx5.maxRoll > 0.01 || r.mx5.loadSplit)) fails.push('samples show no roll or load transfer');
  if (!(r.mx5.ay > 0.3)) fails.push('peak ay too low: ' + r.mx5.ay);
  if (!(r.mx5.maxX >= 61)) fails.push('MX-5 stopped before exit: x=' + r.mx5.maxX);
}
if (!r.my || !r.my.ok) fails.push('Model Y moose solve failed');
else {
  // floor 50 from build 353: ISO 3888-2's discrete cones checked against the body's outline took Model Y 55 -> 54 (the
  // known driver gap, CHANGELOG build 353)
  if (!(r.my.speed >= 50 && r.my.speed <= 95)) fails.push('Model Y speed ' + r.my.speed + ' km/h out of band');
  if (!(r.my.maxX >= 61)) fails.push('Model Y stopped before exit: x=' + r.my.maxX.toFixed(1) + ' (regen coast bug)');
  if (!(r.my.lastV > 20)) fails.push('Model Y exit speed too low: ' + r.my.lastV.toFixed(1) + ' km/h');
}
if (!/km\/h|Moose|CLEAR/i.test(r.head)) fails.push('chalHead odd: ' + r.head);
if (r.kind !== 'moose') fails.push('chalResult kind not moose');
if (!r.paceHidden) fails.push('pace control should hide on moose');

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
