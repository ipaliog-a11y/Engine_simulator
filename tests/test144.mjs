// A factory engine's valve springs are its maker's (build 234).
//
// WHY THIS EXISTS. Every STOCK spring was one generic part, 250 N on the seat, so 24 of the 89 real valved engines
// floated below the redline their makers rate them to (a Hellcat at 4440 rpm against 6200). No factory engine floats
// inside its rev range, so the float figure could neither be trusted nor used to judge a redline set too high. What
// must hold:
//   · every real valved engine floats past its own redline, 5% past it on its STOCK springs;
//   · a factory preset carries springRpm = its redline; it survives save and load, and a build saved before it existed
//     loads with the generic springs, as does a design of your own (an archetype's float is the generic spring's);
//   · PERFORMANCE and RACE still raise the float speed over STOCK, on a factory engine as on your own;
//   · with WEAR on, an engine whose redline is past its own float speed wears on its limiter (VALVE FLOAT); the same
//     engine at its factory redline does not;
//   · the guide says so, in English and Greek.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const r = await page.evaluate(() => {
  const dt = 0.05;
  const load = (p, over) => applyBuild({ engine: Object.assign({}, p.engine, over || {}), tune: Object.assign({}, STD_TUNE),
    vehicle: Object.assign({}, DEFAULT_VEHICLE), name: p.name });
  const onLimiter = secs => {
    wearEnabled = true; setAutoThermal(false); state.coolant = 90; state.oil = 100;
    state.engineHealth = 1; state.blown = false; state.throttle = 1; state.load = 0;
    const causes = new Set();
    for (let i = 0; i < secs / dt; i++) { stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt); if (state.wearCause) causes.add(state.wearCause); }
    return { h: state.engineHealth, causes: [...causes] };
  };
  const o = { all: [] };
  for (const p of FACTORY_ENGINES.filter(p => p.real && p.engine.type !== 'electric')) {
    load(p);
    if (!engine.floatRpm) continue;   // rotaries and two-strokes have no valves to float
    o.all.push({ n: p.name, flt: engine.floatRpm, red: engine.redline, springRpm: engine.springRpm, preset: p.engine.springRpm, spring: engine.valveSpring });
  }
  // the springs' steps on a factory engine
  const ls3 = FACTORY_ENGINES.find(p => p.name.includes('LS3'));
  o.steps = {};
  for (const sp of ['stock', 'perf', 'race']) { load(ls3, { valveSpring: sp }); o.steps[sp] = engine.floatRpm; }
  // a design of your own keeps the generic spring
  const arch = PRESETS.find(p => p.cat === 'Archetypes' && !p.engine.type);
  load(arch); o.arch = { springRpm: engine.springRpm, flt: engine.floatRpm };
  const cam = CAM[engine.cam] || CAM.stock;
  o.arch.generic = valveFloatRpm(engine.ivLift_mm, cam.dur, VALVE_SPRING[engine.valveSpring] || VALVE_SPRING.stock, engine.valveMass_g / 1000, cam.accel, 2);
  // save and load
  load(ls3);
  const b = serializeBuild('t', ''); o.save = { saved: b.engine.springRpm };
  applyBuild(JSON.parse(JSON.stringify(b))); o.save.back = readEngineFromForm().springRpm;
  const old = JSON.parse(JSON.stringify(b)); delete old.engine.springRpm; applyBuild(old); o.save.old = readEngineFromForm().springRpm;
  // a redline past float wears; the factory redline does not
  // on STOCK springs (the preset lists PERFORMANCE, which is now a step over its own)
  load(ls3, { valveSpring: 'stock' }); o.wear = { factory: onLimiter(20), red: engine.redline };
  load(ls3, { valveSpring: 'stock', redline: 7500 }); o.wear.raisedFlt = engine.floatRpm; o.wear.raised = onLimiter(20);
  o.guide = { en: document.querySelector('[data-gk="valvetrainPhys"]').textContent + document.querySelector('[data-gk="wearPhys"]').textContent,
    el: GUIDE_I18N.valvetrainPhys.el + GUIDE_I18N.wearPhys.el, label: (I18N['VALVE FLOAT'] || {}).el };
  return o;
});

