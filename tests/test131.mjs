// Showroom pictures of the factory cars (build 220).
//
// WHY THIS EXISTS. Every factory car gained a 960x640 pixel-art side view (assets/cars/*.webp, mapped by
// src/js/car-art.js). They show the car as it left the factory, so they go where the car is shown that way, and the
// live views keep the car drawn in code, which follows the parts fitted.
// What must hold:
//   · every factory car (FACTORY_CARS: combustion, electric, hybrid) has a picture, and every picture is a car: no
//     name in CAR_ART that is not a preset, and no file in assets/cars/ that no car uses;
//   · every picture loads from file:// and is 960x640;
//   · the VEHICLE tab: loading a real car from the picker shows its picture (at the top since build 221), captioned with
//     its number and name;
//     a change of car changes the picture; a part changed says the picture is the car as it left the factory; going
//     to a generic chassis hides it; the live car preview is still drawn;
//   · the GARAGE: a saved real car's card shows its picture; a saved generic chassis is still drawn (a PNG data URL);
//   · the caption reads in Greek.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// 1. the map against the presets and the folder
const map = await page.evaluate(() => ({
  cars: FACTORY_CARS.map(p => p.name), art: Object.keys(CAR_ART),
  urls: FACTORY_CARS.map(p => carArtUrl(p.name)),
}));
const missing = map.cars.filter(n => !map.art.includes(n));
const stray = map.art.filter(n => !map.cars.includes(n));
const files = fs.readdirSync(path.join(repo, 'assets/cars')).filter(f => f.endsWith('.webp'));
const unused = files.filter(f => !map.urls.includes('assets/cars/' + f));
console.log(`== map: ${map.cars.length} factory cars, ${map.art.length} pictures, ${files.length} files ==`);
if (missing.length) fails.push('factory cars without a picture: ' + missing.join(', '));
if (stray.length) fails.push('pictures for no preset: ' + stray.join(', '));
if (unused.length) fails.push('files no car uses: ' + unused.join(', '));

// 2. every picture loads, at its size
const loads = await page.evaluate(urls => Promise.all(urls.map(u => new Promise(res => {
  const im = new Image(); im.onload = () => res({ u, w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ u, w: 0, h: 0 }); im.src = u;
}))), map.urls.filter(Boolean));
const bad = loads.filter(x => x.w !== 960 || x.h !== 640);
console.log(`== load: ${loads.length - bad.length} of ${loads.length} load at 960x640 ==`);
if (bad.length) fails.push('pictures that do not load at 960x640: ' + bad.map(x => x.u + ' ' + x.w + 'x' + x.h).join(', '));

