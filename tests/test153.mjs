// The BMW M3 E30's engine is the 1986 car's (build 242).
//
// WHY THIS EXISTS. The S14B23 preset carried the RACE cam (284 deg, Schrick's competition cam for the S14), the default
// STOCK catalyst and a PERFORMANCE filter, against a 200 PS rating that is the car without a catalyst. Its power read
// close to the rating only because those errors cancelled part of the model's missing top-end fade. Owner's check.
// What must hold:
//   · the preset is the 1986 car: SPORT cam (the stock cam is ~246 deg), no catalyst, the airbox's STOCK filter, and its
//     rating in mechanical horsepower (200 PS = 197.3 hp), as every other preset is;
//   · its torque, which the top-end fade does not touch, is within 5% of BMW's 240 Nm;
//   · its power is within test115's 25% band: the remaining excess is the top-end fade test60 names for it.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const url = pathToFileURL(path.join(repo, 'index.html')).href;
const browser = await chromium.launch();
const errors = [], fails = [];
const page = await browser.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const pr = FACTORY_ENGINES.find(q => q.name === 'BMW S14B23 (M3 E30)');
  applyBuild({ engine: Object.assign({}, pr.engine), tune: Object.assign({}, STD_TUNE), vehicle: readVehicleFromForm(), name: pr.name });
  return { e: pr.engine, real: pr.real, hp: engine.score.peakHP, hpRpm: engine.score.peakHPrpm, tq: engine.score.peakTQ, cat: engine.cat };
});
const ep = r.hp / r.real.hp - 1, et = r.tq / r.real.tq - 1;
console.log(`== S14B23: cam ${r.e.cam}, catalyst ${r.cat}, filter ${r.e.airFilter}; ${r.hp} hp at ${r.hpRpm} (rated ${r.real.hp}, ${(ep * 100).toFixed(1)}%), ` +
  `${r.tq} Nm (rated ${r.real.tq}, ${(et * 100).toFixed(1)}%) ==`);
if (r.e.cam !== 'sport') fails.push('the S14\'s cam should be SPORT (stock ~246 deg), not ' + r.e.cam);
if (r.cat !== 'none') fails.push('the 1986 M3 had no catalyst; the preset has ' + r.cat);
if (r.e.airFilter !== 'stock') fails.push('the road S14 breathes through its airbox (STOCK), not ' + r.e.airFilter);
if (Math.abs(r.real.hp - 197.3) > 0.1) fails.push('the rating should be 200 PS = 197.3 hp, not ' + r.real.hp);
if (Math.abs(et) > 0.05) fails.push(`torque ${r.tq} Nm is ${(et * 100).toFixed(1)}% off BMW's 240 Nm`);
if (Math.abs(ep) > 0.25) fails.push(`power ${r.hp} hp is ${(ep * 100).toFixed(1)}% off its rating, past test115's 25% band`);
await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('\nFAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('\nPASS: the S14B23 is the 1986 car; its torque matches and its power excess is the named top-end fade');
