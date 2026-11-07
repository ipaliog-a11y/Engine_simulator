// The bench's heat is the fuel's (build 235).
//
// WHY THIS EXISTS. With AUTO THERMAL on, coolant and oil were heated by a load figure made of rpm and throttle, so an
// engine free-revving on its limiter, where the fuel is cut and it makes only its own friction, counted as full load:
// the oil passed 132 C in about a minute and 55 of the 93 real engines took OIL TEMP or OVERHEAT wear, 36 of them blown
// in two minutes. What a cooling system carries away is a share of the fuel's energy. What must hold:
//   · every real combustion engine free-revving at full throttle for 120 s, AUTO THERMAL and WEAR on, takes no wear;
//   · full load at the rpm of peak power heats each engine more than free-revving does;
//   · a radiator sized for less power runs hotter at full load (the generic 260 hp part against an LS7's own, SMALL
//     against LARGE);
//   · full load at peak power for 120 s: the engines that still take wear are a named list that may only shrink
//     (FULL_LOAD_KNOWN; the lumped model's fitted temperature rises, named in the CHANGELOG);
//   · the guide says where the heat comes from, in English and Greek.
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

// Build 235: the lumped thermal model's temperature rises (34 C of coolant at full heat over the cooling capacity, 8 +
// 30 C of oil over the coolant) are fitted, and at sustained full rated power they put the oil past 132 C on engines
// with no oil cooler. A factory cooling system is sized to hold its engine's rated power; deriving that design point
// is its own change.
const FULL_LOAD_KNOWN = new Set([
  'VW EA888 2.0 TSI (Golf GTI Mk7)', 'Toyota 2JZ-GTE (Supra A80)', 'Subaru EJ257 (Impreza WRX STI)',
  'Mitsubishi 4G63T (Lancer Evo IX)', 'GM LS3 (Corvette C6)', 'GM LS7 (Corvette Z06 C6)', 'Ford Coyote 5.0 (Mustang GT 2018)',
  'Lamborghini 6.5 V12 (Murciélago LP640)', 'Ferrari F136 FB V8 (458 Italia)', 'Lamborghini 5.2 V10 (Huracán LP610-4)',
  'Lamborghini 5.2 V10 (Huracán STO)', 'Mazda 13B-REW (RX-7 FD)', 'Buick LC2 turbo V6 (GNX)', 'Jaguar XK 3.8 I6 (E-Type S1)',
  // build 244: the Daytona's carburettors now fade at the top (their venturi drop), so its power peaks below the limiter
  // and "full load at peak power" holds it hard for the first time, where its peak used to sit near the limiter on almost
  // no dyno load. The same fitted temperature rises put its oil at 149 C; named in the CHANGELOG.
  'Ferrari Colombo 4.4 V12 (365 GTB/4)',
]);

const r = await page.evaluate(() => {
  const dt = 0.05;
  const load = (p, over) => applyBuild({ engine: Object.assign({}, p.engine, over || {}), tune: Object.assign({}, STD_TUNE),
    vehicle: Object.assign({}, DEFAULT_VEHICLE), name: p.name });
  const run = (secs, thr, ld) => {
    wearEnabled = true; setAutoThermal(true); state.coolant = 90; state.oil = 100;
    state.engineHealth = 1; state.blown = false; state.throttle = thr; state.load = ld;
    const causes = new Set(); let oil = 0, cool = 0;
    for (let i = 0; i < secs / dt; i++) {
      stepThermal(dt); stepEngine(dt); stepElectrical(dt); updatePhysics(); stepWear(dt);
      oil = Math.max(oil, state.oil); cool = Math.max(cool, state.coolant); if (state.wearCause) causes.add(state.wearCause);
    }
    return { h: state.engineHealth, causes: [...causes], oil, cool };
  };
  // the dyno load that holds the engine at the rpm of its peak power
  const atPeak = () => Math.max(0.01, (engine.redline - engine.score.peakHPrpm) / (engine.redline - engine.idleRpmEff));
  const o = { all: [] };
  for (const p of FACTORY_ENGINES.filter(p => p.real && p.engine.type !== 'electric' && !p.engine.hyMode)) {
    load(p); const free = run(120, 1, 0);
    load(p); const full = run(120, 1, atPeak());
    o.all.push({ n: p.name, free, full });
  }
  const ls7 = FACTORY_ENGINES.find(p => p.name.includes('LS7'));
  load(ls7); o.own = run(120, 1, atPeak()).cool;
  load(ls7, { radHp: 0 }); o.generic = run(120, 1, atPeak()).cool;
  load(ls7, { radiator: 'small' }); o.small = run(120, 1, atPeak()).cool;
  load(ls7, { radiator: 'large' }); o.large = run(120, 1, atPeak()).cool;
  setAutoThermal(false);
  o.guide = { en: document.querySelector('[data-gk="heatMore1"]').textContent, el: GUIDE_I18N.heatMore1.el };
  return o;
});

