// Load, lope and overrun crackle in the engine sound (build 126).
//
// WHY THIS EXISTS. Through build 125 load only turned the volume up: the pulses themselves were the
// same at idle and flat out, the lope was a fixed jitter, and lifting off made no sound of its own.
// soundDrive() now reads the running engine (manifold pressure, mixture, fuel cut, throttle) and the
// worklet turns that into what the exhaust hears. These checks pin both halves:
//   1. the worklet: a harder pulse is louder AND brighter (it saturates its pipe), a misfire into the
//      pipe pops above the ordinary pulses, and a working cat takes the edge off the pops;
//   2. soundDrive: full throttle hits harder than idle; a diesel at idle is soft because it is lean;
//      a fuel cut leaves only compressed air; the lope is an idle thing and fades under load; an
//      injected engine lifting off is quiet while a carburetted one crackles for a second or two after a
//      pull and then stops; anti-lag crackles even from cold.
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
  const SR = 48000, RPM = 3000;
  const build = (name, o) => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS.find(x => x.name === name).engine, o || {})); buildEngine(); return soundConfig(engine); };
  const render = async (cfg, p) => {
    const ctx = new OfflineAudioContext(2, SR * 1.5, SR);
    await loadSoundWorklet(ctx);
    const node = new AudioWorkletNode(ctx, 'engine-pulse', { outputChannelCount: [2] });
    node.port.postMessage(cfg);
    const v = Object.assign({ rpm: RPM, level: 1, bright: 20000, lope: 0, strength: 1, crackle: 0 }, p);
    for (const k in v) node.parameters.get(k).value = v[k];
    node.connect(ctx.destination);
    await new Promise(r => setTimeout(r, 30));
    return (await ctx.startRendering()).getChannelData(0).slice(SR * 0.5);
  };
  const rms = x => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  const peak = x => x.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  // brightness: share of energy above 1 kHz, by first difference (a crude high-pass) over the signal
  const bright = x => { let d = 0; for (let i = 1; i < x.length; i++) d += (x[i] - x[i - 1]) ** 2; return d / x.reduce((a, v) => a + v * v, 0); };
  const out = {};
  // ---- 1. the worklet ----
  const cfg = build('2.0 ITB NA Screamer I4');                     // race header, no cat
  const soft = await render(cfg, { strength: 0.3 }), hard = await render(cfg, { strength: 1.2 });
  out.soft = { rms: rms(soft), bright: bright(soft) }; out.hard = { rms: rms(hard), bright: bright(hard) };
  const quiet = await render(cfg, { strength: 0.15 }), pops = await render(cfg, { strength: 0.15, crackle: 0.3 });
  out.pops = { base: peak(quiet), with: peak(pops) };
  const cfgCat = build('2.0 ITB NA Screamer I4', { cat: 'stock' });
  const popsCat = await render(cfgCat, { strength: 0.15, crackle: 0.3 }), quietCat = await render(cfgCat, { strength: 0.15 });
  out.popsCat = { base: peak(quietCat), with: peak(popsCat) };

  // ---- 2. soundDrive on the live state (synchronous, so the sim loop cannot step in between) ----
  const at = o => { Object.assign(state, { blown: false, fuelCut: false, throttle: 0.5, afr: engine.stoichAFR }, o); return soundDrive(0.016); };
  build('1.6 Sport NA I4', { intakeSys: 'efi', cam: 'race' });
  Sound.hot = 0;
  out.idle = at({ rpm: engine.idleRpmEff, map: 0.35, throttle: 0.02 });
  out.wot = at({ rpm: 5000, map: 0.98, throttle: 1, afr: engine.stoichAFR * 0.88 });
  out.cut = at({ rpm: 5000, map: 0.25, throttle: 0, fuelCut: true });
  out.loadedIdle = at({ rpm: engine.idleRpmEff, map: 0.95, throttle: 0.9 });
  // an injected engine lifting off after a pull: hot pipe, but DFCO
  Sound.hot = 1; out.efiLift = at({ rpm: 5000, map: 0.25, throttle: 0, fuelCut: true });
  // a carburetted one: crackles while the pipe is hot, then stops
  build('1.6 Sport NA I4', { intakeSys: 'carb2' });
  Sound.hot = 1; out.carbLift = at({ rpm: 5000, map: 0.25, throttle: 0 });
  for (let i = 0; i < 300; i++) at({ rpm: 5000, map: 0.25, throttle: 0 });   // ~5 s of overrun
  out.carbLater = at({ rpm: 5000, map: 0.25, throttle: 0 });
  // anti-lag from a cold pipe
  build('2.0 Turbo Hot-Hatch I4', { antilag: true });
  Sound.hot = 0; out.als = at({ rpm: 4500, map: 0.6, throttle: 0, fuelCut: true });
  // a diesel: same unthrottled manifold, lean at idle, rich at the smoke limit
  build('2.0 Turbo Diesel I4');
  out.dIdle = at({ rpm: engine.idleRpmEff, map: 1.0, afr: engine.stoichAFR * 4 });
  out.dFull = at({ rpm: 2500, map: 1.0, afr: engine.stoichAFR * 1.3 });
  return out;
});

const r = res, f3 = v => v.toFixed(3);
console.log(`== pulse 0.3 rms ${f3(r.soft.rms)} brightness ${f3(r.soft.bright)} · pulse 1.2 rms ${f3(r.hard.rms)} brightness ${f3(r.hard.bright)} ==`);
console.log(`== pops: peak ${f3(r.pops.base)} -> ${f3(r.pops.with)} decat · ${f3(r.popsCat.base)} -> ${f3(r.popsCat.with)} stock cat ==`);
const d = k => `${k} str ${f3(r[k].strength)} lope ${f3(r[k].lope)} crk ${f3(r[k].crackle)}`;
for (const k of ['idle', 'wot', 'cut', 'loadedIdle', 'efiLift', 'carbLift', 'carbLater', 'als', 'dIdle', 'dFull']) console.log('== ' + d(k) + ' ==');

if (!(r.hard.rms > r.soft.rms * 1.5)) fails.push('a harder pulse is not louder');
if (!(r.hard.bright > r.soft.bright * 1.05)) fails.push('a harder pulse is not brighter (it should saturate its pipe)');
if (!(r.pops.with > r.pops.base * 2)) fails.push(`misfires into the pipe do not pop (${f3(r.pops.base)} -> ${f3(r.pops.with)})`);
if (!(r.popsCat.with / r.popsCat.base < r.pops.with / r.pops.base)) fails.push('a working cat does not take the edge off the pops');
if (!(r.wot.strength > 2 * r.idle.strength)) fails.push('full throttle does not hit much harder than idle');
if (!(r.cut.strength < 0.15 * r.wot.strength)) fails.push('a fuel cut still makes a combustion pulse');
if (!(r.idle.lope > 0.1 && r.loadedIdle.lope < 0.5 * r.idle.lope)) fails.push('the lope does not fade under load');
if (r.efiLift.crackle !== 0) fails.push('an injected engine on DFCO crackles');
if (!(r.carbLift.crackle > 0.1)) fails.push('a carburetted engine lifting off a pull does not crackle');
if (!(r.carbLater.crackle === 0)) fails.push('the crackle does not die away as the pipe cools');
if (!(r.als.crackle > 0.1)) fails.push('anti-lag does not crackle on a lift');
if (!(r.dIdle.strength < 0.5 * r.dFull.strength)) fails.push('a lean diesel idle hits as hard as full fuelling');

await browser.close();
for (const f of fails) console.log('FAIL ' + f);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test68: ${fails.length} failure(s), ${errors.length} error(s)` : 'test68: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
