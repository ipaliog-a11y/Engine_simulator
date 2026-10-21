// Turbo and supercharger whine, blow-off, induction roar and knock in the engine sound (build 124).
//
// WHY THIS EXISTS. Through build 123 everything you heard came out of the exhaust. A real car also
// whines from its compressor, hisses when the blow-off valve vents, roars through its intake and rings
// when it knocks, and each of those is set by hardware the sim already models. These checks pin that
// each voice is there, at the frequency the hardware puts it, and only when it should be:
//   1. the worklet: a whine tone at whineF; a blow-off burst that lasts longer from a bigger charge
//      volume; a knock ring at Draper's chamber mode; intake roar that grows with flow;
//   2. the config: a shorter intake runner resonates higher; a wider bore knocks lower;
//   3. soundDrive: a turbo's pitch follows its shaft, a supercharger's the crank; a lift from boost
//      blows off once, a lift from no boost or on a diesel does not; a petrol engine knocks only past its
//      limit, a diesel always and harder cold; open stacks roar louder than an airbox.
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

const res = await page.evaluate(async () => {
  const SR = 48000;
  const build = (name, o) => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === name).engine, o || {})); buildEngine(); return soundConfig(engine); };
  const render = async (cfg, p, onNode, secs = 1.5, skip = 0.5) => {
    const ctx = new OfflineAudioContext(2, SR * secs, SR);
    await loadSoundWorklet(ctx);
    const node = new AudioWorkletNode(ctx, 'engine-pulse', { outputChannelCount: [2] });
    node.port.postMessage(cfg);
    const v = Object.assign({ rpm: 3000, level: 1, bright: 20000, lope: 0, strength: 1, crackle: 0 }, p);
    for (const k in v) node.parameters.get(k).value = v[k];
    node.connect(ctx.destination);
    await new Promise(r => setTimeout(r, 30));
    if (onNode) { onNode(node); await new Promise(r => setTimeout(r, 30)); }
    return (await ctx.startRendering()).getChannelData(0).slice(SR * skip);
  };
  const power = (x, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); } return re * re + im * im; };
  // energy in a band, by summing DFT power over a few points across it
  const band = (x, lo, hi) => { let a = 0; for (let f = lo; f <= hi; f += (hi - lo) / 8) a += power(x, f); return a; };
  const rms = x => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  const out = {};
  // ---- 1. worklet voices, each against the same engine without it ----
  const cfg = build('2.0 Turbo Hot-Hatch I4');
  const quiet = { strength: 0.05 };
  const base = await render(cfg, quiet);
  const wh = await render(cfg, { ...quiet, whineF: 5150, whineA: 0.05 });
  out.whine = { at: power(wh, 5150) / (power(base, 5150) || 1e-12), off: power(wh, 4700) / (power(base, 4700) || 1e-12) };
  const kn = await render(cfg, { strength: 1, knockProb: 1, knockAmp: 0.12 }), kn0 = await render(cfg, { strength: 1 });
  out.knock = { f: cfg.knockF, ratio: band(kn, cfg.knockF * 0.97, cfg.knockF * 1.03) / band(kn0, cfg.knockF * 0.97, cfg.knockF * 1.03),
    off: band(kn, cfg.knockF * 0.6, cfg.knockF * 0.65) / band(kn0, cfg.knockF * 0.6, cfg.knockF * 0.65) };
  const in1 = await render(cfg, { ...quiet, intake: 0.1 }), in2 = await render(cfg, { ...quiet, intake: 0.3 });
  out.intake = { r0: rms(base), r1: rms(in1), r2: rms(in2) };
  // blow-off: how long the burst stays above a tenth of its start, small vs large charge volume
  const bovLen = async c => {
    const x = await render(c, { strength: 0 }, n => n.port.postMessage({ bov: { amp: 0.3, tau: c.bovTau } }), 1.2, 0);
    const win = 480, env = []; for (let i = 0; i + win < x.length; i += win) env.push(rms(x.subarray(i, i + win)));
    const pk = Math.max(...env); let last = 0; env.forEach((e, i) => { if (e > pk / 10) last = i; });
    return { pk, ms: (last + 1) * win / SR * 1000 };
  };
  const cS = build('2.0 Turbo Hot-Hatch I4', { intercooler: 'small' }), cL = build('2.0 Turbo Hot-Hatch I4', { intercooler: 'large' });
  out.bov = { small: await bovLen(cS), large: await bovLen(cL), tauS: cS.bovTau, tauL: cL.bovTau };
  // ---- 2. config ----
  out.runner = { long: build('1.6 Sport NA I4', { runner: 'long' }).intakeF, short: build('1.6 Sport NA I4', { runner: 'short' }).intakeF };
  out.bore = { small: build('1.6 Sport NA I4', { bore_mm: 78 }).knockF, big: build('1.6 Sport NA I4', { bore_mm: 92 }).knockF };
  // ---- 3. soundDrive on the live state ----
  const at = o => { Object.assign(state, { blown: false, fuelCut: false, throttle: 0.8, afr: engine.stoichAFR, map: 1, knockRisk: 0, coolant: 90, boostActual: 0 }, o); return soundDrive(0.016); };
  build('2.0 Turbo Hot-Hatch I4');
  const Emax = 0.5 * engine.shaftJ * (engine.shaftMax * 2 * Math.PI / 60) ** 2;
  const sA = at({ rpm: 4000, shaftE: Emax * 0.04 }), sB = at({ rpm: 4000, shaftE: Emax * 0.16 }), sMax = at({ rpm: 4000, shaftE: Emax });
  out.turbo = { fA: sA.whineF, fB: sB.whineF, aA: sA.whineA, aB: sB.whineA, fMax: sMax.whineF, aMax: sMax.whineA, maxF: engine.shaftMax / 60 * COMP_BLADES };
  at({ rpm: 5000, throttle: 1, boostActual: 1.0 });
  const lift = at({ rpm: 5000, throttle: 0, boostActual: 0.9 }), after = at({ rpm: 5000, throttle: 0, boostActual: 0.5 });
  at({ rpm: 2000, throttle: 1, boostActual: 0.05 });
  const liftLow = at({ rpm: 2000, throttle: 0, boostActual: 0.05 });
  out.bovDrive = { lift: !!lift.bov, again: !!after.bov, low: !!liftLow.bov };
  out.knockDrive = { below: at({ rpm: 3000, knockRisk: KNOCK_TARGET - 5 }).knockProb, above: at({ rpm: 3000, knockRisk: KNOCK_TARGET + 30 }).knockProb };
  build('6.2 Supercharged V8');
  const r1 = at({ rpm: 2000, boostActual: 0.5 }), r2 = at({ rpm: 4000, boostActual: 0.6 });
  out.sc = { f1: r1.whineF, f2: r2.whineF };
  build('2.0 Turbo Diesel I4');
  at({ rpm: 3000, throttle: 1, boostActual: 1.0 });
  out.dieselBov = !!at({ rpm: 3000, throttle: 0, boostActual: 1.0 }).bov;
  out.dieselKnock = { warm: at({ rpm: 900, coolant: 90, map: 1 }).knockAmp, cold: at({ rpm: 900, coolant: 20, map: 1 }).knockAmp };
  out.stacks = at({ rpm: 6000, map: 1 }) && null;
  build('2.0 ITB NA Screamer I4'); const st = at({ rpm: 6000, map: 1 }).intake;
  build('1.6 Sport NA I4', { airFilter: 'stock' }); const bx = at({ rpm: 6000 * engine.redline / 8800, map: 1 }).intake;
  out.stacks = { stacks: st, airbox: bx };
  return out;
});

