// Racecraft and drivers (build 147): the tow grows as the gap closes, a car ahead defends against a car with the
// pace to pass it, a held-up car tries a late-braking move that sticks or runs it wide, and each car has a driver
// whose traits (aggression, consistency, tyre care, wet skill) change how it races.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fails = [];

const r = await page.evaluate(() => {
  const rec = n => {
    const v = VEHICLE_PRESETS.find(x => x.name.includes(n)), ep = PRESETS.find(x => x.name === v.engine);
    return { name: v.name, build: { engine: Object.assign({}, ep.engine), tune: Object.assign({}, STD_TUNE), vehicle: vehicleFromPreset(v), name: v.name } };
  };
  const out = {};
  // 1. the tow by distance
  out.tow = [5, 10, 20, 40, 60].map(g => RACE.slipK * RACE.slipDrag * Math.exp(-g / 25));
  // 2. a close field, three driver mixes over twelve seeds (build 152: over three, the few dives that stuck made the
  // share below a coin flip; across 48 seeds it is 42-63% from changes that move the pace by under 0.03 s a lap)
  const ms = ['M3 (E46', 'Golf GTI', 'Civic Type R', 'GR Yaris'].map(n => raceCarModel(rec(n), 'spa'));
  const field = (drv, seed) => { const R = raceInit(ms, { track: 'spa', laps: 6, seed, grid: 'reverse', cars: ms.map(() => ({ driver: drv })) }); raceRun(R); return R; };
  const tally = drv => { const t = { dives: 0, ok: 0, wide: 0, defend: 0, pass: 0, okThenPass: 0 };
    for (const sd of [3, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]) { const R = field(drv, sd);
      for (const e of R.events) {
        if (e.type === 'dive') { t.dives++; if (e.ok) { t.ok++; if (R.events.some(p => p.type === 'pass' && p.car === e.car && p.on === e.on && p.t >= e.t && p.t < e.t + 10)) t.okThenPass++; } else t.wide++; }
        if (e.type === 'defend') t.defend++; if (e.type === 'pass') t.pass++;
      } }
    return t; };
  out.aggressive = tally('aggressive'); out.smooth = tally('smooth'); out.balanced = tally('balanced');
  // 3. no driver given is the balanced driver
  { const a = raceInit(ms, { track: 'spa', laps: 3, seed: 5, cars: [{}, {}, {}, {}] }); raceRun(a);
    const b = raceInit(ms, { track: 'spa', laps: 3, seed: 5, cars: ms.map(() => ({ driver: 'balanced' })) }); raceRun(b);
    const sig = R => R.cars.map(c => c.laps.map(l => l.t.toFixed(3)).join(',')).join('|');
    out.defaultIsBalanced = sig(a) === sig(b); }
  // 4. the driver alone in the same car: consistency, mistakes, tyre care, the rain
  const solo = (M, drv, cfg) => { const R = raceInit([M], Object.assign({ track: M.key, laps: 10, seed: 9, cars: [{ stops: 'none', driver: drv }] }, cfg)); raceRun(R); return R.cars[0]; };
  const Mc = raceCarModel(rec('Civic Type R'), 'tech');
  const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const laps = c => c.laps.slice(1).map(l => l.t);
  let misRookie = 0, misSmooth = 0, spreadRookie = 0, spreadSmooth = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const a = solo(Mc, 'rookie', { seed }), b = solo(Mc, 'smooth', { seed });
    spreadRookie += sd(laps(a)); spreadSmooth += sd(laps(b));
  }
  const nMis = drv => { let n = 0; for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const R = raceInit([Mc], { track: 'tech', laps: 10, seed, cars: [{ stops: 'none', driver: drv }] }); raceRun(R); n += R.events.filter(e => e.type === 'mistake').length; } return n; };
  misRookie = nMis('rookie'); misSmooth = nMis('smooth');
  out.consistency = { spreadRookie: spreadRookie / 5, spreadSmooth: spreadSmooth / 5, misRookie, misSmooth };
  out.care = { smooth: Math.max(...solo(Mc, 'smooth').W), aggressive: Math.max(...solo(Mc, 'aggressive').W) };
  const Mw = raceCarModel(rec('Civic Type R'), 'tech', { wet: true });
  const sv = RACE.mistake; RACE.mistake = 0;
  const wetTime = drv => solo(Mw, drv, { weather: 'wet', laps: 6 }).laps.slice(1).reduce((s, l) => s + l.t, 0);
  out.wet = { rain: wetTime('rain'), rookie: wetTime('rookie'), balanced: wetTime('balanced') };
  RACE.mistake = sv;
  return out;
});