const f = (x, d = 0) => (+x).toFixed(d);
// sized for the preset's own redline (the Radical's 10500 is clamped to the petrol maximum, 9500, and floats past both)
const low = r.all.filter(x => !(x.flt > x.red)), unsized = r.all.filter(x => !(x.springRpm > 0) || x.springRpm !== x.preset);
const stockLow = r.all.filter(x => x.spring === 'stock' && Math.abs(x.flt / x.red - 1.05) > 0.002 && x.flt / x.red < 1.05);
console.log(`== ${r.all.length} real valved engines: ${r.all.length - low.length} float past their redline ==`);
low.forEach(x => fails.push(`${x.n} floats at ${f(x.flt)} rpm, inside its ${x.red} rpm redline`));
unsized.forEach(x => fails.push(`${x.n}: springs sized for ${x.springRpm} rpm, not its own redline (${x.preset} rpm)`));
stockLow.forEach(x => fails.push(`${x.n}: STOCK springs float at ${(x.flt / x.red).toFixed(3)} x redline, short of 1.05`));
const m = r.all.map(x => x.flt / x.red).sort((a, b) => a - b);
console.log(`   float / redline: lowest ${m[0].toFixed(3)}, median ${m[m.length >> 1].toFixed(3)}`);
console.log(`== LS3 springs: stock ${f(r.steps.stock)}, performance ${f(r.steps.perf)}, race ${f(r.steps.race)} rpm ==`);
if (!(r.steps.stock < r.steps.perf && r.steps.perf < r.steps.race)) fails.push('PERFORMANCE and RACE springs no longer raise the float speed over STOCK');
console.log(`== own design: springRpm ${r.arch.springRpm}, float ${f(r.arch.flt)} rpm, generic spring ${f(r.arch.generic)} rpm ==`);
if (r.arch.springRpm !== 0 || Math.abs(r.arch.flt - r.arch.generic) > 1e-6) fails.push('a design of your own no longer uses the generic springs');
console.log(`== save: springRpm ${r.save.saved} saved, ${r.save.back} loaded; a build from before: ${r.save.old} ==`);
if (r.save.saved !== r.wear.red || r.save.back !== r.wear.red) fails.push('the springs\' rating does not survive save and load');
if (r.save.old !== 0) fails.push('a build saved before springRpm existed does not load with the generic springs');
console.log(`== LS3 (STOCK springs) on its limiter: factory ${r.wear.red} rpm health ${f(r.wear.factory.h, 4)} ${r.wear.factory.causes.join(',')}; at 7500 rpm (float ${f(r.wear.raisedFlt)}) health ${f(r.wear.raised.h, 4)} ${r.wear.raised.causes.join(',')} ==`);
if (r.wear.factory.causes.length || r.wear.factory.h < 0.999) fails.push('the LS3 wears on its factory limiter');
if (!(r.wear.raisedFlt < 7500)) fails.push('the LS3 at 7500 rpm should be past its float speed for the check to mean anything');
if (!(r.wear.raised.h < 0.95 && r.wear.raised.causes.includes('VALVE FLOAT'))) fails.push('a redline set past valve float does not wear the engine');
const enOk = /floats the valves 5% past/.test(r.guide.en) && /valve float/.test(r.guide.en);
const elOk = /5% πάνω από το δικό του όριο/.test(r.guide.el) && /πλεύση βαλβίδων/.test(r.guide.el) && r.guide.label === 'ΠΛΕΥΣΗ ΒΑΛΒΙΔΩΝ';
console.log(`== guide: English ${enOk ? 'updated' : 'STALE'}, Greek ${elOk ? 'updated' : 'STALE'} ==`);
if (!enOk) fails.push('the guide does not describe the factory springs and the float wear');
if (!elOk) fails.push('the Greek guide or the VALVE FLOAT label is missing');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: factory springs float past their redline; a redline set past float wears the engine.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