const r = res, f = (v, d = 2) => v.toFixed(d);
console.log(`== whine: ${f(r.whine.at, 0)}x at its pitch, ${f(r.whine.off, 2)}x off it ==`);
console.log(`== knock ring ${f(r.knock.f, 0)} Hz: ${f(r.knock.ratio, 1)}x in band, ${f(r.knock.off, 2)}x off band · bore 78 mm ${f(r.bore.small, 0)} Hz, 92 mm ${f(r.bore.big, 0)} Hz ==`);
console.log(`== intake rms ${f(r.intake.r0, 3)} -> ${f(r.intake.r1, 3)} -> ${f(r.intake.r2, 3)} · runner long ${f(r.runner.long, 0)} Hz, short ${f(r.runner.short, 0)} Hz ==`);
console.log(`== blow-off: small core tau ${f(r.bov.tauS * 1000, 0)} ms, heard ${f(r.bov.small.ms, 0)} ms · large core tau ${f(r.bov.tauL * 1000, 0)} ms, heard ${f(r.bov.large.ms, 0)} ms ==`);
console.log(`== turbo whine ${f(r.turbo.fA, 0)} Hz (amp ${f(r.turbo.aA, 4)}) at 20% shaft speed, ${f(r.turbo.fB, 0)} Hz (amp ${f(r.turbo.aB, 4)}) at 40%, ${f(r.turbo.fMax, 0)} Hz (amp ${f(r.turbo.aMax, 4)}) flat out ==`);
console.log(`== supercharger ${f(r.sc.f1, 0)} Hz at 2000 rpm, ${f(r.sc.f2, 0)} Hz at 4000 ==`);
console.log(`== blow-off on a lift from 0.9 bar ${r.bovDrive.lift}, next frame ${r.bovDrive.again}, from 0.05 bar ${r.bovDrive.low}, diesel ${r.dieselBov} ==`);
console.log(`== knock prob below limit ${f(r.knockDrive.below)}, past it ${f(r.knockDrive.above)} · diesel warm ${f(r.dieselKnock.warm, 3)} cold ${f(r.dieselKnock.cold, 3)} · roar stacks ${f(r.stacks.stacks, 3)} airbox ${f(r.stacks.airbox, 3)} ==`);

