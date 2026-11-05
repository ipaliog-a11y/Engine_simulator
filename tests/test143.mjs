// The rev limiter does not wear the engine (build 233).
//
// WHY THIS EXISTS. With WEAR on, an engine held on its limiter was charged 0.006 health a second from 98.5% of the
// redline, so every real engine free-revving at full throttle was blown in under three minutes, an Aygo as fast as a
// GT3. A redline is the speed the maker rates the engine to run at; the limiter exists so it cannot pass it, and real
// engines are validated with hundreds of hours at full load and full speed. What must hold:
//   · every real combustion engine, held on its limiter at full throttle for 30 s with its temperatures held, keeps
//     its health to the baseline fatigue alone, and no wear cause shows;
//   · the bench still cannot pass the redline;
//   · abuse still wears: knock (fixed timing far past the knock limit, at full load) and a lean mixture under boost;
//   · the guide no longer says the limiter wears the engine, in English or Greek; the over-rev row is gone.
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
  // run the live bench: temperatures held (AUTO THERMAL off), so only the wear rules are under test
  const run = (secs, thr, ld, lambda) => {
    wearEnabled = true; setAutoThermal(false); state.coolant = 90; state.oil = 100;
    state.engineHealth = 1; state.blown = false; state.throttle = thr; state.load = ld;
    if (lambda) { engine.afrMode = 'fixed'; state.afr = engine.stoichAFR * lambda; }
    const causes = new Set(); let maxRpm = 0, atLimit = 0;
    for (let i = 0; i < secs / dt; i++) {
      stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt);
      maxRpm = Math.max(maxRpm, state.rpm); if (state.rpm >= engine.redline * 0.9) atLimit += dt;   // the fuel cut bounces it off the redline (deepest on a light two-stroke)
      if (state.wearCause) causes.add(state.wearCause);
    }
    return { h: state.engineHealth, causes: [...causes], maxRpm, red: engine.redline, atLimit };
  };
  const o = { all: [] };
  for (const p of FACTORY_ENGINES.filter(p => p.real && p.engine.type !== 'electric' && !p.engine.hyMode)) {
    load(p); o.all.push(Object.assign({ n: p.name }, run(30, 1, 0)));
  }
  const gti = FACTORY_ENGINES.find(p => p.name.includes('EA888'));
  load(gti, { timingMode: 'fixed', ignitionAdv: 40 }); o.knock = run(30, 1, 0.5);
  load(gti); o.lean = run(30, 1, 0.4, 1.25);
  o.fatigue = 1 - 30 * 0.000006;
  o.guide = { en: document.querySelector('[data-gk="redlineGame"]').textContent + document.querySelector('[data-gk="wearPhys"]').textContent,
    el: GUIDE_I18N.redlineGame.el + GUIDE_I18N.wearPhys.el };
  return o;
});

const f = (x, d = 4) => (+x).toFixed(d);
const worn = r.all.filter(x => x.h < r.fatigue - 1e-6 || x.causes.length);
const past = r.all.filter(x => x.maxRpm > x.red + 1e-6);
const notAtLimit = r.all.filter(x => x.atLimit < 20 || x.maxRpm < x.red * 0.95);   // a governed diesel holds just under it
console.log(`== ${r.all.length} real engines, 30 s on the limiter at full throttle: ${r.all.length - worn.length} unworn (health ${f(r.fatigue)}, baseline fatigue only) ==`);
worn.forEach(x => { console.log(`   ${x.n}: health ${f(x.h)} ${x.causes.join(', ')}`); fails.push(`${x.n} wears on its limiter (${f(x.h)}, ${x.causes.join(', ') || 'no cause'})`); });
past.forEach(x => fails.push(`${x.n} passed its redline on the bench (${Math.round(x.maxRpm)} > ${x.red})`));
notAtLimit.forEach(x => fails.push(`${x.n} did not sit on its limiter (${f(x.atLimit, 1)} s of 30): the check proves nothing for it`));
console.log(`== abuse: knock ${f(r.knock.h)} (${r.knock.causes.join(', ')}); lean under boost ${f(r.lean.h)} (${r.lean.causes.join(', ')}) ==`);
if (!(r.knock.h < 0.9 && r.knock.causes.includes('DETONATION'))) fails.push('fixed timing far past the knock limit no longer wears the engine');
if (!(r.lean.h < 0.95 && r.lean.causes.includes('LEAN/BOOST'))) fails.push('a lean mixture under boost no longer wears the engine');
const enOk = /does not wear it/.test(r.guide.en) && !/98\.5|OVER-REV/.test(r.guide.en);
const elOk = /δεν φθείρει τον κινητήρα/.test(r.guide.el) && !/98\.5|ΥΠΕΡΣΤΡΟΦΕΣ/.test(r.guide.el);
console.log(`== guide: English ${enOk ? 'updated' : 'STALE'}, Greek ${elOk ? 'updated' : 'STALE'} ==`);
if (!enOk) fails.push('the guide still says the limiter wears the engine');
if (!elOk) fails.push('the Greek guide still says the limiter wears the engine');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the limiter holds the redline without wearing the engine; knock and lean boost still do.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
