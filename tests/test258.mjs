// The water-to-air charge cooler, the model (build W2A_BUILD; plans/v1-finish.md item 6).
//
// WHY THIS EXISTS. An intercooler part can now be cooled by a coolant loop: a core (charge to coolant), a pump and a
// front radiator (coolant to air), each exchanger's effectiveness from its NTU, and the loop's temperature walked in time
// round a lap. No preset uses it yet (that is build 7), so the fingerprint is identical. What must hold:
//   · settled, the loop gives back less than with its coolant at the air's temperature, and the closed form is what
//     stepping the loop in time settles to;
//   · more pump flow and a bigger radiator settle it cooler; more coolant makes it slower (a longer time constant);
//   · fitted, a lap warms the loop above the air and takes drive away; an air-to-air core's lap has no loop;
//   · the part keeps its type and loop through the library; an air-to-air part carries no loop fields;
//   · on the PARTS page the loop's fields show only for a water-to-air core, with no horizontal scroll at 390 px.
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

const r = await page.evaluate(() => {
  const o = {};
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.includes('Focus RS')));
  const P = partFromFactory('water', 'intercooler'), m = airFlowAt(engine.redline, engine.mapMax), L = w2aLoop(P, m);
  o.L = { cold: L.cold, steady: L.steady, tau: L.tau };
  // step the loop at this flow from the air's temperature until it settles: the closed form's coolant temperature
  let Tw = 25; const Tc = 150; for (let k = 0; k < 20000; k++) Tw = w2aStep(L, L.a, Tw, Tc, 25, 0.05);
  const Q = L.Cc * L.steady * (Tc - 25); o.settle = [Tw, 25 + Q / L.b - Q / L.Cw];
  const S = x => w2aLoop(Object.assign({}, P, x), m);
  o.pump = [S({ pump_lpm: 8 }).steady, S({ pump_lpm: 30 }).steady];
  o.rad = [S({ radW: 400, radH: 200 }).steady, S({ radW: 800, radH: 400 }).steady];
  o.loop = [S({ loop_L: 2 }).tau, S({ loop_L: 8 }).tau];
  const key = Object.keys(TRACKS)[0];
  const air = partFromFactory('large', 'intercooler'); partLib.push(air); fitPart(air.id);
  o.airLap = 'icLoop' in simulateLapRun(key); o.airKeys = Object.keys(air).filter(k => /pump|loop|rad|type/.test(k));
  partLib.push(P); persistParts(); fitPart(P.id);
  const lap = simulateLapRun(key); o.lap = lap.icLoop && { tMax: lap.icLoop.tMax, shareMin: lap.icLoop.shareMin };
  loadParts(); const back = partById(P.id); o.kept = back && back.type === 'water' && back.pump_lpm === P.pump_lpm && back.radD === P.radD;
  setTab('parts'); partsUI.kind = 'intercooler'; partsUI.edit.intercooler = null; renderParts();
  const box = document.getElementById('pxWater'), ty = document.getElementById('pxType');
  ty.value = 'air'; previewPart('intercooler'); o.hiddenAir = box.hidden;
  ty.value = 'water'; previewPart('intercooler'); o.hiddenWater = box.hidden;
  o.scroll = document.documentElement.scrollWidth - window.innerWidth;
  return o;
});
console.log(`loop at the redline flow: cold ${r.L.cold.toFixed(3)}, settled ${r.L.steady.toFixed(3)}, time constant ${r.L.tau.toFixed(1)} s`);
console.log(`settles at ${r.settle[0].toFixed(2)} C stepped, ${r.settle[1].toFixed(2)} C closed form`);
console.log(`pump 8/30 L/min ${r.pump.map(x => x.toFixed(3))}; radiator small/big ${r.rad.map(x => x.toFixed(3))}; loop 2/8 L tau ${r.loop.map(x => x.toFixed(1))} s`);
console.log(`lap: loop up to ${r.lap && r.lap.tMax.toFixed(1)} C, least drive share ${r.lap && r.lap.shareMin.toFixed(3)}; air-to-air lap has a loop: ${r.airLap}`);
if (!(r.L.steady < r.L.cold && r.L.steady > 0)) fails.push('settled loop does not give back less than the cold loop');
if (Math.abs(r.settle[0] - r.settle[1]) > 0.01) fails.push('stepping the loop does not settle where the closed form says');
if (!(r.pump[1] > r.pump[0])) fails.push('more pump flow does not settle cooler');
if (!(r.rad[1] > r.rad[0])) fails.push('a bigger radiator does not settle cooler');
if (!(r.loop[1] > r.loop[0])) fails.push('more coolant does not make the loop slower');
if (!r.lap || !(r.lap.tMax > 20.5) || !(r.lap.shareMin < 1)) fails.push('a lap does not warm the loop and take drive');
if (r.airLap) fails.push('an air-to-air core has a loop on the lap');
if (r.airKeys.length) fails.push('an air-to-air part carries loop fields: ' + r.airKeys);
if (!r.kept) fails.push('the part lost its loop through the library');
if (!r.hiddenAir || r.hiddenWater) fails.push(`loop fields shown wrongly (air hidden ${r.hiddenAir}, water hidden ${r.hiddenWater})`);
if (r.scroll > 0) fails.push(`horizontal scroll at 390 px: ${r.scroll}`);
await browser.close();
for (const f of fails.concat(errors)) console.log('FAIL ' + f);
process.exit(fails.length || errors.length ? 1 : 0);
