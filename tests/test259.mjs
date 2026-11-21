// Water-to-air intercoolers, per car (build 430; plans/v1-finish.md item 7).
//
// WHY THIS EXISTS. The presets whose makers fit a coolant-cooled charge cooler now carry the water-to-air core
// (INTERCOOLER.water). What must hold:
//   · each of the seven loads with a water-to-air core (its geometry type 'water'), and an air-to-air car stays as it was;
//   · on a lap the moved car's loop warms above the air and takes drive;
//   · the engine page offers WATER-TO-AIR, and PARTS starts a water car's design from the water-to-air part.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { try { localStorage.removeItem('pes.parts'); } catch (e) {} });
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fails = [];
const WATER = ['Challenger SRT Hellcat', 'Ford GT (2005)', 'Golf 2.0 TDI 150', 'X5 M (F85', 'M2 Competition', 'Camaro ZL1', 'Qashqai e-POWER'];

const r = await page.evaluate(W => {
  const o = { cars: [] };
  for (const w of W) {
    const c = FACTORY_CARS.find(p => p.name.includes(w));
    if (!c) { o.cars.push({ w, missing: true }); continue; }
    loadVehiclePreset(c); const G = icGeom(engine);
    o.cars.push({ w, ic: engine.intercooler, type: G && G.type, h: G && G.h });
  }
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Focus RS')));
  o.air = [engine.intercooler, icGeom(engine).type || 'air'];
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('M2 Competition')));
  const lap = simulateLapRun(Object.keys(TRACKS)[0]);
  o.lap = lap.icLoop && { tMax: lap.icLoop.tMax, shareMin: lap.icLoop.shareMin };
  o.opt = !!document.querySelector('#edIntercooler option[value="water"]');
  setTab('parts'); partsUI.kind = 'intercooler'; partsUI.edit.intercooler = null; renderParts();
  o.from = document.getElementById('pxFrom').value; o.edType = document.getElementById('pxType').value;
  return o;
}, WATER);
for (const c of r.cars) console.log(`${c.w}: ${c.missing ? 'MISSING' : c.ic + ', core ' + c.type + ', h ' + c.h}`);
console.log(`Focus RS: ${r.air}; M2 lap: loop up to ${r.lap && r.lap.tMax.toFixed(1)} C, least drive share ${r.lap && r.lap.shareMin.toFixed(3)}`);
for (const c of r.cars) if (c.missing || c.ic !== 'water' || c.type !== 'water') fails.push(`${c.w} is not water-to-air`);
if (r.air[0] === 'water' || r.air[1] === 'water') fails.push('the Focus RS (air-to-air) moved');
if (!r.lap || !(r.lap.tMax > 20.5) || !(r.lap.shareMin < 1)) fails.push('the M2 lap does not warm the loop');
if (!r.opt) fails.push('the engine page offers no WATER-TO-AIR');
if (r.from !== 'water' || r.edType !== 'water') fails.push(`PARTS starts the M2 from ${r.from} / ${r.edType}`);
await browser.close();
for (const f of fails.concat(errors)) console.log('FAIL ' + f);
process.exit(fails.length || errors.length ? 1 : 0);
