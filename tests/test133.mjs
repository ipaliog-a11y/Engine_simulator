// The 14 body classes' pictures (build 222).
//
// WHY THIS EXISTS. Each chassis class in CHASSIS got its own unbranded side view (assets/cars/generic/*.webp). A
// generic chassis, and a car made by COPY FROM (no longer the real car), now show their class's picture where a real
// car shows its own: the top of the VEHICLE tab, with the drawn car under it as YOUR BUILD, and the GARAGE cards.
// What must hold:
//   · every class in CHASSIS has a picture, every picture is a class (no file in assets/cars/generic/ unused), and all
//     of them load from file:// at 960x640;
//   · a generic chassis shows its class's picture at the top, captioned with the class, and a change of class changes
//     it; a part changed keeps it, marked as the car as it left the factory; the drawn car stays under it;
//   · a real car still shows its own picture, and a copy shows its class's, captioned as a copy;
//   · the GARAGE: a generic car's card shows its class's picture; an engine's card is still drawn;
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

// 1. the map and the files
const map = await page.evaluate(() => ({ classes: Object.keys(CHASSIS), urls: Object.keys(CHASSIS).map(k => classArtUrl(k)) }));
const missing = map.classes.filter((k, i) => !map.urls[i]);
const files = fs.readdirSync(path.join(repo, 'assets/cars/generic')).filter(f => f.endsWith('.webp'));
const unused = files.filter(f => !map.urls.includes('assets/cars/generic/' + f));
const loads = await page.evaluate(urls => Promise.all(urls.map(u => new Promise(res => {
  const im = new Image(); im.onload = () => res({ u, w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ u, w: 0, h: 0 }); im.src = u;
}))), map.urls.filter(Boolean));
const bad = loads.filter(x => x.w !== 960 || x.h !== 640);
console.log(`== map: ${map.classes.length} classes, ${map.urls.filter(Boolean).length} pictures, ${files.length} files; ${loads.length - bad.length} load at 960x640 ==`);
if (missing.length) fails.push('classes without a picture: ' + missing.join(', '));
if (unused.length) fails.push('files no class uses: ' + unused.join(', '));
if (bad.length) fails.push('pictures that do not load at 960x640: ' + bad.map(x => x.u).join(', '));

// 2. the VEHICLE tab
const room = () => {
  const f = document.getElementById('vhShowroom'), i = document.getElementById('vhArt');
  return { shown: !f.hidden, src: i.getAttribute('src') || '', cap: document.getElementById('vhArtCap').textContent,
    under: document.getElementById('carPreview').classList.contains('under-art') && !document.getElementById('vhBuildCap').hidden };
};
const v = await page.evaluate(new Function('room', `
  room = (${room.toString()});
  setTab('vehicle');
  const ch = document.getElementById('vhChassis'), set = k => { ch.value = k; ch.dispatchEvent(new Event('input')); return room(); };
  const o = { kei: set('kei'), pickup: set('pickup') };
  const w = document.getElementById('vhWheel'); w.value = String(+w.value + 1); w.dispatchEvent(new Event('input'));
  o.mod = room();
  loadVehiclePreset(FACTORY_CARS.find(p => /Supra RZ/.test(p.name))); o.real = room();
  const q = document.getElementById('vhCopyQ'); q.value = '012'; q.dispatchEvent(new Event('input')); document.getElementById('btnCopyFrom').click();
  o.copy = room(); o.copyClass = classArtUrl(vehicle.chassis); o.copyLabel = tr(CHASSIS[vehicle.chassis].label);
  set('kei'); applyLang('el'); o.el = room(); applyLang('en');
  return o;`), null);
console.log(`== kei "${v.kei.cap}" ${v.kei.src}; pickup "${v.pickup.cap}"; modified "${v.mod.cap}"; real "${v.real.cap}"; copy "${v.copy.cap}" ${v.copy.src}; Greek "${v.el.cap}" ==`);
if (!v.kei.shown || !/generic-kei-car\.webp$/.test(v.kei.src) || v.kei.cap !== 'KEI CAR' || !v.kei.under) fails.push('a generic kei car does not show its class picture over YOUR BUILD');
if (!/generic-pickup-truck\.webp$/.test(v.pickup.src) || v.pickup.cap !== 'PICKUP TRUCK') fails.push('a change of class does not change the picture');
if (!/generic-pickup-truck\.webp$/.test(v.mod.src) || !/as it left the factory/.test(v.mod.cap)) fails.push('a modified generic car does not keep its picture, marked');
if (!/toyota-supra-a80-1993\.webp$/.test(v.real.src)) fails.push('a real car no longer shows its own picture');
if (v.copy.src !== v.copyClass || v.copy.cap !== 'Custom (from 012) · ' + v.copyLabel) fails.push('a copy does not show its class picture, captioned as a copy: ' + v.copy.cap);
if (v.el.cap !== 'ΑΥΤΟΚΙΝΗΤΟ KEI' && !/[Α-Ωα-ω]/.test(v.el.cap)) fails.push('the class caption is not in Greek: ' + v.el.cap);

// 3. the GARAGE
const g = await page.evaluate(() => {
  const car = { id: 't133a', kind: 'car', name: 'T133 suv', date: '2026-11-02', stats: {}, build: { engine: { type: 'petrol4', cylinders: 4, bore_mm: 86, stroke_mm: 86, layout: 'inline', intake: 'na' }, vehicle: { chassis: 'suv' } } };
  const eng = { id: 't133b', kind: 'engine', name: 'T133 engine', date: '2026-11-02', stats: {}, build: { engine: { cylinders: 6, layout: 'inline' } } };
  garage.push(car, eng); renderGarage(); setTab('garage');
  const card = n => [...document.querySelectorAll('#garagePanel .garage-item')].find(c => c.textContent.includes(n));
  const o = { car: card('T133 suv').querySelector('.garage-thumb').getAttribute('src'), eng: card('T133 engine').querySelector('.garage-thumb').getAttribute('src').slice(0, 22) };
  garage = garage.filter(x => !/^t133/.test(x.id)); renderGarage();
  return o;
});
console.log(`== garage: generic SUV ${g.car}; engine ${g.eng}… ==`);
if (!/generic-performance-suv\.webp$/.test(g.car)) fails.push('a generic car\'s garage card does not show its class picture');
if (!/^data:image\/png/.test(g.eng)) fails.push('an engine\'s garage card is no longer drawn');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
