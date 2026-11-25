// WHY THIS EXISTS (build 461): the shared ISA ambient (ENV, build 456) gets a control, and the live engine breathes it.
// What must hold:
//   · at sea level pAmbAtm() is exactly 1, so mapTarget/steadyMapAt are unchanged;
//   · the TRACK tab's #trkAlt sets ENV.alt_m;
//   · at 2250 m an NA engine's wide-open steady manifold pressure falls to the ISA ratio (0.7605 atm), and the live
//     mapTarget follows it; a turbo's adds its boost on top;
//   · the NA car's lap is slower at 2250 m than at sea level;
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
  const car = q => { const fc = FACTORY_CARS.find(c => c.name.includes(q)); loadVehiclePreset(fc); return fc.name; };
  out.na = car('MX-5');
  out.p0 = pAmbAtm();
  const rpm = Math.round(engine.redline * 0.8);
  out.map0 = steadyMapAt(rpm, 1);
  const lap0 = simulateLap('mixed');
  setTab('track');
  const sel = document.getElementById('trkAlt');
  out.hasSel = !!sel;
  if (sel) { sel.value = '2250'; sel.dispatchEvent(new Event('change')); }
  out.alt = ENV.alt_m;
  out.p1 = pAmbAtm();
  out.map1 = steadyMapAt(rpm, 1);
  const thr = state.throttle, rr = state.rpm; state.throttle = 1; state.rpm = rpm;
  out.live1 = mapTarget(); state.throttle = thr; state.rpm = rr;
  const lap1 = simulateLap('mixed');
  out.t0 = lap0 && lap0.lap; out.t1 = lap1 && lap1.lap;
  const tc = FACTORY_CARS.find(c => { try { loadVehiclePreset(c); return engine.intake === 'turbo' && !engine.ci; } catch (_) { return false; } });
  out.turbo = tc && tc.name;
  const rT = Math.round(engine.redline * 0.8);
  out.boost = boostAvail(rT); out.mapT = steadyMapAt(rT, 1);
  ENV.alt_m = 0;
  return out;
});

const near = (a, b, tol) => Math.abs(a - b) <= tol;
if (r.p0 !== 1) fails.push(`pAmbAtm at sea level ${r.p0}, not exactly 1`);
if (!r.hasSel) fails.push('#trkAlt missing');
if (r.alt !== 2250) fails.push(`ENV.alt_m ${r.alt} after choosing 2250`);
if (!near(r.p1, 0.7605, 0.001)) fails.push(`pAmbAtm(2250) ${r.p1}, ISA gives 0.7605`);
if (!near(r.map1 / r.map0, r.p1, 0.002)) fails.push(`NA WOT map ratio ${(r.map1 / r.map0).toFixed(4)} vs ${r.p1}`);
if (!(r.live1 <= r.p1 + 1e-9 && r.live1 > 0.8 * r.p1)) fails.push(`live WOT mapTarget ${r.live1} not just under ambient ${r.p1}`);
if (!(r.t1 > r.t0)) fails.push(`NA lap ${r.t0} → ${r.t1} s: not slower at altitude`);
if (!near(r.mapT, r.p1 + r.boost, 1e-9)) fails.push(`turbo WOT map ${r.mapT} ≠ ambient ${r.p1} + boost ${r.boost}`);
fails.push(...errors);

console.log(`${r.na}: ambient ${r.p0} → ${r.p1?.toFixed(4)} atm at ${r.alt} m; WOT map ${r.map0?.toFixed(3)} → ${r.map1?.toFixed(3)}; live ${r.live1?.toFixed(3)}; lap ${r.t0?.toFixed(2)} → ${r.t1?.toFixed(2)} s`);
console.log(`${r.turbo}: boost ${r.boost?.toFixed(3)} bar, WOT map at 2250 m ${r.mapT?.toFixed(3)}`);
await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
