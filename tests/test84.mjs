// The GAS engine sound model: a gas simulation after engine-sim (build 156; two-strokes and rotaries, build 158).
//
// WHY THIS EXISTS. Build 156 adds a second engine sound, picked under ENGINE SOUND MODEL in OPTIONS: the
// cylinders, runners and collectors simulated as gas (ported from Ange Yaghi's engine-sim) and heard through
// a recorded exhaust. These checks pin that:
//   1. the gas model is a working engine: the 1.6 sport four makes a real engine's IMEP flat out, less at
//      part throttle, and nothing goes non-finite on any preset;
//   2. the option is there, defaults to SYNTH, is remembered across a reload, and every type can use it;
//   3. live on the dyno, GAS runs the gas node (once its chain is calibrated) and mutes the synth's exhaust,
//      for a four-stroke and for a rotary;
//   5. the two-stroke (piston ports, crankcase scavenged) and the rotary (three chambers a rotor) are
//      working engines too: plausible IMEP, less at part throttle, nothing non-finite;
//   6. a lift does not cut the sound out (build 158): on an injected engine the fuel cut left the pulse
//      strength at 0.014 and both models fell 31-35 dB within a few tenths of a second, though the
//      cylinders still pump air down the pipe. Rendered through the real chains, the overrun stays within
//      25 dB of the pull and fades as the revs fall.
//   4. through the real chain, flat out is louder than idle, and neither is silent or clipping.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// ---- 1. physics ----
const phys = await page.evaluate(() => {
  const lib = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', SOUND_GAS_SRC + ';return {GasEngine};')(class {}, () => {}, 48000);
  const build = n => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === n).engine)); buildEngine(); return gasConfig(engine); };
  const imep = (cfg, map) => {
    const sim = new lib.GasEngine(cfg, 10000, 4); let W = 0, pk = 0, Vp = sim.cyl[0].cy.V;
    for (let i = 0; i < 16000; i++) { sim.step(3000, map, 1, 0.9, 20, 60); const c = sim.cyl[0].cy; if (i >= 8000) { W += c.P() * (c.V - Vp); pk = Math.max(pk, c.P()); } Vp = c.V; }
    return { imep: W / (0.8 * 3000 / 120) / sim.Vd / 1e5, peak: pk / 1e5 };
  };
  const i4 = build('1.6 Sport NA I4'), wot = imep(i4, 101325), part = imep(i4, 40000);
  const finite = {};
  for (const n of ['3.0 Turbo I6 (2JZ)', '5.0 V8 NA Muscle', '6.5 V12 NA Supercar', '2.0 Turbo Diesel I4', '2.0 Turbo Hot-Hatch I4']) {
    const cfg = build(n), sim = new lib.GasEngine(cfg, 10000, 4); let ok = true;
    for (let i = 0; i < 4000; i++) { const o = sim.step(i < 2000 ? engine.idleRpmEff : 0.8 * engine.redline, i < 2000 ? 30000 : 101325, 1, 0.9, 20, 60); for (const v of o) if (!Number.isFinite(v)) ok = false; }
    finite[n] = ok;
  }
  return { wot, part, finite };
});
console.log(`== 1.6 sport four at 3000 rpm: IMEP ${phys.wot.imep.toFixed(1)} bar flat out (peak ${phys.wot.peak.toFixed(0)} bar), ${phys.part.imep.toFixed(1)} bar at 0.4 bar MAP · finite: ${Object.entries(phys.finite).map(([k, v]) => k.split(' ').slice(0, 2).join(' ') + ' ' + v).join(', ')} ==`);
if (!(phys.wot.imep > 11 && phys.wot.imep < 15.5)) fails.push(`flat-out IMEP ${phys.wot.imep.toFixed(1)} bar is not a real engine's (11-15.5)`);
if (!(phys.wot.peak > 50 && phys.wot.peak < 110)) fails.push(`peak cylinder pressure ${phys.wot.peak.toFixed(0)} bar is not a real engine's`);
if (!(phys.part.imep < 0.45 * phys.wot.imep && phys.part.imep > 0)) fails.push('part throttle does not make much less work than flat out');
for (const [n, ok] of Object.entries(phys.finite)) if (!ok) fails.push(`${n}: the gas model went non-finite`);