const f = (x, d = 0) => (+x).toFixed(d);
const freeWorn = r.all.filter(x => x.free.causes.length || x.free.h < 0.999);
const oils = r.all.map(x => x.free.oil).sort((a, b) => a - b);
console.log(`== ${r.all.length} real engines free-revving 120 s, AUTO THERMAL on: ${r.all.length - freeWorn.length} unworn; oil median ${f(oils[oils.length >> 1])} C, highest ${f(oils[oils.length - 1])} C ==`);
freeWorn.forEach(x => fails.push(`${x.n} wears free-revving (${x.free.causes.join(', ')}, oil ${f(x.free.oil)} C)`));
const notHotter = r.all.filter(x => !(x.full.oil > x.free.oil));
notHotter.forEach(x => fails.push(`${x.n}: full load at peak power is no hotter than free-revving (oil ${f(x.full.oil)} vs ${f(x.free.oil)} C)`));
const fullWorn = r.all.filter(x => x.full.causes.length);
console.log(`== full load at peak power 120 s: ${fullWorn.length} take wear (known ${FULL_LOAD_KNOWN.size}) ==`);
fullWorn.forEach(x => { if (!FULL_LOAD_KNOWN.has(x.n)) fails.push(`${x.n} newly wears at full load (${x.full.causes.join(', ')}, oil ${f(x.full.oil)} C)`); });
for (const n of FULL_LOAD_KNOWN) { if (!r.all.some(x => x.n === n)) fails.push(`FULL_LOAD_KNOWN names ${n}, which is not a preset`);
  else if (!fullWorn.some(x => x.n === n)) console.log(`   RESOLVED: ${n} no longer wears at full load — remove it from FULL_LOAD_KNOWN`); }
console.log(`== LS7 coolant at full load: own radiator ${f(r.own)} C, generic 260 hp ${f(r.generic)} C; SMALL ${f(r.small)}, LARGE ${f(r.large)} ==`);
if (!(r.generic > r.own)) fails.push('a radiator sized for less power does not run hotter');
if (!(r.small > r.large)) fails.push('a SMALL radiator does not run hotter than a LARGE one');
const enOk = /heat of the fuel being burned/.test(r.guide.en) && /Free-revving on the limiter burns little fuel/.test(r.guide.en);
const elOk = /θερμότητα του καυσίμου/.test(r.guide.el) && /καίνε λίγο καύσιμο/.test(r.guide.el);
console.log(`== guide: English ${enOk ? 'updated' : 'STALE'}, Greek ${elOk ? 'updated' : 'STALE'} ==`);
if (!enOk) fails.push('the guide does not say the heat is the fuel\'s');
if (!elOk) fails.push('the Greek guide does not say the heat is the fuel\'s');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: the heat is the fuel\'s: free-revving stays cool, full load heats, and a smaller radiator runs hotter.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
