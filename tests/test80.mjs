// Supercar category (build 148): four popular supercars from each decade since the 90s, each a real car on its
// factory engine. The engines and cars are reported against their makers in test60 and test61, with their known
// gaps named there; this checks the category itself: it is whole, it loads, the picker groups it by decade, the
// decades get quicker, and the cars race.
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
const ERAS = ['1990s', '2000s', '2010s', '2020s'];

const r = await page.evaluate(ERAS => {
  const cars = VEHICLE_PRESETS.filter(p => p.cat === 'Supercar');
  const rows = cars.map(p => {
    const ep = PRESETS.find(e => e.name === p.engine);
    loadVehiclePreset(p);
    const a = simulateAccel();
    return { n: p.name, era: p.era, year: +(p.name.match(/(19|20)\d\d/) || [0])[0], engCat: ep && ep.cat, engEra: ep && ep.era,
      rhp: ep && ep.real.hp, hp: engine.score.peakHP, kg: vehicle.mass, real: p.body.kg, stock: isFactoryFit(readVehicleFromForm()),
      t100: a.t100, rt100: p.real.t100 };
  });
  // the picker: the Supercar family, grouped by decade
  const fam = document.getElementById('vhFamily'); fam.value = 'Supercar'; fam.dispatchEvent(new Event('change'));
  const groups = [...document.querySelectorAll('#vhPreset optgroup')].map(g => ({ label: g.label, n: g.querySelectorAll('option').length }));
  const efam = document.getElementById('edFamily'); efam.value = 'Supercar'; efam.dispatchEvent(new Event('change'));
  const egroups = document.querySelectorAll('#edPreset optgroup').length;
  // other families stay flat
  fam.value = 'NA Sports'; fam.dispatchEvent(new Event('change'));
  const flat = document.querySelectorAll('#vhPreset optgroup').length;
  // one from each decade, three laps of Spa
  const rec = p => { const ep = PRESETS.find(e => e.name === p.engine);
    return { name: p.name, build: { engine: Object.assign({}, ep.engine), tune: Object.assign({}, STD_TUNE), vehicle: vehicleFromPreset(p), name: p.name } }; };
  const pick = ['McLaren F1', 'Ferrari Enzo', 'McLaren 720S', 'Corvette Z06 (C8'].map(n => cars.find(c => c.name.includes(n)));
  const ms = pick.map(p => raceCarModel(rec(p), 'spa'));
  const R = raceInit(ms, { track: 'spa', laps: 3, seed: 4 }); raceRun(R);
  return { rows, cats: PRESET_CATS, groups, egroups, flat,
    race: { done: R.done, laps: R.cars.map(c => c.laps.length), best: R.cars.map(c => Math.min(...c.laps.map(l => l.t))) } };
}, ERAS);

console.log('== the Supercar category ==');
for (const x of r.rows) console.log(`  ${x.era} ${x.n.padEnd(40)} ${String(x.hp).padStart(4)}/${x.rhp} hp  ${Math.round(x.kg)} kg  0-100 ${x.t100 && x.t100.toFixed(2)} (real ${x.rt100})`);
if (!r.cats.includes('Supercar') || r.cats.includes('Exotic')) fails.push('Supercar has not replaced Exotic');
for (const e of ERAS) { const n = r.rows.filter(x => x.era === e).length; if (n !== 4) fails.push(`${e}: ${n} cars, not 4`); }
if (r.rows.length !== 16) fails.push(`${r.rows.length} supercars, not 16`);
for (const x of r.rows) {
  const lo = +x.era.slice(0, 4);
  if (!(x.year >= lo && x.year <= lo + 9)) fails.push(`${x.n}: ${x.year} is not in the ${x.era}`);
  if (x.engCat !== 'Supercar' || x.engEra !== x.era) fails.push(`${x.n}: its engine is not a ${x.era} supercar engine`);
  if (!x.stock) fails.push(`${x.n}: does not load as factory spec`);
  if (Math.abs(x.kg - x.real) > 0.5) fails.push(`${x.n}: loads at ${Math.round(x.kg)} kg, not its ${x.real}`);
  if (!(Math.abs(x.hp / x.rhp - 1) <= 0.15)) fails.push(`${x.n}: ${x.hp} hp against a rated ${x.rhp}`);
}
const med = a => { const s = [...a].sort((p, q) => p - q); return (s[1] + s[2]) / 2; };
const pw = ERAS.map(e => med(r.rows.filter(x => x.era === e).map(x => x.hp / x.kg * 1000)));
const acc = ERAS.map(e => med(r.rows.filter(x => x.era === e).map(x => x.rt100)));
console.log(`  median hp/tonne by decade ${pw.map(v => v.toFixed(0)).join(' -> ')}; median real 0-100 ${acc.map(v => v.toFixed(2)).join(' -> ')} s`);
if (!(pw[3] > pw[0])) fails.push('2020s supercars are not more powerful for their weight than 1990s ones');
if (!(acc[3] < acc[0])) fails.push('2020s supercars are not quicker to 100 than 1990s ones');

console.log(`\n== picker: ${r.groups.map(g => `${g.label} (${g.n})`).join(', ')}; engine picker ${r.egroups} groups; NA Sports ${r.flat} groups`);
if (r.groups.length !== 4 || r.groups.some((g, k) => g.label !== ERAS[k] || g.n !== 4)) fails.push('the car picker does not group the supercars into four decades of four');
if (r.egroups !== 4) fails.push('the engine picker does not group the supercar engines by decade');
if (r.flat !== 0) fails.push('a family without eras is grouped');

console.log(`\n== one from each decade, three laps of Spa: laps ${r.race.laps.join('/')}, best ${r.race.best.map(t => t.toFixed(1)).join(' / ')} s`);
if (!r.race.done || r.race.laps.some(n => n !== 3)) fails.push('the four-decade race does not run to the flag');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