console.log('== the tow: speed gained at 70 m/s by the gap ==');
console.log('  ' + [5, 10, 20, 40, 60].map((g, k) => `${g} m ${(r.tow[k] * 100).toFixed(2)}%`).join(' · '));
for (let k = 1; k < r.tow.length; k++) if (!(r.tow[k] < r.tow[k - 1])) fails.push('the tow does not fall away with the gap');
if (!(r.tow[1] > 0.012 && r.tow[1] < 0.035)) fails.push(`the tow at 10 m is ${(r.tow[1] * 100).toFixed(1)}%, not the 1-3% a real one is worth`);
if (!(r.tow[4] < 0.005)) fails.push('the tow is still worth something 60 m back');

console.log('\n== a close field at Spa, reversed grid, twelve seeds ==');
for (const k of ['aggressive', 'balanced', 'smooth']) { const t = r[k]; console.log(`  ${k.padEnd(10)} passes ${t.pass}, dives ${t.dives} (${t.ok} stuck, ${t.wide} wide), defends ${t.defend}`); }
if (!(r.aggressive.dives > r.smooth.dives)) fails.push('aggressive drivers do not try more late-braking moves than smooth ones');
if (!(r.aggressive.dives >= 2)) fails.push('aggressive drivers hardly ever try a late-braking move');
if (!(r.balanced.defend > 0 && r.aggressive.defend > 0)) fails.push('nobody defends');
// a dive that sticks often ends in the place being taken; the car passed can take it straight back (the switchback)
const okN = r.aggressive.ok + r.balanced.ok, okPass = r.aggressive.okThenPass + r.balanced.okThenPass;
console.log(`  dives that stuck and ended in the pass: ${okPass} of ${okN} (the rest were switchbacks)`);
if (okN > 0 && !(okPass >= okN / 3)) fails.push(`only ${okPass} of ${okN} dives that stuck ended in the place being taken`);
if (!(r.aggressive.wide + r.balanced.wide > 0)) fails.push('no late-braking move ever goes wrong');
console.log(`  no driver given is the balanced driver: ${r.defaultIsBalanced}`);
if (!r.defaultIsBalanced) fails.push('a car with no driver set does not race as the balanced driver');

console.log('\n== the driver, alone in the same Civic ==');
console.log(`  lap spread (s.d.): rookie ${r.consistency.spreadRookie.toFixed(3)} s · smooth ${r.consistency.spreadSmooth.toFixed(3)} s; mistakes over 80 laps: rookie ${r.consistency.misRookie} · smooth ${r.consistency.misSmooth}`);
if (!(r.consistency.spreadRookie > r.consistency.spreadSmooth)) fails.push('a rookie is no less consistent than a smooth driver');
if (!(r.consistency.misRookie > r.consistency.misSmooth)) fails.push('a rookie makes no more mistakes than a smooth driver');
console.log(`  tyre wear after 10 laps: smooth ${r.care.smooth.toFixed(3)} · aggressive ${r.care.aggressive.toFixed(3)}`);
if (!(r.care.smooth < r.care.aggressive * 0.85)) fails.push('a smooth driver does not save the tyres against an aggressive one');
console.log(`  five wet laps: rain master ${r.wet.rain.toFixed(1)} s · balanced ${r.wet.balanced.toFixed(1)} s · rookie ${r.wet.rookie.toFixed(1)} s`);
if (!(r.wet.rain < r.wet.balanced && r.wet.balanced < r.wet.rookie)) fails.push('wet skill does not order the drivers in the rain');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
