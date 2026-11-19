// WHY THIS EXISTS (build 303): wet grip comes from the water and the tread, not from a share fitted per compound
// (wetKeep). What must hold:
//   · Gallaway's film on a 12 m circuit in a properly wet race's rain is a fraction of a millimetre to 2 mm;
//   · dry, every compound keeps all its grip; wet, the grip falls with speed for every compound (Horne's lift);
//   · a slick, all exposed, keeps under a quarter at 150 km/h, a treaded road tyre over half, a full wet over half;
//   · a full wet out-grips a slick at every speed from 40 km/h;
//   · (build 366) standing still on a wet track, only the adhesion is left: a road tyre keeps keep0 (0.71), a rain
//     compound keeps it times its EU label class over a road tyre's, 1.55/1.47 (RACE_WET_G);
//   · a slick-shod car calls a rain tyre on a wet track; a wet race runs with no page error.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
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
  const wet = RACE.wetFull, ks = ['street', 'sport', 'semi', 'slick', 'inter', 'wet'], kmh = [10, 40, 80, 150, 220];
  const keep = {};
  for (const k of ks) { const ty = raceCompound(k); keep[k] = { dry: raceWetKeep(ty, 0, 40, 12), still: raceWetKeep(ty, wet, 0, 12), wet: kmh.map(v => raceWetKeep(ty, wet, v / 3.6, 12)) }; }
  const G3 = raceCarModel(rec('Radical SR3'), 'spa', { wet: true }), civic = raceCarModel(rec('Civic Type R'), 'spa', { wet: true });
  const lap = M => Object.fromEntries([M.tyre.key, 'inter', 'wet'].map(k => [k, raceWetLap(M, raceCompound(k), wet)]));
  const R = raceInit([G3, civic], { track: 'spa', laps: 2, seed: 5, weather: 'wet' }); raceRun(R);
  return { film: raceFilmMm(1, 12), filmDamp: raceFilmMm(0.4, 12), keep, kmh,
    g3: { tyre: G3.tyre.key, best: raceBestCompound(G3, wet), lap: lap(G3) }, civic: { tyre: civic.tyre.key, best: raceBestCompound(civic, wet), lap: lap(civic) },
    raced: R.done, laps: R.cars.map(c => c.lapsDone) };
});

const f2 = x => x.toFixed(2);
console.log(`film on a 12 m circuit: ${f2(r.film)} mm in a wet race's rain, ${f2(r.filmDamp)} mm at 40% of it`);
console.log('share of dry grip kept, wet, at km/h ' + r.kmh.join(' / '));
for (const [k, o] of Object.entries(r.keep)) console.log(`  ${k.padEnd(7)} dry ${f2(o.dry)}  wet ${o.wet.map(f2).join('  ')}`);
for (const [n, o] of [['Radical SR3', r.g3], ['Civic Type R', r.civic]])
  console.log(`${n} (${o.tyre}): calls ${o.best} on a wet track; lap share ${Object.entries(o.lap).map(([k, g]) => k + ' ' + f2(g)).join(', ')}`);
console.log(`wet race: done ${r.raced}, laps ${r.laps.join(', ')}`);

if (!(r.film > 0.1 && r.film < 2)) fails.push(`film ${f2(r.film)} mm outside 0.1-2`);
for (const [k, o] of Object.entries(r.keep)) {
  if (Math.abs(o.dry - 1) > 1e-9) fails.push(`${k} keeps ${o.dry} dry`);
  for (let i = 1; i < o.wet.length; i++) if (!(o.wet[i] <= o.wet[i - 1] + 1e-9)) fails.push(`${k}: grip rises with speed in the wet`);
}
const at = (k, v) => r.keep[k].wet[r.kmh.indexOf(v)];
if (!(at('slick', 150) < 0.25)) fails.push(`slick keeps ${f2(at('slick', 150))} at 150 km/h`);
if (!(at('street', 150) > 0.5)) fails.push(`street tyre keeps ${f2(at('street', 150))} at 150 km/h`);
if (!(at('wet', 150) > 0.5)) fails.push(`full wet keeps ${f2(at('wet', 150))} at 150 km/h`);
for (const v of [40, 80, 150, 220]) if (!(at('wet', v) > at('slick', v))) fails.push(`full wet not above slick at ${v} km/h`);
console.log('standing still, wet: ' + Object.entries(r.keep).map(([k, o]) => k + ' ' + o.still.toFixed(3)).join(', '));
for (const [k, o] of Object.entries(r.keep)) {
  const want = 0.71 * (k === 'inter' || k === 'wet' ? 1.55 / 1.47 : 1);
  if (Math.abs(o.still - want) > 1e-9) fails.push(`${k} keeps ${o.still.toFixed(4)} standing still, wet, not ${want.toFixed(4)}`);
}
if (r.g3.tyre !== 'slick' || r.g3.best === 'slick') fails.push('the slick-shod Radical stays on slicks on a wet track');
if (!r.raced) fails.push('the wet race did not finish');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
