// A power-split's engine is heard where the lap's fuel runs it (build 297, plans/hybrid-electric/gas-sound-hybrid.md, A).
//
// WHY THIS EXISTS. Until build 293 the lap replay played a power-split's engine on its full-load line whenever the
// throttle was open and at idle off it, while the lap's fuel had it on its best line at the power it gave, and stopped
// off the power. What must hold, on the Prius's lap:
//   · where the fuel burns nothing, trackSoundState says the engine is off, and the engine's sound is muted there;
//   · where it burns, the sound's engine speed is psOolAt's for the same power, and its manifold moves with the load
//     (it was 1 bar flat);
//   · the lap's fuel is what it was (psFuelRate now reads the same psEnginePower).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  loadVehiclePreset(HYB_VEHICLE_PRESETS.find(x => /Prius/.test(x.name)));
  setTab('track'); refreshLap();
  const L = lapResult, R = L.replay, n = R.tAt.length, c = hybCurves(), fuel = psFuelRate()(L);
  // the fuel as build 293 worked it out, inline
  const R0 = c.eng, etaAt = rpm => { if (rpm <= R0[0].rpm) return c.eta[0]; for (let i = 1; i < R0.length; i++) if (rpm <= R0[i].rpm) return c.eta[i - 1] + (c.eta[i] - c.eta[i - 1]) * (rpm - R0[i - 1].rpm) / (R0[i].rpm - R0[i - 1].rpm); return c.eta[c.eta.length - 1]; };
  const o = { n, off: 0, on: 0, offBad: 0, onBad: 0, rpmErr: 0, fuelErr: 0, mapLo: 9, mapHi: 0 };
  for (let i = 0; i < n; i++) {
    const Ps = R.pwr[i] - Math.max(0, L.hy.pm[i]), old = Math.fround(Ps > 0 ? psOolAt(Ps / etaAt(R.rpm[i])).gs : 0);
    o.fuelErr = Math.max(o.fuelErr, Math.abs(fuel[i] - old));
    const s = trackSoundState(replayAt(L, R.tAt[i] + 1e-6)), Pe = psEnginePower(L, i, c);
    if (fuel[i] > 0) {
      o.on++; if (s.off) o.onBad++;
      else { o.rpmErr = Math.max(o.rpmErr, Math.abs(s.rpm - psOolAt(Pe).ne)); o.mapLo = Math.min(o.mapLo, s.map); o.mapHi = Math.max(o.mapHi, s.map); }
    } else { o.off++; if (!s.off) o.offBad++; }
  }
  // the sound muted at an engine-off point
  lapReplay.playing = true; lapReplay.speed = 0; let k = 0; while (k < n && fuel[k] > 0) k++;
  o.offAt = k; o.onAt = fuel.findIndex(x => x > 0); lapReplay.t = k < n ? R.tAt[k] + 1e-6 : 0; o.srcOff = !!(soundSource() && soundSource().off);
  return o;
});
// the live level held at a point (the replay rewinds on its own, so the point is held every 10 ms)
const levelAt = k => page.evaluate(async k => {
  setSound(true);
  for (let w = 0; w < 60 && !Sound.node; w++) await new Promise(r => setTimeout(r, 50));
  const R = lapResult.replay, hold = setInterval(() => { lapReplay.playing = true; lapReplay.speed = 0; lapReplay.t = R.tAt[k] + 1e-6; }, 10);
  await new Promise(r => setTimeout(r, 700));
  const v = Sound.node ? Sound.node.parameters.get('level').value : -1; clearInterval(hold); return v;
}, k);
const muted = await levelAt(r.offAt), heard = await levelAt(r.onAt);

const f = (x, d = 3) => Number(x).toFixed(d);
console.log(`== Prius lap: ${r.n} points, engine on at ${r.on}, off at ${r.off}; manifold ${f(r.mapLo, 2)}-${f(r.mapHi, 2)} bar; ` +
  `rpm off the best line by ${f(r.rpmErr, 1)}; fuel moved by ${r.fuelErr} g/s; level ${f(heard, 3)} running, ${f(muted, 4)} stopped ==`);
if (r.on < 10 || r.off < 10) fails.push(`the lap does not both run and stop the engine (${r.on} on, ${r.off} off)`);
if (r.onBad) fails.push(`${r.onBad} points burn fuel with the sound's engine off`);
if (r.offBad) fails.push(`${r.offBad} points burn no fuel with the sound's engine running`);
if (r.rpmErr > 1) fails.push(`the sound's engine is ${f(r.rpmErr, 1)} rpm off the best line`);
if (!(r.mapHi - r.mapLo > 0.2)) fails.push(`the manifold does not move with the load (${f(r.mapLo, 2)}-${f(r.mapHi, 2)})`);
if (r.fuelErr !== 0) fails.push(`the lap's fuel moved (${r.fuelErr} g/s)`);
if (!r.srcOff) fails.push('soundSource() does not say the engine is off where the fuel stops it');
if (!(heard > 0.1)) fails.push(`the running engine is not heard (level ${heard})`);
if (!(muted < 0.01)) fails.push(`the engine is heard where it is stopped (level ${muted})`);

await browser.close();
if (errors.length) { console.log(errors.join('\n')); fails.push(errors.length + ' page errors'); }
if (fails.length) { console.log('\nFAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nOK: the Prius\'s engine is heard where, and as, the lap\'s fuel runs it.');
