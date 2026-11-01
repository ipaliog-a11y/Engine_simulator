// Reliability of real engines (build 219).
//
// WHY THIS EXISTS. The design reliability index put 11 real engines in the red and 42 in the yellow: a 911 GT3, a
// Ferrari 458 and a Civic Type R read as grenades. Four of its terms charged factory engines for being what they are.
// What must hold:
//   · no real combustion engine reads red (below 50): the presets are their makers' engines, and none is a grenade;
//   · knock: an AUTO-timing ECU that holds knock at the target costs nothing, while fixed timing advanced past the
//     knock limit still costs reliability; the grade's 'safety' sub-score is unchanged (the ECU still sits at 60);
//   · revs are mean piston speed, not rpm: no charge at or below 25 m/s, 7 per m/s above it; a rotary keeps its rpm rule;
//   · boost stress and specific-output stress are one stress, charged once at the larger; a boost taper still buys
//     reliability where the boost term is the larger;
//   · cooling: a real engine's STOCK radiator is sized for its rated power (engine.radHp = real.hp), so it costs nothing
//     on its own engine; the generic part (radHp 0, sized for 260 hp) and a smaller one still cost; radHp is part of
//     the design, so it survives save and load, and a build saved before it existed loads with the generic part;
//   · the guide's LV3 paragraph says so, in Greek too.
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
  const o = {};
  const preset = n => FACTORY_ENGINES.find(p => p.name.includes(n));
  const load = (p, over) => {
    applyBuild({ engine: Object.assign({}, p.engine, over || {}), tune: Object.assign({}, STD_TUNE), vehicle: Object.assign({}, DEFAULT_VEHICLE), name: p.name });
    return engine.score;
  };
  const ups = () => 2 * engine.stroke_mm / 1000 * engine.redline / 60;
  // 1. every real combustion engine
  o.all = FACTORY_ENGINES.filter(p => p.real && p.engine.type !== 'electric').map(p => {
    const s = load(p); return { n: p.name, rel: s.reliability, radHp: engine.radHp, real: p.real.hp };
  });
  // 2. knock
  const mx5 = preset('B6-ZE');
  let s = load(mx5); o.knock = { auto: s.reliability, safety: s.safety, mode: engine.timingMode };
  s = load(mx5, { timingMode: 'fixed', ignitionAdv: 40 }); o.knock.fixed = s.reliability; o.knock.fixedSafety = s.safety;
  // 3. piston speed
  s = load(mx5, { redline: 8900 }); o.rev = { lo: s.reliability, loUps: ups() };
  s = load(mx5, { redline: 9500 }); o.rev.hi = s.reliability; o.rev.hiUps = ups(); o.rev.hiHpL = s.hpPerL;
  s = load(preset('911 GT3 991.2')); o.rev.gt3 = s.reliability; o.rev.gt3Ups = ups();
  s = load(preset('Renesis (RX-8)')); o.rev.rx8 = s.reliability; o.rev.rx8Red = engine.redline;
  o.limit = PISTON_SPEED_LIMIT;
  // 4. boost and output, once
  s = load(preset('K20C1'));
  const boost = Math.max(0, engine.maxBoost - 0.5) * 11 + Math.max(0, boostTarget(engine.redline) - 0.5) * 11;
  const output = Math.max(0, s.peakHP / engine.displacement_L - 110) * 0.30;
  o.once = { rel: s.reliability, boost, output, ups: ups() };
  const hh = PRESETS.find(p => p.name === '2.0 Turbo Hot-Hatch I4');
  s = load(hh, { boost_bar: 1.6 }); o.taper = { flat: s.reliability };
  s = load(hh, { boost_bar: 1.6, taperRpm: 4000, taperPct: 50 }); o.taper.tapered = s.reliability;
  // 5. cooling
  const ls3 = preset('LS3');
  s = load(ls3); o.cool = { own: s.reliability, radHp: engine.radHp, real: ls3.real.hp, hp: s.peakHP };
  s = load(ls3, { radHp: 300 }); o.cool.r300 = s.reliability;
  s = load(ls3, { radHp: 0 }); o.cool.generic = s.reliability;
  s = load(ls3, { radiator: 'small' }); o.cool.small = s.reliability;
  // save and load
  load(ls3);
  const b = serializeBuild('t', ''); o.save = { saved: b.engine.radHp };
  applyBuild(JSON.parse(JSON.stringify(b))); o.save.back = readEngineFromForm().radHp; o.save.rel = engine.score.reliability;
  const old = JSON.parse(JSON.stringify(b)); delete old.engine.radHp;
  applyBuild(old); o.save.old = readEngineFromForm().radHp;
  // 6. the guide
  o.guide = { en: document.querySelector('[data-gk="wearPhys"]').textContent, el: GUIDE_I18N.wearPhys.el };
  return o;
});

const red = r.all.filter(x => x.rel < 50), yellow = r.all.filter(x => x.rel >= 50 && x.rel < 75);
console.log(`== ${r.all.length} real combustion engines: ${r.all.length - red.length - yellow.length} green, ${yellow.length} yellow, ${red.length} red ==`);
yellow.concat(red).forEach(x => console.log(`   ${String(x.rel).padStart(3)}  ${x.n}`));
red.forEach(x => fails.push(`${x.n} reads red (${x.rel})`));
const noRad = r.all.filter(x => x.radHp !== x.real);
if (noRad.length) fails.push(`real engines without their own radiator rating: ${noRad.map(x => x.n).join(', ')}`);