// ---- 2. the option ----
const opt = await page.evaluate(() => {
  const sel = document.getElementById('edSoundModel');
  const sup = n => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === n).engine)); buildEngine(); return gasSupported(engine); };
  const r = { exists: !!sel, def: Sound.model, selDef: sel && sel.value,
    i4: sup('1.6 Sport NA I4'), v8: sup('5.0 V8 NA Muscle'), diesel: sup('2.0 Turbo Diesel I4'), rotary: sup('1.3 Rotary NA (Renesis)'), twostroke: sup('500cc 2-Stroke Twin') };
  sel.value = 'gas'; sel.dispatchEvent(new Event('change'));
  r.after = Sound.model; let st = null; try { st = localStorage.getItem('pes.soundModel'); } catch (e) {} r.stored = st;
  return r;
});
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
const reloaded = await page.evaluate(() => ({ model: Sound.model, sel: document.getElementById('edSoundModel').value }));
console.log(`== option: default ${opt.def}/${opt.selDef} -> ${opt.after} (stored ${opt.stored}); after reload ${reloaded.model}/${reloaded.sel} · gas for I4 ${opt.i4}, V8 ${opt.v8}, diesel ${opt.diesel}, rotary ${opt.rotary}, 2-stroke ${opt.twostroke} ==`);
if (!opt.exists) fails.push('no ENGINE SOUND MODEL selector in OPTIONS');
if (opt.def !== 'synth' || opt.selDef !== 'synth') fails.push('the default is not SYNTH');
if (opt.after !== 'gas' || opt.stored !== 'gas') fails.push('picking GAS does not take or is not stored');
if (reloaded.model !== 'gas' || reloaded.sel !== 'gas') fails.push('GAS is not remembered across a reload');
if (!(opt.i4 && opt.v8 && opt.diesel && opt.rotary && opt.twostroke)) fails.push('some engine type cannot use GAS');

// ---- 3. live switch on the dyno ----
await page.evaluate(() => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE)); buildEngine(); setTab('dyno'); state.throttle = 1; });
await page.click('#btnSound', { force: true }).catch(() => page.evaluate(() => setSound(true)));
await page.waitForTimeout(2500);
const live = await page.evaluate(() => ({ gas: !!Sound.gas, calibrated: Sound.gasF, gasLevel: Sound.gas ? Sound.gas.parameters.get('level').value : -1,
  pulseStrength: Sound.node ? Sound.node.parameters.get('strength').value : -1 }));
await page.evaluate(() => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === '1.3 Rotary NA (Renesis)').engine)); buildEngine(); state.throttle = 1; });
await page.waitForTimeout(800);
await page.waitForTimeout(1700);   // a new build: its chain is calibrated again before it is heard
const rot = await page.evaluate(() => ({ gasLevel: Sound.gas.parameters.get('level').value, pulseStrength: Sound.node.parameters.get('strength').value }));
await page.evaluate(() => setSound(false));
console.log(`== live GAS: node ${live.gas}, calibrated ${live.calibrated.toFixed(3)}, gas level ${live.gasLevel.toExponential(2)}, synth exhaust strength ${live.pulseStrength.toFixed(3)} · rotary: gas level ${rot.gasLevel.toExponential(2)}, synth strength ${rot.pulseStrength.toFixed(2)} ==`);
if (!live.gas) fails.push('GAS live has no gas node');
if (!(live.calibrated > 0)) fails.push('the gas chain was never calibrated');
if (!(live.gasLevel > 0)) fails.push('GAS live is silent');
if (!(live.pulseStrength < 0.02)) fails.push("the synth's exhaust still plays under GAS");
if (!(rot.gasLevel > 0)) fails.push('a rotary is silent under GAS');
if (!(rot.pulseStrength < 0.02)) fails.push("a rotary under GAS still plays the synth's exhaust");

// ---- 4. through the real chain ----
const chain = await page.evaluate(async () => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE)); buildEngine();
  const SR = 48000, cfg = gasConfig(engine), ch = gasChainFor(engine), F = await calibrateGas(SR, cfg, ch), ref = gasReference(cfg);
  const size = clamp(Math.sqrt((engine.dispCyl_L || 0.45) / 0.45), 0.6, 1.5);
  const run = async (rpm, mapBar, strength) => {
    const c = new OfflineAudioContext(2, SR, SR); await loadSoundWorklet(c);
    const n = new AudioWorkletNode(c, 'engine-gas', { outputChannelCount: [2] }); n.port.postMessage(cfg);
    const conv = c.createConvolver(); conv.buffer = soundIRBuffer(c, ch.ir);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.frequency.value = ch.lpHz;
    const g = c.createGain(); g.gain.value = ch.gain; n.connect(conv); conv.connect(lp); lp.connect(g); g.connect(c.destination);
    const P = { rpm, map: mapBar * 101325, fuel: 1, lambda: 0.9, spark: 22, burn: 60, level: gasLevel(size, strength) / F, floor: GAS_FLOOR * ref };
    for (const k in P) n.parameters.get(k).value = P[k];
    await new Promise(r => setTimeout(r, 30));
    const x = (await c.startRendering()).getChannelData(0).slice(SR * 0.4);
    let q = 0, pk = 0, bad = false; for (const v of x) { q += v * v; pk = Math.max(pk, Math.abs(v)); if (!Number.isFinite(v)) bad = true; }
    return { rms: Math.sqrt(q / x.length), pk, bad };
  };
  return { F, wot: await run(4500, 1, 1), idle: await run(engine.idleRpmEff, 0.22, 0.22) };
});
console.log(`== chain: calibration ${chain.F.toFixed(3)} · flat out rms ${chain.wot.rms.toFixed(3)} peak ${chain.wot.pk.toFixed(2)} · idle rms ${chain.idle.rms.toFixed(3)} peak ${chain.idle.pk.toFixed(2)} ==`);
if (chain.wot.bad || chain.idle.bad) fails.push('the chain output went non-finite');
if (!(chain.idle.rms > 0.005)) fails.push('idle is silent through the chain');
if (!(chain.wot.rms > 1.5 * chain.idle.rms && chain.wot.rms < 20 * chain.idle.rms)) fails.push(`flat out is not sensibly louder than idle (${(chain.wot.rms / chain.idle.rms).toFixed(1)}x)`);
if (!(chain.wot.pk < 1.2)) fails.push(`flat out peaks at ${chain.wot.pk.toFixed(2)} before the limiter`);

