// Moose test driver: turns in sooner, uses the lanes' width, step-up speed search (build 353).
//
// WHY THIS EXISTS. Until build 353 the moose driver tried twelve lines through the lanes' centres and bisected the
// speed: a Model 3 cleared 56 km/h at 0.63 g, under its own skidpad grip (0.80 g); Teknikens Värld cleared it at 72.
// What must hold:
//   · the Model 3 clears 68 km/h or more (Teknikens Värld 72; the rest is its eco tyres' grip, not the driver);
//   · at its best speed the car works its tyres: peak ay at least 0.85 of mu;
//   · one step up, no plan clears (the search stops where the driver does);
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

const r = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.name.startsWith('Tesla Model 3')));
  const M = simulateMooseChallenge(0), car = driveCar(), D = mooseDims();
  const up = MOOSE_SHAPES.some(sh => mooseRun(car, D, M.speedKmh + 1, sh, false, true).ok);
  return { v: M.speedKmh, ay: M.peakAy, mu: M.mu, up };
});
await browser.close();

console.log(`Model 3: ${r.v} km/h clear (Teknikens Värld 72), peak ${r.ay.toFixed(2)} g on mu ${r.mu.toFixed(2)}`);
if (!(r.v >= 68)) fails.push(`Model 3 clears only ${r.v} km/h`);
if (!(r.ay / r.mu >= 0.85)) fails.push(`peak ay ${(r.ay / r.mu).toFixed(2)} of mu`);
if (r.up) fails.push('a plan clears one step above the best speed');
console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS');
console.log('ERRORS:', errors.length ? errors : 'none');
process.exit(fails.length || errors.length ? 1 : 0);
