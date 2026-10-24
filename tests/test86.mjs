// Turbo sounds by size, anti-lag bangs, and the supercharger whine reworked (build 160).
//
// WHY THIS EXISTS. Three complaints, each pinned here:
//   1. A Fiat 0.9 TwinAir's blow-off was as loud as a big turbo's. The whine and the blow-off now scale with
//      the compressor (its exducer: the air through it, and the valve sized to it), so a 40 mm wheel blows
//      off well under a 71 mm one, each against its own exhaust.
//   2. Anti-lag only crackled. On a lift it now bangs: big, deep pops from fuel burning on in the manifold,
//      in both sound models (the GAS model leaves the synth's exhaust muted, not its pops).
//   3. A supercharger sang three pure sines at a fixed level from idle and covered everything. Its whine is
//      now mostly narrow-band noise at the lobe pass, under the exhaust flat out, nearly gone off boost
//      (a positive-displacement blower's bypass is open), and rolled off where the intake soaks it up.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(async () => {
  const SR = 48000;
  const build = (name, o) => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === name).engine, o || {})); buildEngine(); };
  const settle = (rpm, thr) => { Object.assign(state, { rpm, throttle: thr, blown: false, fuelCut: false, coolant: 90, knockRisk: 0, load: 0 }); for (let i = 0; i < 200; i++) { stepEngine(0.01); updatePhysics(); state.rpm = rpm; } };
  // render the pulse worklet with the given parameters; with bov, the rms of the 100 ms after it fires
  const render = async (P, bov) => {
    const size = clamp(Math.sqrt((engine.dispCyl_L || 0.45) / 0.45), 0.6, 1.5), cfg = soundConfig(engine);
    const c = new OfflineAudioContext(2, SR * 1.2, SR); await loadSoundWorklet(c);
    const n = new AudioWorkletNode(c, 'engine-pulse', { outputChannelCount: [2] }); n.port.postMessage(cfg); n.connect(c.destination);
    const Q = Object.assign({ rpm: state.rpm, level: SOUND_LEVEL * size * SOUND_PULSE_GAIN, bright: 440 + state.rpm * 0.15 + engine.cylinders * 8, strength: 0, lope: 0, whineF: 0, whineA: 0, crackle: 0, bang: 0 }, P);
    for (const k in Q) n.parameters.get(k).value = Q[k];
    await new Promise(res => setTimeout(res, 30));
    if (bov) c.suspend(0.5).then(() => { n.port.postMessage({ bov: { amp: bov, tau: cfg.bovTau } }); c.resume(); });
    const x = (await c.startRendering()).getChannelData(0);
    const rms = (a, b) => { let q = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) q += x[i] * x[i]; return Math.sqrt(q / ((b - a) * SR)); };
    return bov ? rms(0.5, 0.6) : rms(0.4, 1.2);
  };
  const db = (a, b) => 20 * Math.log10(a / b);
  const out = {};
  // ---- 1. blow-off by turbo size, each against its own exhaust ----
  for (const name of ['Fiat 0.9 TwinAir turbo', '2.0 Turbo Hot-Hatch I4']) {
    build(name); settle(0.8 * engine.redline, 1);
    const d = soundDrive(0.01, state), ex = await render({ strength: exhaustStrength(engine, state, d.strength) });
    const amp = 0.25 * Math.min(1.5, state.boostActual) * turboSoundScale(engine);
    // and through soundDrive itself: open the throttle on boost, then shut it
    Sound.chargeP = 0; soundDrive(0.01, Object.assign({}, state, { throttle: 1 })); const lift = soundDrive(0.01, Object.assign({}, state, { throttle: 0 }));
    out[name] = { exd: engine.compExd, scale: turboSoundScale(engine), bov: db(await render({}, amp), ex), liftAmp: lift.bov ? lift.bov.amp : 0, boost: state.boostActual };
  }
  // ---- 2. anti-lag ----
  build('2.0 Turbo Hot-Hatch I4', { antilag: true }); settle(5000, 0);
  const ov = Object.assign({}, state, { rpm: 5000, throttle: 0, fuelCut: true, map: 0.2 }), da = soundDrive(0.01, ov);
  build('2.0 Turbo Hot-Hatch I4'); const dn = soundDrive(0.01, ov);
  build('2.0 Turbo Hot-Hatch I4', { antilag: true });
  const plain = await render({ rpm: 5000, strength: exhaustStrength(engine, ov, da.strength) });
  const banging = await render({ rpm: 5000, strength: exhaustStrength(engine, ov, da.strength), crackle: da.crackle, bang: da.bang });
  const gasPlain = await render({ rpm: 5000 }), gasBang = await render({ rpm: 5000, crackle: da.crackle, bang: da.bang });   // GAS: synth exhaust muted
  out.als = { bang: da.bang, bangOff: dn.bang, over: db(banging, plain), gasOver: db(gasBang, Math.max(1e-9, gasPlain)), gasBang };
  // ---- 3. superchargers ----
  out.sc = {};
  for (const sc of ['roots', 'screw', 'centrifugal']) {
    build('6.2 Supercharged V8', { scType: sc });
    settle(0.8 * engine.redline, 1); const d = soundDrive(0.01, state);
    const ex = await render({ strength: exhaustStrength(engine, state, d.strength) }), wh = await render({ whineF: d.whineF, whineA: d.whineA });
    const onBoost = d.whineA, offBoost = soundDrive(0.01, Object.assign({}, state, { boostActual: 0, rpm: 2500 })).whineA;
    const redF = soundDrive(0.01, Object.assign({}, state, { rpm: engine.redline })).whineF;
    out.sc[sc] = { whine: db(wh, ex), f: d.whineF, redF, offOn: db(offBoost, onBoost) };
  }
  return out;
});

