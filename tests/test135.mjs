// The VEHICLE tab no longer draws a car under the picture (build 224).
//
// WHY THIS EXISTS. The showroom picture and the car drawn from the parts were both on the VEHICLE tab,
// one under the other. The drawn one is gone. What must hold:
//   · the tab has no car-preview canvas and no YOUR BUILD caption;
//   · a real car's showroom picture is still there, and stays when a part changes;
//   · the track still draws the car from the build (that view was not the one removed);
//   · the ENGINE tab still draws the engine.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];

const v = await page.evaluate(async () => {
  setTab('vehicle');
  const i = FACTORY_CARS.findIndex(p => /Sierra RS/.test(p.name));
  const fam = document.getElementById('vhFamily'), sel = document.getElementById('vhPreset');
  fam.value = FACTORY_CARS[i].cat; fam.dispatchEvent(new Event('change'));
  sel.value = String(i); sel.dispatchEvent(new Event('change'));
  const fig = document.getElementById('vhShowroom');
  const o = {
    canvas: !!document.getElementById('carPreview'),
    cap: !!document.getElementById('vhBuildCap'),
    text: document.getElementById('vehiclePanelTab').innerText.includes('YOUR BUILD'),
    shown: fig && !fig.hidden,
    src: (document.getElementById('vhArt').getAttribute('src') || ''),
    caption: document.getElementById('vhArtCap').textContent
  };
  const w = document.getElementById('vhWheel'); w.value = String(+w.value + 1); w.dispatchEvent(new Event('input'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  o.still = !document.getElementById('vhShowroom').hidden;
  o.mod = document.getElementById('vhArtCap').textContent;
  setTab('design');
  o.eng = !!document.getElementById('enginePreview');
  const b = new PixBuf(CAR_GW, CAR_GH);
  drawCarSprite(b, Object.assign({}, DEFAULT_VEHICLE, { chassis: 'coupe', aeroRear: 'wing' }), DEFAULT_ENGINE, 0);
  o.trackSprite = b.c.filter(Boolean).length;
  return o;
});
console.log(`== vehicle: canvas ${v.canvas}, caption ${v.cap}, YOUR BUILD text ${v.text}; picture ${v.shown} ${v.src} "${v.caption}"; modified "${v.mod}"; engine canvas ${v.eng}; sprite pixels ${v.trackSprite} ==`);
if (v.canvas || v.cap || v.text) fails.push('the drawn car section is still on the VEHICLE tab');
if (!v.shown || !/sierra/.test(v.src)) fails.push('the showroom picture is not shown for the loaded car: ' + v.src);
if (!/Sierra/.test(v.caption)) fails.push('the showroom caption is not the car: ' + v.caption);
if (!v.still || !/as it left the factory/.test(v.mod)) fails.push('changing a part drops the picture or its factory note');
if (!v.eng) fails.push('the ENGINE tab no longer has its drawn engine');
if (v.trackSprite < 400) fails.push('the car sprite the track draws is empty');

console.log('\nERRORS:', errors.length ? errors : 'none');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : '\nPASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