// ---- 5. the two-stroke and the rotary ----
const kinds = await page.evaluate(() => {
  const lib = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', SOUND_GAS_SRC + ';return {makeGasEngine};')(class {}, () => {}, 48000);
  const out = {};
  for (const [name, rpm] of [['500cc 2-Stroke Twin', 6000], ['1.3 Rotary NA (Renesis)', 4000], ['1.3 Rotary Turbo (13B)', 5000]]) {
    applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === name).engine)); buildEngine();
    const cfg = gasConfig(engine), per = cfg.kind === 'rotary' ? 3 : 1, tm = gasTiming(engine, rpm / engine.redline);
    const run = map => { const sim = lib.makeGasEngine(cfg, 10000, 4), c0 = sim.cyl[0].cy; let W = 0, Vp = c0.V, bad = false;
      for (let i = 0; i < 16000; i++) { const o = sim.step(rpm, map, 1, 0.9, tm.spark, tm.burn); for (const v of o) if (!Number.isFinite(v)) bad = true; if (i >= 8000) W += c0.P() * (c0.V - Vp); Vp = c0.V; }
      return { imep: W / (0.8 * rpm / 60 / per) / sim.Vd / 1e5, bad, vd: sim.Vd }; };
    out[name] = { kind: cfg.kind, wot: run(101325), part: run(40000) };
  }
  return out;
});
for (const [n, k] of Object.entries(kinds)) console.log(`== ${n} (${k.kind}): IMEP ${k.wot.imep.toFixed(1)} bar flat out, ${k.part.imep.toFixed(1)} at 0.4 bar · chamber ${(k.wot.vd * 1e6).toFixed(0)} cc ==`);
const tw = kinds['500cc 2-Stroke Twin'], rn = kinds['1.3 Rotary NA (Renesis)'], rt = kinds['1.3 Rotary Turbo (13B)'];
if (tw.kind !== 'two' || rn.kind !== 'rotary') fails.push('the two-stroke or the rotary is not modelled as its own kind');
if (!(tw.wot.imep > 3 && tw.wot.imep < 10)) fails.push(`two-stroke IMEP ${tw.wot.imep.toFixed(1)} bar is not a two-stroke's`);
if (!(rn.wot.imep > 8 && rn.wot.imep < 14)) fails.push(`rotary IMEP ${rn.wot.imep.toFixed(1)} bar is not a rotary's`);
if (Math.abs(rn.wot.vd * 1e6 - 654) > 5) fails.push(`a 13B chamber is ${(rn.wot.vd * 1e6).toFixed(0)} cc, not 654`);
for (const k of [tw, rn, rt]) { if (k.wot.bad || k.part.bad) fails.push('a two-stroke or rotary went non-finite'); if (!(k.part.imep < 0.5 * k.wot.imep)) fails.push('part throttle does not make much less work on a two-stroke or rotary'); }

