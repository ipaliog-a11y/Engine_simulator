// Challenges: moose avoidance ISO 3888-2 (build 345).
//
// WHY THIS EXISTS. The CHALLENGES tab gains a moose kind: max clear entry speed
// on the ISO 3888-2 double lane change, with a frontal replay of the solved run.
// What must hold:
//   · RUN_CHALLENGES includes kind moose;
//   · MX-5 solve returns ok with entry speed 55–90 km/h and samples;
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
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  const M = simulateMooseChallenge();
  let maxRoll = 0, loadSplit = false;
  if (M && M.samples) {
    for (const s of M.samples) {
      maxRoll = Math.max(maxRoll, Math.abs(s.roll || 0));
      const Fz = s.Fz || [];
      if (Fz.length >= 2 && Math.abs(Fz[0] - Fz[1]) > 200) loadSplit = true;
    }
  }
  activeRunChallenge = 'moose';
  setTab('challenges');
  refreshChallenge();
  const head = (document.getElementById('chalHead') || {}).textContent || '';
  const paceField = document.getElementById('chalPace');
  const paceHidden = paceField && paceField.closest('.field') && paceField.closest('.field').style.display === 'none';
  return {
    has,
    ok: !!(M && M.ok),
    speed: M && M.speedKmh,
    ay: M && M.peakAy,
    beta: M && M.peakBeta,
    nSamples: M && M.samples ? M.samples.length : 0,
    maxRoll,
    loadSplit,
    head,
    paceHidden,
    kind: chalResult && chalResult.kind
  };
});

console.log(JSON.stringify(r, null, 2));
if (!r.has) fails.push('moose not in RUN_CHALLENGES');
if (!r.ok) fails.push('MX-5 moose solve failed');
else {
  if (!(r.speed >= 55 && r.speed <= 90)) fails.push('MX-5 speed ' + r.speed + ' km/h out of 55–90');
  if (!(r.nSamples > 10)) fails.push('no replay samples: ' + r.nSamples);
  if (!(r.maxRoll > 0.01 || r.loadSplit)) fails.push('samples show no roll or load transfer');
  if (!(r.ay > 0.3)) fails.push('peak ay too low: ' + r.ay);
}
if (!/km\/h|Moose|CLEAR/i.test(r.head)) fails.push('chalHead odd: ' + r.head);
if (r.kind !== 'moose') fails.push('chalResult kind not moose');
if (!r.paceHidden) fails.push('pace control should hide on moose');

console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
