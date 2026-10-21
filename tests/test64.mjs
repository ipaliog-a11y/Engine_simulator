// Pixel-art engine: drawn from the build, not decoration.
//
// WHY THIS EXISTS. Build 106 added pictures of the car and the engine. The engine view (ENGINE tab,
// garage cards) is drawn from the parts you chose, so the checks are that every combination draws
// without throwing, that the picture actually changes when a part does, and that a saved engine gets
// its own thumbnail even from an old record missing fields. The car pictures were withdrawn in build
// 132 (archived on claude/car-sprites-archive): a saved car has no thumbnail, and the track map draws
// the car as the arrow it was before build 106.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

// ---- 1. every engine type x layout x count x induction draws; parts change the picture ----
const eng = await page.evaluate(() => {
  const out = { drawn: 0, thrown: [], blank: [] };
  const sig = b => b.c.join(',');
  const cases = [];
  for (const type of ['petrol4', 'diesel', 'twostroke', 'rotary'])
    for (const layout of type === 'rotary' ? ['rotary'] : ['inline', 'v', 'boxer'])
      for (const cylinders of type === 'rotary' ? [1, 2, 3, 4] : [1, 2, 3, 4, 6, 8, 12])
        for (const intake of ['na', 'turbo', 'supercharger'])
          for (const intakeSys of ['carb4', 'sidedraft', 'itb', 'efi'])
            cases.push({ type, layout, cylinders, intake, intakeSys });
  for (const c of cases) {
    const b = new PixBuf(ENG_GW, ENG_GH);
    try { drawEngineSprite(b, Object.assign({}, DEFAULT_ENGINE, c, { scType: ['roots', 'screw', 'centrifugal'][out.drawn % 3], turboConfig: ['single', 'twin', 'sequential', 'compound'][out.drawn % 4] }), 0.3); }
    catch (e) { out.thrown.push(JSON.stringify(c) + ' ' + e.message); continue; }
    out.drawn++; if (b.c.filter(Boolean).length < 300) out.blank.push(JSON.stringify(c));
  }
  const draw = o => { const b = new PixBuf(ENG_GW, ENG_GH); drawEngineSprite(b, Object.assign({}, DEFAULT_ENGINE, o), 0); return b; };
  out.turboDiffers = sig(draw({ intake: 'na' })) !== sig(draw({ intake: 'turbo', boost_bar: 1 }));
  out.layoutDiffers = sig(draw({ layout: 'inline', cylinders: 6 })) !== sig(draw({ layout: 'v', cylinders: 6 }));
  const width = b => { let lo = ENG_GW, hi = 0; for (let x = 0; x < ENG_GW; x++) if (b.get(x, 55) === '#6a6a7a') { lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi - lo; };
  out.i4 = width(draw({ layout: 'inline', cylinders: 4, intake: 'na' })); out.i6 = width(draw({ layout: 'inline', cylinders: 6, intake: 'na' }));
  return out;
});
console.log(`== engine: ${eng.drawn} combinations drawn · turbo changes the picture: ${eng.turboDiffers} · V vs inline: ${eng.layoutDiffers} · block ${eng.i4} px (I4) vs ${eng.i6} px (I6) ==`);
if (eng.thrown.length) fails.push('engine sprite threw: ' + eng.thrown.slice(0, 3).join('; '));
if (eng.blank.length) fails.push('engine sprite nearly empty for: ' + eng.blank.slice(0, 3).join('; '));
if (!eng.turboDiffers) fails.push('adding a turbo does not change the engine picture');
if (!eng.layoutDiffers) fails.push('a V6 is drawn the same as an inline six');
if (!(eng.i6 > eng.i4)) fails.push('an inline six is not drawn longer than an inline four');

// ---- 2. the previews on their tabs are drawn, and follow the form ----
const lit = sel => page.evaluate(s => {
  const c = document.querySelector(s); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) n++;
  return n;
}, sel);
await page.click('#tabVehicle'); await page.waitForTimeout(300);
const carCanvas = await page.evaluate(() => !!document.getElementById('carPreview'));
await page.click('#tabDesign'); await page.waitForTimeout(300);
const engLit = await lit('#enginePreview');
await page.selectOption('#edIntake', 'na'); await page.waitForTimeout(150);
const engA = await page.evaluate(() => { previewT = 0; renderEnginePreview(); return document.getElementById('enginePreview').toDataURL(); });
await page.selectOption('#edIntake', 'turbo'); await page.waitForTimeout(150);
const engB = await page.evaluate(() => { previewT = 0; renderEnginePreview(); return document.getElementById('enginePreview').toDataURL(); });
console.log(`== previews: engine ${engLit} bright pixels · turbo changes the engine: ${engA !== engB} · car picture on the VEHICLE tab: ${carCanvas} ==`);
if (carCanvas) fails.push('the VEHICLE tab still has a car picture');
if (engLit < 500) fails.push('the ENGINE tab engine preview is blank');
if (engA === engB) fails.push('choosing a turbo did not change the engine preview');

// ---- 3. garage thumbnails: an old engine record gets one, a car record none ----
const thumbs = await page.evaluate(() => {
  const old = { id: 'legacy1', name: 'Old car', date: '2025-01-01', kind: 'car',
    build: { engine: { type: 'petrol4', cylinders: 4, bore_mm: 86, stroke_mm: 86, layout: 'inline', intake: 'na' }, vehicle: { chassis: 'hatch' } }, stats: {} };
  const eng = { id: 'legacy2', name: 'Old engine', date: '2025-01-01', kind: 'engine', build: { engine: { cylinders: 8, layout: 'v' } }, stats: {} };
  garage.push(old, eng); renderGarage(); setTab('garage');
  const card = name => [...document.querySelectorAll('#garagePanel .garage-item')].find(c => c.textContent.includes(name));
  const img = c => c && c.querySelector('.garage-thumb');
  const e = img(card('Old engine'));
  return { car: !!img(card('Old car')), eng: !!e && /^data:image\/png/.test(e.src) && e.src.length > 500 };
});
console.log(`== garage: car card thumbnail ${thumbs.car}, engine card thumbnail drawn ${thumbs.eng} ==`);
if (thumbs.car) fails.push('a saved car still gets a picture');
if (!thumbs.eng) fails.push('a saved engine does not get its thumbnail');

// ---- 4. the track replay still draws the car (as the arrow), without errors ----
await page.click('#tabTrack'); await page.waitForTimeout(800);
const track = await page.evaluate(() => ({ sprite: typeof drawTopCar === 'function', mode: vizMode }));
console.log(`== track: mode ${track.mode}, car sprite code present: ${track.sprite} ==`);
if (track.sprite) fails.push('the track map still draws the car sprite');

if (errors.length) fails.push(...errors);
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