console.log(`== knock: AUTO timing ${r.knock.auto} (safety ${r.knock.safety}); fixed at 40 deg ${r.knock.fixed} (safety ${r.knock.fixedSafety}) ==`);
if (r.knock.mode !== 'auto') fails.push('the MX-5 NA preset is not on AUTO timing, the knock check needs it');
if (r.knock.auto !== 100) fails.push(`an ECU holding knock at the target still costs reliability (${r.knock.auto})`);
if (r.knock.safety !== 60) fails.push(`the grade's safety sub-score moved (${r.knock.safety}, was 60)`);
if (!(r.knock.fixed < r.knock.auto - 5)) fails.push(`fixed timing past the knock limit costs too little (${r.knock.auto} -> ${r.knock.fixed})`);

const f = (x, d = 1) => (+x).toFixed(d);
console.log(`== revs: limit ${r.limit} m/s; MX-5 at ${f(r.rev.loUps)} m/s ${r.rev.lo}, at ${f(r.rev.hiUps)} m/s ${r.rev.hi}; GT3 at ${f(r.rev.gt3Ups)} m/s ${r.rev.gt3}; RX-8 at ${r.rev.rx8Red} rpm ${r.rev.rx8} ==`);
if (r.limit !== 25) fails.push(`the piston speed limit is ${r.limit} m/s, not 25`);
if (r.rev.lo !== 100) fails.push(`24.8 m/s is under the limit and should cost nothing (${r.rev.lo})`);
const want = Math.round(100 - (r.rev.hiUps - 25) * 7);
if (r.rev.hiHpL > 110) fails.push('the MX-5 at 9500 rpm passed 110 hp/L: the rev check is no longer isolated');
if (r.rev.hi !== want) fails.push(`at ${f(r.rev.hiUps)} m/s the charge should be 7 per m/s over 25 (${want}), got ${r.rev.hi}`);
if (!(r.rev.gt3 >= 90)) fails.push(`a 991.2 GT3 at ${f(r.rev.gt3Ups)} m/s still pays for its revs (${r.rev.gt3})`);
if (r.rev.rx8 !== 82) fails.push(`the RX-8's rotary rule moved (${r.rev.rx8}, expected 100 - 18 for its seals)`);

const once = Math.round(100 - Math.max(r.once.boost, r.once.output));
console.log(`== boost ${f(r.once.boost)} and output ${f(r.once.output)} on the K20C1: ${r.once.rel} (once: ${once}, both: ${Math.round(100 - r.once.boost - r.once.output)}) ==`);
if (r.once.ups > 25) fails.push('the K20C1 is over the piston speed limit: the boost check is no longer isolated');
if (r.once.rel !== once) fails.push(`boost and output are not charged once at the larger (${r.once.rel}, expected ${once})`);
console.log(`== taper at 1.6 bar: flat ${r.taper.flat}, tapered ${r.taper.tapered} ==`);
if (!(r.taper.tapered > r.taper.flat)) fails.push('a boost taper no longer buys reliability');

console.log(`== cooling: LS3 ${r.cool.hp} hp on its own radiator (${r.cool.radHp} hp) ${r.cool.own}; sized for 300 hp ${r.cool.r300}; generic ${r.cool.generic}; small ${r.cool.small} ==`);
if (r.cool.radHp !== r.cool.real) fails.push(`the LS3's radiator is not rated for its ${r.cool.real} hp`);
if (r.cool.own !== 100) fails.push(`the LS3 on its own radiator still pays for cooling (${r.cool.own})`);
if (!(r.cool.generic < r.cool.r300 && r.cool.r300 < r.cool.own)) fails.push('a radiator sized for less power does not cost more');
if (!(r.cool.small < r.cool.own)) fails.push('a smaller radiator than the factory one costs nothing');
console.log(`== save: radHp ${r.save.saved} saved, ${r.save.back} loaded (rel ${r.save.rel}); a build from before: ${r.save.old} ==`);
if (r.save.saved !== r.cool.real || r.save.back !== r.cool.real) fails.push('the radiator rating does not survive save and load');
if (r.save.old !== 0) fails.push('a build saved before radHp existed does not load with the generic radiator');

const enOk = /25 m\/s/.test(r.guide.en) && /larger of the boost stress/.test(r.guide.en) && !/7500/.test(r.guide.en);
const elOk = /25 m\/s/.test(r.guide.el) && /ΕΡΓΟΣΤΑΣΙΑΚΟ ψυγείο/.test(r.guide.el) && !/7500/.test(r.guide.el);
console.log(`== guide: English ${enOk ? 'updated' : 'STALE'}, Greek ${elOk ? 'updated' : 'STALE'} ==`);
if (!enOk) fails.push('the Wear & reliability guide page still describes the old index');
if (!elOk) fails.push('the Greek Wear & reliability paragraph still describes the old index');

if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
if (fails.length) console.log('\nFAIL:\n  ' + fails.join('\n  '));
else console.log('\nOK: no real engine reads red; the index charges unheld knock, piston speed, one boost stress and power past the radiator.');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
