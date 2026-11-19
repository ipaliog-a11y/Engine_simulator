// Tyre screech on the lap replay and the moose replay (build 370).
//
// WHY THIS EXISTS. Build 362 gave the S-route powerslide a tyre screech; this build adds it to the lap replay and
// the moose test through the same voice. What must hold:
//   · lap: the screech is on only where the lap solver's grip limit binds (corner, traction, a brake point at full
//     use of grip), never on a 'power' point, louder with speed;
//   · moose: the drift's test on stepCar's slip angles (past the rear peak), off at the replay's start;
//   · nothing sounds while SOUND is off; no page errors.
import { chromium } from './pw.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('MX-5')));
  setTab('track');
  const L = lapResult, n = L.lim.length, out = {};
  const sl = L.lim.map((_, i) => lapSlide(L, { i, v: L.v[i] * 3.6 }));
  out.lap = { n, on: sl.filter(v => v > 0).length, power: L.lim.filter((l, i) => l === 'power' && sl[i] > 0).length,
    corner: L.lim.filter((l, i) => l === 'corner' && sl[i] > 0).length, cornerN: L.lim.filter(l => l === 'corner').length };
  const iFast = L.lim.reduce((b, l, i) => l === 'corner' && L.v[i] > L.v[b] ? i : b, L.lim.indexOf('corner'));
  const iSlow = L.lim.reduce((b, l, i) => l === 'corner' && L.v[i] < L.v[b] ? i : b, L.lim.indexOf('corner'));
  out.lap.louder = sl[iFast] > sl[iSlow];
  lapReplay.playing = true; lapReplay.t = L.replay.tAt[iFast];
  Sound.on = false; out.offTrack = screechSlide();
  Sound.on = true; out.onTrack = screechSlide();
  setTab('challenges');
  const sel = document.getElementById('chalSel'); sel.value = 'moose'; sel.dispatchEvent(new Event('change'));
  const R = chalResult, pk = screechPeak(R.mu, R), ms = R.samples.map(q => driftSlide({ pkR: pk }, q));
  out.moose = { ok: R.ok, kind: R.kind, n: ms.length, on: ms.filter(v => v > 0).length, first: ms[0], src: screechSlide() >= 0 };
  Sound.on = false; out.offMoose = screechSlide();
  return out;
});
await browser.close();

console.log('lap', r.lap, 'track off/on', r.offTrack, r.onTrack);
console.log('moose', r.moose, 'off', r.offMoose);
if (r.lap.power) fails.push('screech on ' + r.lap.power + ' power points');
if (r.lap.corner !== r.lap.cornerN || !r.lap.cornerN) fails.push('screech missing on corner points');
if (!r.lap.louder) fails.push('screech not louder at the faster corner');
if (r.offTrack !== 0 || !(r.onTrack > 0)) fails.push('track screech not gated by SOUND');
if (!r.moose.ok || r.moose.kind !== 'moose') fails.push('moose run failed');
if (r.moose.first !== 0 || !(r.moose.on > 0) || r.moose.on >= r.moose.n) fails.push('moose screech not tied to the slide: ' + JSON.stringify(r.moose));
if (r.offMoose !== 0) fails.push('moose screech while SOUND off');
for (const e of errors) fails.push(e);
if (fails.length) { console.error('FAIL', fails); process.exit(1); }
console.log('PASS');
process.exit(0);