if (!(r.whine.at > 100 && r.whine.off < 3)) fails.push('the whine is not a tone at whineF');
if (!(r.knock.ratio > 5 && r.knock.off < r.knock.ratio / 3)) fails.push('knock does not ring at the chamber mode');
if (!(r.intake.r2 > r.intake.r1 && r.intake.r1 > r.intake.r0)) fails.push('intake roar does not grow with its level');
if (!(r.bov.large.ms > r.bov.small.ms * 1.3 && r.bov.small.ms > 30)) fails.push('a bigger charge volume does not blow off for longer');
if (!(r.runner.short > r.runner.long)) fails.push('a shorter runner does not resonate higher');
if (!(r.bore.big < r.bore.small)) fails.push('a wider bore does not knock lower');
if (!(Math.abs(r.turbo.fB / r.turbo.fA - 2) < 0.02)) fails.push('turbo pitch does not follow shaft speed (4x energy should be 2x pitch)');
if (!(Math.abs(r.turbo.fMax - r.turbo.maxF) < 1)) fails.push('a turbo at full shaft energy is not at its blade-pass maximum');
if (!(r.turbo.aB > 2 * r.turbo.aA)) fails.push('turbo whine does not grow with shaft speed in the audible range');
if (!(r.turbo.aMax < r.turbo.aB * 4)) fails.push('the whine is not rolled off past 10 kHz (it would squeal)');
if (!(Math.abs(r.sc.f2 / r.sc.f1 - 2) < 0.01)) fails.push('supercharger pitch does not follow the crank');
if (!r.bovDrive.lift) fails.push('lifting from boost does not blow off');
if (r.bovDrive.again) fails.push('the blow-off fires again on the next frame');
if (r.bovDrive.low) fails.push('lifting from no boost blows off');
if (r.dieselBov) fails.push('a diesel blows off');
if (!(r.knockDrive.below === 0 && r.knockDrive.above > 0.3)) fails.push('petrol knock does not start at the knock limit');
if (!(r.dieselKnock.cold > 1.5 * r.dieselKnock.warm && r.dieselKnock.warm > 0)) fails.push('a cold diesel does not rattle harder');
if (!(r.stacks.stacks > 2 * r.stacks.airbox)) fails.push('open stacks do not roar louder than an airbox');

await browser.close();
for (const x of fails) console.log('FAIL ' + x);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test68: ${fails.length} failure(s), ${errors.length} error(s)` : 'test68: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
