// The closed fuel loop, the catalyst's oxygen storage and the Bosch sensors on the live bench.
//
// WHY THIS EXISTS. A real ECU never holds lambda still: it reads its sensor late and corrects. What must hold:
//   · narrowband (port injection), warm, part load: lambda swings about 1 by 0.5-4%, at 1-4 Hz, and the sensor's
//     voltage the ECU reads spans past 300 and 600 mV (the LSF 4.2's switching thresholds);
//   · with the catalyst's oxygen storage, that swing costs under 25% more tailpipe CO than a steady lambda 1;
//   · wideband (direct injection): no swing, lambda within 0.5% of the map's target, and no loop before 11.25 s;
//   · the loop is the live bench's alone: calcAtRpm gives the same torque with it running; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const base = FACTORY_ENGINES.find(p => /4A-GE/.test(p.name));
  const load = over => applyBuild({ engine: Object.assign({}, base.engine, over), tune: Object.assign({}, STD_TUNE),
    vehicle: Object.assign({}, DEFAULT_VEHICLE), name: 'loop' });
  const run = (on, afr) => {
    obdReset(); o2Loop = { live: false, on, trim: 0, t: 0, hist: [], seen: 1, side: 0 };
    if (afr) { engine.afrMode = 'fixed'; state.afr = afr; }
    state.throttle = 0.3; state.load = 0.8; state.coolant = 90;
    const rec = [], dt = 1 / 60;
    let readyAt = null;
    for (let i = 0; i < 60 * 25; i++) {
      stepEngine(dt); o2LoopStep(dt); o2Loop.live = true; try { updatePhysics(); } finally { o2Loop.live = false; }
      obdStep(dt); state.coolant = 90;
      if (readyAt == null && o2LoopActive()) readyAt = obd.runS;
      if (i >= 60 * 15) rec.push({ lam: state.afr / engine.stoichAFR, mv: o2SensorMv(state.afr / engine.stoichAFR), co: state.emCO });
    }
    const L = rec.map(x => x.lam), M = rec.map(x => x.mv);
    let flips = 0; for (let i = 1; i < rec.length; i++) if ((M[i] > 450) !== (M[i - 1] > 450)) flips++;
    return { lo: Math.min(...L), hi: Math.max(...L), mean: L.reduce((a, b) => a + b) / L.length, mvLo: Math.min(...M), mvHi: Math.max(...M),
      hz: flips / 2 / 10, co: rec.reduce((a, x) => a + x.co, 0) / rec.length, readyAt, target: mappedAFR(state.rpm, state.map) / engine.stoichAFR,
      tq: calcAtRpm(3000, 0.5).torque };
  };
  load({ cat: 'stock', intakeSys: 'efi', injector: 'port', afrMode: 'auto' });
  const tq0 = calcAtRpm(3000, 0.5).torque;
  const n = run(true), steady = run(false, engine.stoichAFR);
  load({ cat: 'stock', intakeSys: 'efi', injector: 'direct', afrMode: 'auto' });
  const w = run(true);
  return { n, steady, w, tq0 };
});
const f = (x, d = 3) => (+x).toFixed(d);
console.log(`== narrowband: lambda ${f(r.n.lo)}-${f(r.n.hi)} (mean ${f(r.n.mean, 4)}), ${f(r.n.mvLo, 0)}-${f(r.n.mvHi, 0)} mV, ${f(r.n.hz, 2)} Hz ==`);
console.log(`== tailpipe CO: swinging ${f(r.n.co * 1e6, 1)} mg/s, steady lambda 1 ${f(r.steady.co * 1e6, 1)} mg/s ==`);
console.log(`== wideband: lambda ${f(r.w.lo)}-${f(r.w.hi)} for a target of ${f(r.w.target)}, loop closed at ${f(r.w.readyAt, 2)} s ==`);
const sw = (r.n.hi - r.n.lo) / 2;
if (!(sw > 0.005 && sw < 0.04 && Math.abs(r.n.mean - 1) < 0.01)) fails.push('the narrowband loop does not swing about lambda 1 by 0.5-4%');
if (!(r.n.hz > 1 && r.n.hz < 4)) fails.push('the narrowband loop does not switch at 1-4 Hz');
if (!(r.n.mvLo < 300 && r.n.mvHi > 600)) fails.push('the narrowband voltage does not cross the LSF 4.2 thresholds');
if (!(r.n.co < r.steady.co * 1.25)) fails.push('the oxygen store does not hold the swing\'s CO near a steady lambda 1');
if (!(r.w.hi - r.w.lo < 0.002 && Math.abs(r.w.mean / r.w.target - 1) < 0.005)) fails.push('the wideband loop swings or misses its target');
if (!(r.w.readyAt >= 11.25 && r.w.readyAt < 12)) fails.push('the wideband loop closes before its heater is ready, or long after');
if (r.n.tq !== r.tq0) fails.push('the loop reaches the steady models: calcAtRpm moved after the live run');
if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.log('FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
