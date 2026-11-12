// Every real car's body is recorded for a 3D model (build 269, phase E step 6).
//
// WHY THIS EXISTS. A 3D car needs each preset's length, width, height, overhangs, tracks, wheel and tyre size,
// and each figure needs a source. What must hold:
//   · every factory car has an entry in CAR_DIMS with a source, and CAR_DIMS has no car that is not a preset;
//   · carDims() gives a body that adds up: front overhang + wheelbase + rear overhang is the length, both
//     overhangs are positive, the body is wider than its tracks (not an open-wheeler) and taller than its tyres;
//   · a tyre is a real size: its diameter 0.50-0.90 m, the rear no narrower than the front;
//   · the gaps are named and may only shrink: cars with no published width, and the counts of entries with an
//     unsure figure and of overhang splits read from the side view;
//   · no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'load' });

// no width found: Radical publishes none for the RSX that was reachable; the Ram's page gives it only with mirrors
const NO_WIDTH_KNOWN = ['Radical SR3 RSX 1500 (2015)', 'Ram 2500 HO Cummins (2019)'];
const OPEN_WHEEL = /Ariel Atom|BAC Mono/;          // the wheels stand outside the body
const UNSURE_BUDGET = 37, READ_OVERHANG_BUDGET = 83;

const R = await page.evaluate(() => {
  const names = FACTORY_CARS.map(p => p.name);
  return { missing: names.filter(n => !CAR_DIMS[n]), extra: Object.keys(CAR_DIMS).filter(n => !names.includes(n)),
    cars: FACTORY_CARS.map(p => { try { return carDims(p); } catch (e) { return { name: p.name, err: e.message }; } }),
    plain: JSON.stringify(carDims(FACTORY_CARS[10])) === JSON.stringify(JSON.parse(JSON.stringify(carDims(FACTORY_CARS[10])))) };
});
if (R.missing.length) fails.push('no entry: ' + R.missing.join('; '));
if (R.extra.length) fails.push('not a preset: ' + R.extra.join('; '));
if (!R.plain) fails.push('carDims is not plain data');
let unsure = 0, read = 0; const noW = [];
for (const d of R.cars) {
  if (!d) continue;
  if (d.err) { fails.push(d.name + ': ' + d.err); continue; }
  const bad = m => fails.push(d.name + ': ' + m);
  if (!d.src) bad('no source');
  if (!(d.len > 3 && d.len < 6.6)) bad('length ' + d.len);
  if (!(d.h > 1 && d.h < 2.1)) bad('height ' + d.h);
  if (d.w == null) noW.push(d.name); else if (!(d.w > 1.35 && d.w < 2.25)) bad('width ' + d.w);
  if (Math.abs(d.ovF + d.wb + d.ovR - d.len) > 1e-9) bad('overhangs do not add up');
  if (!(d.ovF > 0.25 && d.ovR > 0.25)) bad('overhang ' + d.ovF.toFixed(3) + ' / ' + d.ovR.toFixed(3));
  if (d.w != null && !OPEN_WHEEL.test(d.name) && !(d.w > Math.max(d.trackF, d.trackR))) bad('narrower than its track');
  for (const t of [d.tyreF, d.tyreR]) if (!(t.dia > 0.5 && t.dia < 0.9 && t.dia < d.h)) bad('tyre ' + t.size);
  if (d.tyreR.w < d.tyreF.w) bad('rear tyre narrower than the front');
  if (d.unsure.some(u => u !== 'overhang')) unsure++;
  if (d.unsure.includes('overhang')) read++;
}
const newGap = noW.filter(n => !NO_WIDTH_KNOWN.includes(n));
if (newGap.length) fails.push('no width: ' + newGap.join('; '));
if (unsure > UNSURE_BUDGET) fails.push('unsure entries ' + unsure + ' > ' + UNSURE_BUDGET);
if (read > READ_OVERHANG_BUDGET) fails.push('overhangs read from the side view ' + read + ' > ' + READ_OVERHANG_BUDGET);
console.log(`${R.cars.length} cars • no width ${noW.length} • unsure ${unsure}/${UNSURE_BUDGET} • overhang read from the profile ${read}/${READ_OVERHANG_BUDGET}`);
for (const e of errors) fails.push(e);
await browser.close();
if (fails.length) { console.log('FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('PASS');