const f = (v, d = 0) => v.toFixed(d);
for (const n of ['Fiat 0.9 TwinAir turbo', '2.0 Turbo Hot-Hatch I4']) { const x = r[n]; console.log(`== ${n}: ${f(x.exd * 1000)} mm compressor, scale ${f(x.scale, 2)} · blow-off ${f(x.bov)} dB against its exhaust · lift amp ${f(x.liftAmp, 3)} at ${f(x.boost, 2)} bar ==`); }
console.log(`== anti-lag: bang ${r.als.bang} (without ALS ${r.als.bangOff}) · overrun ${f(r.als.over)} dB louder with it · in GAS mode (exhaust muted) bangs at rms ${f(r.als.gasBang, 3)} ==`);
for (const [k, x] of Object.entries(r.sc)) console.log(`== ${k}: whine ${f(x.f)} Hz (${f(x.redF)} at the redline), ${f(x.whine)} dB against the exhaust flat out · off boost ${f(x.offOn)} dB ==`);

const fiat = r['Fiat 0.9 TwinAir turbo'], hh = r['2.0 Turbo Hot-Hatch I4'];
if (!(fiat.scale < 0.7 * hh.scale)) fails.push('a 40 mm turbo is not scaled under a 71 mm one');
if (!(fiat.bov < hh.bov - 4)) fails.push(`the small turbo's blow-off is not quieter against its engine (${f(fiat.bov)} vs ${f(hh.bov)} dB)`);
if (!(fiat.liftAmp > 0 && hh.liftAmp > 0 && fiat.liftAmp / fiat.boost < 0.7 * hh.liftAmp / hh.boost)) fails.push('soundDrive does not blow off smaller for a smaller turbo');
if (!(r.als.bang > 0.1 && r.als.bangOff === 0)) fails.push('anti-lag does not bang on a lift, or bangs without anti-lag');
if (!(r.als.over > 8)) fails.push(`anti-lag bangs are not heard over the overrun (${f(r.als.over)} dB)`);
if (!(r.als.gasBang > 0.005)) fails.push('anti-lag bangs are not heard in GAS mode');
for (const [k, x] of Object.entries(r.sc)) {
  if (!(x.whine < -12 && x.whine > -32)) fails.push(`${k}: the whine is ${f(x.whine)} dB against the exhaust (wants -12 to -32: under it, still there)`);
  if (k !== 'centrifugal' && !(x.offOn < -15)) fails.push(`${k}: the whine does not drop away off boost (${f(x.offOn)} dB)`);
  if (k !== 'centrifugal' && !(x.redF < 3000)) fails.push(`${k}: the whine is ${f(x.redF)} Hz at the redline`);
}

await browser.close();
for (const x of fails) console.log('FAIL ' + x);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test86: ${fails.length} failure(s), ${errors.length} error(s)` : 'test86: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