// 3. the VEHICLE tab's showroom
const pick = async name => {
  await page.evaluate(n => {
    const i = FACTORY_CARS.findIndex(p => p.name === n), fam = document.getElementById('vhFamily'), sel = document.getElementById('vhPreset');
    fam.value = FACTORY_CARS[i].cat; fam.dispatchEvent(new Event('change'));
    sel.value = String(i); sel.dispatchEvent(new Event('change'));
  }, name);
  await page.waitForFunction(() => { const i = document.getElementById('vhArt'); return i.complete; });
};
const room = () => page.evaluate(() => {
  const f = document.getElementById('vhShowroom'), i = document.getElementById('vhArt');
  return { hidden: f.hidden, src: i.getAttribute('src') || '', w: i.naturalWidth, cap: document.getElementById('vhArtCap').textContent,
    shown: !f.hidden && f.getBoundingClientRect().height > 100 };
});
await page.evaluate(() => setTab('vehicle'));
const before = await room();
await pick('Honda S2000 (AP1, 2000)');
const s2k = await room();
await pick('Ferrari F40 (1987)');
const f40 = await room();
// a part changed: the picture stays, the caption says it is the factory car
await page.evaluate(() => { const w = document.getElementById('vhWheel'); w.value = String(+w.value + 1); w.dispatchEvent(new Event('input')); });
await page.waitForTimeout(200);
const modded = await room();
const preview = await page.evaluate(() => {
  const c = document.getElementById('carPreview'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0; for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 120) lit++;
  return lit;
});
// a generic chassis
await page.evaluate(() => { const c = document.getElementById('vhChassis'); c.value = 'coupe'; c.dispatchEvent(new Event('input')); });
await page.waitForTimeout(200);
const generic = await room();
console.log(`== showroom: start hidden ${before.hidden}; S2000 ${s2k.src} (${s2k.w}px) "${s2k.cap}"; F40 ${f40.src}; modified "${modded.cap}"; generic hidden ${generic.hidden}; live preview ${preview} lit pixels ==`);
if (!s2k.shown || !/honda-s2000-ap1-2000\.webp$/.test(s2k.src) || s2k.w !== 960) fails.push('loading the S2000 does not show its picture');
// since build 221 the caption leads with the car's order number (test132)
if (s2k.cap !== '010 · Honda S2000 (AP1, 2000)') fails.push('the showroom caption is not the car\'s number and name: ' + s2k.cap);
if (!/ferrari-f40-1987\.webp$/.test(f40.src)) fails.push('a change of car does not change the picture');
if (modded.hidden || !/as it left the factory/.test(modded.cap)) fails.push('a modified car does not say the picture is the factory car');
if (!generic.hidden) fails.push('a generic chassis still shows a real car\'s picture');
if (preview < 500) fails.push('the live car preview is no longer drawn');

// 4. the GARAGE
const garageR = await page.evaluate(async () => {
  const real = FACTORY_CARS.find(p => p.name === 'Mazda MX-5 1.6 (NA, 1989)');
  loadVehiclePreset(real);
  const gReal = { id: 't131a', kind: 'car', name: 'T131 real', date: '2026-11-01', stats: {}, build: serializeBuild('T131 real', '') };
  const gGen = { id: 't131b', kind: 'car', name: 'T131 generic', date: '2026-11-01', stats: {},
    build: { engine: { type: 'petrol4', cylinders: 4, bore_mm: 86, stroke_mm: 86, layout: 'inline', intake: 'na' }, vehicle: { chassis: 'hatch' } } };
  garage.push(gReal, gGen); renderGarage(); setTab('garage');
  const card = n => [...document.querySelectorAll('#garageList .garage-item')].find(c => c.textContent.includes(n));
  const a = card('T131 real').querySelector('.garage-thumb'), b = card('T131 generic').querySelector('.garage-thumb');
  await new Promise(r => a.complete ? r() : (a.onload = a.onerror = r));
  const out = { real: a.getAttribute('src'), realW: a.naturalWidth, art: a.classList.contains('art'), gen: (b.getAttribute('src') || '').slice(0, 22) };
  garage = garage.filter(g => !/^t131/.test(g.id)); renderGarage();
  return out;
});
console.log(`== garage: real car ${garageR.real} (${garageR.realW}px, art ${garageR.art}); generic ${garageR.gen}… ==`);
if (!/mazda-mx-5-na-1989\.webp$/.test(garageR.real) || garageR.realW !== 960 || !garageR.art) fails.push('a saved real car\'s garage card does not show its picture');
if (!/^data:image\/png/.test(garageR.gen)) fails.push('a saved generic chassis is no longer drawn');

// 5. Greek
const el = await page.evaluate(() => {
  setTab('vehicle'); loadVehiclePreset(FACTORY_CARS.find(p => p.name === 'Honda S2000 (AP1, 2000)'));
  const w = document.getElementById('vhWheel'); w.value = String(+w.value + 1); w.dispatchEvent(new Event('input'));
  applyLang('el'); updateVehicleSummary();
  const cap = document.getElementById('vhArtCap').textContent; applyLang('en'); return cap;
});
console.log(`== Greek: "${el}" ==`);
if (!/εργοστάσιο/.test(el) || /left the factory/.test(el)) fails.push('the showroom caption is not in Greek');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
