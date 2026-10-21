// Engine sound from firing pulses (build 121).
//
// WHY THIS EXISTS. The engine note used to be one sawtooth at the firing frequency, so any two engines
// with the same firing rate sounded identical. It is now a train of pulses, one per cylinder at its
// slot in the firing order, each sent down its own bank's exhaust. These checks render the worklet
// offline (no speakers, no user gesture) and pin what that buys:
//   1. every preset renders finite, audible, unclipped sound;
//   2. the pulse rate is the firing rate (a 2-stroke fires twice as often as a 4-stroke);
//   3. a cross-plane V8 fires each bank unevenly, so its exhaust repeats only once per engine cycle,
//      while an inline six, an even-fire V6 and a V12 repeat every firing interval of their bank;
//   4. a V or a boxer comes out of two pipes (left / right), an inline engine out of one;
//   5. SOUND ON in the live page starts the worklet without an error.
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

const res = await page.evaluate(async () => {
  const SR = 48000;
  const build = name => {
    const p = PRESETS.find(x => x.name === name);
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, p.engine)); buildEngine();
    return soundConfig(engine);
  };
  // Render `secs` of the worklet at a fixed rpm with no lope, return both channels after `skip` s.
  const render = async (cfg, rpm, secs = 1.5, skip = 0.5) => {
    const ctx = new OfflineAudioContext(2, SR * secs, SR);
    await loadSoundWorklet(ctx);
    const node = new AudioWorkletNode(ctx, 'engine-pulse', { outputChannelCount: [2] });
    node.port.postMessage(cfg);
    node.parameters.get('rpm').value = rpm; node.parameters.get('level').value = 1;
    node.parameters.get('bright').value = 440 + rpm * 0.15; node.parameters.get('lope').value = 0;
    node.connect(ctx.destination);
    await new Promise(r => setTimeout(r, 30));          // let the config message land before rendering
    const buf = await ctx.startRendering();
    const s = SR * skip;
    return [buf.getChannelData(0).slice(s), buf.getChannelData(1).slice(s)];
  };
  const rms = x => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  const power = (x, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); } return re * re + im * im; };
  // Share of a channel's energy (harmonics of the engine-cycle rate up to 2 kHz) that is NOT at a
  // harmonic of the bank's average pulse rate: zero for a bank fired evenly, large for an uneven one.
  const uneven = (x, cfg, rpm) => {
    const fc = rpm / 60 / cfg.cycleRevs, m = cfg.events.length / cfg.banks;
    let off = 0, all = 0;
    for (let h = 1; h * fc < 2000; h++) { const p = power(x, h * fc); all += p; if (h % m) off += p; }
    return off / all;
  };
  // Strongest autocorrelation lag between 2 and 25 ms, in ms.
  const period = x => {
    let best = 0, lag = 0;
    for (let k = SR * 0.002; k < SR * 0.025; k++) { let a = 0; for (let i = 0; i + k < x.length; i += 2) a += x[i] * x[i + k]; if (a > best) { best = a; lag = k; } }
    return lag / SR * 1000;
  };
  const out = {};
  const names = ['1.6 Sport NA I4', '3.0 Turbo I6 (2JZ)', '5.0 V8 NA Muscle', '6.5 V12 NA Supercar',
    '2.0 Turbo Diesel I4', '1.3 Rotary NA (Renesis)', '500cc 2-Stroke Twin'];
  for (const n of names) {
    const cfg = build(n), [L, R] = await render(cfg, 1800, 1.5, 0.5);   // 1800 rpm: 15 cycles in 1 s exactly
    let peak = 0, finite = true; for (const v of L) { if (!Number.isFinite(v)) finite = false; peak = Math.max(peak, Math.abs(v)); }
    const diff = rms(L.map((v, i) => v - R[i]));
    out[n] = { banks: cfg.banks, rmsL: rms(L), peak, finite, lrDiff: diff / (rms(L) || 1), uneven: uneven(L, cfg, 1800) };
  }
  // An even-fire V6 has no preset; build one from the muscle V8.
  { const cfg = build('5.0 V8 NA Muscle'); applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === '5.0 V8 NA Muscle').engine, { cylinders: 6 })); buildEngine();
    const c6 = soundConfig(engine), [L] = await render(c6, 1800); out['V6'] = { banks: c6.banks, uneven: uneven(L, c6, 1800) }; }
  // Pulse rate: an inline four at 3000 rpm fires every 10 ms, a 2-stroke twin at 3000 rpm every 10 ms
  // too (two cylinders, every rev), and the same twin as a 4-stroke would fire every 20 ms.
  { const [L] = await render(build('1.6 Sport NA I4'), 3000, 1.0, 0.3); out.periodI4 = period(L); }
  { const cfg = build('500cc 2-Stroke Twin'), [L] = await render(cfg, 3000, 1.0, 0.3); out.period2T = period(L);
    const [L4] = await render(Object.assign({}, cfg, { cycleRevs: 2 }), 3000, 1.0, 0.3); out.period2T4 = period(L4); }
  return out;
});