// ---- 6. the lift ----
const lift = await page.evaluate(async () => {
  applyEngineToForm(Object.assign({}, DEFAULT_ENGINE)); buildEngine();
  Object.assign(state, { rpm: engine.idleRpmEff, load: 0, throttle: 0, blown: false, engineHealth: 1 });
  // step the real sim: a pull to the limiter, then a lift; record what each model is driven with
  const tr = [];
  for (let f = 0; f < 650; f++) {
    const t = f / 100; state.throttle = t < 0.5 ? 0 : t < 3.5 ? 1 : 0;
    stepThermal(0.01); stepEngine(0.01); stepElectrical(0.01); updatePhysics(); state.blown = false;
    const d = soundDrive(0.01, state); tr.push({ t, rpm: state.rpm, map: state.map, cut: state.fuelCut, strength: d.strength, pulse: exhaustStrength(engine, state, d.strength) });
  }
  const at = t => tr[Math.round(t * 100)];
  const SR = 48000, size = clamp(Math.sqrt((engine.dispCyl_L || 0.45) / 0.45), 0.6, 1.5);
  const cfg = gasConfig(engine), ch = gasChainFor(engine), F = await calibrateGas(SR, cfg, ch), ref = gasReference(cfg);
  // render 0.6 s of each model at a recorded instant
  const synth = async s => {
    const c = new OfflineAudioContext(2, SR * 0.6, SR); await loadSoundWorklet(c);
    const n = new AudioWorkletNode(c, 'engine-pulse', { outputChannelCount: [2] }); n.port.postMessage(soundConfig(engine)); n.connect(c.destination);
    const P = { rpm: s.rpm, level: SOUND_LEVEL * size * SOUND_PULSE_GAIN, bright: 440 + s.rpm * 0.15 + engine.cylinders * 8, strength: s.pulse, lope: 0 };
    for (const k in P) n.parameters.get(k).value = P[k];
    await new Promise(r => setTimeout(r, 30)); const x = (await c.startRendering()).getChannelData(0).slice(SR * 0.3);
    return Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  };
  const gas = async s => {
    const c = new OfflineAudioContext(2, SR * 0.6, SR); await loadSoundWorklet(c);
    const n = new AudioWorkletNode(c, 'engine-gas', { outputChannelCount: [2] }); n.port.postMessage(cfg);
    const conv = c.createConvolver(); conv.buffer = soundIRBuffer(c, ch.ir);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.frequency.value = ch.lpHz;
    const g = c.createGain(); g.gain.value = ch.gain; n.connect(conv); conv.connect(lp); lp.connect(g); g.connect(c.destination);
    const tm = gasTiming(engine, s.rpm / engine.redline);
    const P = { rpm: s.rpm, map: s.map * 101325, fuel: s.cut ? 0 : 1, lambda: 0.9, spark: tm.spark, burn: tm.burn, level: gasLevel(size, exhaustStrength(engine, s, s.strength)) / F, floor: GAS_FLOOR * ref };
    for (const k in P) n.parameters.get(k).value = P[k];
    await new Promise(r => setTimeout(r, 30)); const x = (await c.startRendering()).getChannelData(0).slice(SR * 0.3);
    return Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  };
  // the pull: the fastest instant still firing (on the limiter the fuel is cut too); late: still on the overrun
  const pull = tr.filter(s => s.t > 0.6 && s.t < 3.5 && !s.cut).reduce((a, s) => s.rpm > a.rpm ? s : a);
  const early = at(3.8), late = tr.filter(s => s.t > 3.8 && s.cut).pop();
  const db = (a, b) => 20 * Math.log10(a / b);
  const sP = await synth(pull), sE = await synth(early), sL = await synth(late), gP = await gas(pull), gE = await gas(early), gL = await gas(late);
  return { dfco: engine.canDFCO, pull: { rpm: pull.rpm }, early: { rpm: early.rpm, cut: early.cut, strength: early.strength }, late: { rpm: late.rpm },
    synth: { early: db(sE, sP), late: db(sL, sP) }, gas: { early: db(gE, gP), late: db(gL, gP) } };
});
console.log(`== lift (DFCO ${lift.dfco}) from a pull at ${lift.pull.rpm.toFixed(0)} rpm: 0.3 s after, ${lift.early.rpm.toFixed(0)} rpm, fuel cut ${lift.early.cut}, strength ${lift.early.strength.toFixed(3)} · synth ${lift.synth.early.toFixed(0)} dB then ${lift.synth.late.toFixed(0)} dB at ${lift.late.rpm.toFixed(0)} rpm · gas ${lift.gas.early.toFixed(0)} dB then ${lift.gas.late.toFixed(0)} dB ==`);
if (!lift.early.cut) fails.push('the lift did not cut the fuel, so it tests nothing');
for (const [m, r] of [['synth', lift.synth], ['gas', lift.gas]]) {
  if (!(r.early > -25)) fails.push(`${m}: the sound cuts out on a lift (${r.early.toFixed(0)} dB against the pull)`);
  if (!(r.late < r.early + 3)) fails.push(`${m}: the overrun does not fade as the revs fall`);
}

await page.evaluate(() => { try { localStorage.removeItem('pes.soundModel'); } catch (e) {} });
await browser.close();
for (const f of fails) console.log('FAIL ' + f);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test84: ${fails.length} failure(s), ${errors.length} error(s)` : 'test84: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
