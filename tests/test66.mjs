// The exhaust in the engine sound (build 122).
//
// WHY THIS EXISTS. Build 121 made the sound from firing pulses but rang every petrol engine at the same
// fixed pipe tone. The pulses now run the exhaust the build actually has: the primary rings at its
// quarter wave (c/4L, the same primL the breathing model tunes), as sharply as the header's path-length
// spread allows, the system behind it adds its half-wave drone, and the silencer, cat and turbine take
// the top off. These checks pin the direction of each:
//   1. the primary's ring is where c/4L puts it, and the harmonic nearest it stands out of the spectrum;
//   2. a header cut for higher revs is shorter and rings higher;
//   3. a jig-cut race header rings harder than a cast log manifold;
//   4. a stock system is quieter and darker than a race one, a decat louder than a stock cat, and a
//      turbine darker and quieter than no turbine on the same engine.
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
  const SR = 48000, RPM = 1800;                          // 1800 rpm: a 4-stroke cycle is 15 Hz, 3200 samples
  const base = PRESETS.find(x => x.name === '1.6 Sport NA I4').engine;
  const build = o => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, base, o)); buildEngine(); return { cfg: soundConfig(engine), primL: engine.primL }; };
  const render = async cfg => {
    const ctx = new OfflineAudioContext(2, SR * 1.5, SR);
    await loadSoundWorklet(ctx);
    const node = new AudioWorkletNode(ctx, 'engine-pulse', { outputChannelCount: [2] });
    node.port.postMessage(cfg);
    node.parameters.get('rpm').value = RPM; node.parameters.get('level').value = 1;
    node.parameters.get('bright').value = 20000; node.parameters.get('lope').value = 0;   // only the pipes shape it
    node.connect(ctx.destination);
    await new Promise(r => setTimeout(r, 30));
    return (await ctx.startRendering()).getChannelData(0).slice(SR * 0.5);
  };
  const power = (x, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); } return re * re + im * im; };
  // Spectrum at the firing harmonics (the signal is periodic in the firing interval with no lope).
  const spectrum = (x, cfg) => { const ff = RPM / 60 / cfg.cycleRevs * cfg.events.length, out = []; for (let h = 1; h * ff < 4000; h++) out.push([h * ff, power(x, h * ff)]); return out; };
  const centroid = sp => sp.reduce((a, [f, p]) => a + f * p, 0) / sp.reduce((a, [, p]) => a + p, 0);
  const rms = x => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  const measure = async o => { const b = build(o), x = await render(b.cfg), sp = spectrum(x, b.cfg); return { ...b, rms: rms(x), centroid: centroid(sp), sp }; };
  const out = {};
  // 1. a race header, a high-Q primary: the spectrum should bulge at the harmonic nearest c/4L
  const race = await measure({ exhaust: 'race', cat: 'none' });
  const pf = race.cfg.exhaust.primF, near = race.sp.reduce((a, b) => Math.abs(b[0] - pf) < Math.abs(a[0] - pf) ? b : a);
  const i = race.sp.indexOf(near), neigh = (race.sp[i - 2][1] + race.sp[i + 2][1]) / 2;
  out.prim = { primL: race.primL, primF: pf, expect: sonic(exhaustGasT(0.7, 0.6 * engine.redline, 0)) / (4 * race.primL), bulge: near[1] / neigh, at: near[0] };
  // 2. the same race header cut for 6000 vs 8800 rpm
  const lo = build({ exhaust: 'race', redline: 6600 }), hi = build({ exhaust: 'race', redline: 8800 });
  out.tune = { lowL: lo.primL, lowF: lo.cfg.exhaust.primF, highL: hi.primL, highF: hi.cfg.exhaust.primF };
  // 3. how hard each header rings
  out.q = { stock: build({ exhaust: 'stock' }).cfg.exhaust.primQ, sport: build({ exhaust: 'sport' }).cfg.exhaust.primQ, race: race.cfg.exhaust.primQ };
  // 4. silencer, cat, turbine
  const strip = r => ({ rms: r.rms, centroid: r.centroid });
  out.stock = strip(await measure({ exhaust: 'stock', cat: 'stock' }));
  out.race = strip(race);
  out.raceCat = strip(await measure({ exhaust: 'race', cat: 'stock' }));
  out.na = strip(await measure({ exhaust: 'sport', cat: 'sport' }));
  out.turbo = strip(await measure({ exhaust: 'sport', cat: 'sport', intake: 'turbo', boost_bar: 0.8, turboSize: 'small' }));
  return out;
});

const r = res;
console.log(`== primary ${(r.prim.primL * 1000).toFixed(0)} mm rings at ${r.prim.primF.toFixed(0)} Hz (c/4L ${r.prim.expect.toFixed(0)}); harmonic at ${r.prim.at.toFixed(0)} Hz stands ${r.prim.bulge.toFixed(1)}x over its neighbours ==`);
console.log(`== race header for 6600 rpm: ${(r.tune.lowL * 1000).toFixed(0)} mm, ${r.tune.lowF.toFixed(0)} Hz · for 8800: ${(r.tune.highL * 1000).toFixed(0)} mm, ${r.tune.highF.toFixed(0)} Hz ==`);
console.log(`== primary Q: stock ${r.q.stock.toFixed(1)} · sport ${r.q.sport.toFixed(1)} · race ${r.q.race.toFixed(1)} ==`);
for (const k of ['stock', 'raceCat', 'race', 'na', 'turbo']) console.log(`== ${k.padEnd(8)} rms ${r[k].rms.toFixed(3)} · centroid ${r[k].centroid.toFixed(0)} Hz ==`);

if (Math.abs(r.prim.primF / r.prim.expect - 1) > 0.01) fails.push(`primary rings at ${r.prim.primF.toFixed(0)} Hz, c/4L says ${r.prim.expect.toFixed(0)}`);
if (!(r.prim.bulge > 1.5)) fails.push(`the harmonic nearest the primary's ring does not stand out (${r.prim.bulge.toFixed(2)}x)`);
if (!(r.tune.highL < r.tune.lowL && r.tune.highF > r.tune.lowF)) fails.push('a header cut for higher revs is not shorter and higher-pitched');
if (!(r.q.race > r.q.sport && r.q.sport > r.q.stock)) fails.push('header ring does not follow path-length spread (race > sport > stock)');
if (!(r.stock.rms < r.race.rms && r.stock.centroid < r.race.centroid)) fails.push('a stock system is not quieter and darker than a race one');
if (!(r.raceCat.rms < r.race.rms)) fails.push('a stock cat is not quieter than a decat');
if (!(r.turbo.rms < r.na.rms && r.turbo.centroid < r.na.centroid)) fails.push('a turbine does not muffle the exhaust');

await browser.close();
for (const f of fails) console.log('FAIL ' + f);
for (const e of errors) console.log('ERROR ' + e);
console.log(fails.length || errors.length ? `test66: ${fails.length} failure(s), ${errors.length} error(s)` : 'test66: all passed');
process.exit(fails.length || errors.length ? 1 : 0);