for (const [n, r] of Object.entries(res)) if (typeof r === 'object')
  console.log(`== ${n.padEnd(24)} banks ${r.banks} · uneven ${r.uneven.toFixed(3)}` +
    (r.rmsL !== undefined ? ` · rms ${r.rmsL.toFixed(3)} peak ${r.peak.toFixed(2)} · L/R diff ${r.lrDiff.toFixed(2)}` : '') + ' ==');
console.log(`== period: I4 @3000 ${res.periodI4.toFixed(2)} ms · 2-stroke twin ${res.period2T.toFixed(2)} ms · as a 4-stroke ${res.period2T4.toFixed(2)} ms ==`);

for (const [n, r] of Object.entries(res)) if (typeof r === 'object' && r.rmsL !== undefined) {
  if (!r.finite) fails.push(`${n}: non-finite samples`);
  if (!(r.rmsL > 0.03)) fails.push(`${n}: nearly silent (rms ${r.rmsL.toFixed(3)})`);
  if (!(r.peak < 1.5)) fails.push(`${n}: peak ${r.peak.toFixed(2)} at level 1`);
  if (r.banks === 2 && !(r.lrDiff > 0.3)) fails.push(`${n}: two banks but left and right are nearly the same`);
  if (r.banks === 1 && !(r.lrDiff < 1e-6)) fails.push(`${n}: one exhaust but left and right differ`);
}
if (!(res['5.0 V8 NA Muscle'].uneven > 0.1)) fails.push(`cross-plane V8 banks fire evenly (uneven ${res['5.0 V8 NA Muscle'].uneven.toFixed(3)})`);
for (const n of ['1.6 Sport NA I4', '3.0 Turbo I6 (2JZ)', '6.5 V12 NA Supercar', 'V6', '1.3 Rotary NA (Renesis)'])
  if (!(res[n].uneven < 0.02)) fails.push(`${n} should fire its bank evenly (uneven ${res[n].uneven.toFixed(3)})`);
if (Math.abs(res.periodI4 - 10) > 0.2) fails.push(`I4 at 3000 rpm repeats every ${res.periodI4.toFixed(2)} ms, not 10`);
if (Math.abs(res.period2T - 10) > 0.2) fails.push(`2-stroke twin at 3000 rpm repeats every ${res.period2T.toFixed(2)} ms, not 10`);
if (Math.abs(res.period2T4 - 20) > 0.4) fails.push(`4-stroke twin at 3000 rpm repeats every ${res.period2T4.toFixed(2)} ms, not 20`);

// ---- 5. the live toggle ----
await page.evaluate(() => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE)); buildEngine(); });
await page.click('#btnSound', { force: true }).catch(() => page.evaluate(() => setSound(true)));
await page.waitForTimeout(600);
const live = await page.evaluate(() => ({ on: Sound.on, node: !!Sound.node, key: Sound.cfgKey, fallback: !!Sound.osc }));
console.log(`== live: on ${live.on} · worklet ${live.node} · config ${live.key} · fallback ${live.fallback} ==`);
if (!live.on || !live.node) fails.push('SOUND ON did not start the pulse worklet');
if (live.node && !live.key) fails.push('the worklet never received the engine config');

await browser.close();
for (const f of fails) console.log('FAIL ' + f);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test65: ${fails.length} failure(s), ${errors.length} error(s)` : 'test65: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
