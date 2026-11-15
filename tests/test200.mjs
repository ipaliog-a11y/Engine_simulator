// A factory exhaust's silencer, apart from its header (build 325).
//
// WHY THIS EXISTS. engine.silencer gives a factory engine its own silencer; without it the silencer follows the header
// class, as before. What must hold:
//   · a road preset with an equal-length header (exhaust:'race') reads a straight-through silencer (silencerKey 'sport');
//   · an engine without the field reads as it did: race -> 'race', sport -> 'sport', stock -> 'stock';
//   · the factory part made from such an engine carries its silencer; a designed part's own silencer still wins;
//   · the field survives the form (applyEngineToForm -> buildEngine), and AS THE HEADER leaves it unset;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });

const R = await page.evaluate(() => {
  const load = x => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, x)); buildEngine(); return engine; };
  const s2k = FACTORY_ENGINES.find(p => p.name.startsWith('Honda F20C')).engine;
  const out = {};
  let e = load(s2k);
  out.preset = [e.silencer, silencerKey(e), partFromFactory('race', 'exhaust').silencer];
  out.old = ['stock', 'sport', 'race'].map(k => { const x = load({ exhaust: k }); return [x.silencer, silencerKey(x), partFromFactory(k, 'exhaust').silencer]; });
  e = load(s2k);
  out.designed = silencerKey(Object.assign({}, e, { exhaustPart: normPart({ kind: 'exhaust', build: 'equal', silencer: 'straight' }) }));
  return out;
});
await browser.close();

console.log('S2000 preset:', R.preset.join(' / '));
console.log('no field (stock, sport, race):', R.old.map(r => r.join(' / ')).join(' | '));
console.log('designed part over the preset:', R.designed);
if (R.preset.join() !== 'absorptive,sport,absorptive') fails.push('S2000: ' + R.preset.join());
const want = [[null, 'stock', 'chambered'], [null, 'sport', 'absorptive'], [null, 'race', 'straight']];
R.old.forEach((r, i) => { if ((r[0] ?? null) !== null || r[1] !== want[i][1] || r[2] !== want[i][2]) fails.push('no field: ' + r.join()); });
if (R.designed !== 'race') fails.push('designed part: ' + R.designed);
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
