// The build price of every factory car, as the sim prices it (build 308), for the guided build's budget question.
//
//   node tools/car-prices.mjs           writes src/js/car-prices.js (then run node tools/build.mjs)
//   node tools/car-prices.mjs --check   fails if src/js/car-prices.js is not what the sim prices today
//
// A price is the engine's plus the car's (engine.cost + vehicle.cost), read from the car loaded with its own engine,
// exactly as the FACTORY CAR picker loads it. Working an engine out takes about a second, so the guided build cannot
// price ~100 cars while the player waits: it reads this list, and the --check (tests/test188.mjs) keeps it honest.
// Re-run it after any change to computeCost, computeVehicleCost, a hybrid's or an electric drive's cost, or a preset.
import { chromium } from '../tests/pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(repo, 'src/js/car-prices.js');

export async function priceAll(page) {
  const n = await page.evaluate(() => FACTORY_CARS.length);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(await page.evaluate(i => {
    const p = FACTORY_CARS[i]; loadVehiclePreset(p);
    return [p.name, (engine.cost || 0) + (vehicle.cost || 0)];
  }, i));
  return rows;
}
export function readList() {
  const src = fs.readFileSync(OUT, 'utf8'), out = {};
  for (const m of src.matchAll(/^\s*"([^"]+)":(\d+),?$/gm)) out[m[1]] = +m[2];
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
  const rows = await priceAll(page);
  await browser.close();
  if (process.argv.includes('--check')) {
    const have = readList(), bad = rows.filter(([n, v]) => have[n] !== v).map(([n, v]) => `${n}: list ${have[n]}, sim ${v}`);
    if (Object.keys(have).length !== rows.length) bad.push(`list holds ${Object.keys(have).length} cars, the sim ${rows.length}`);
    if (bad.length) { console.error('CAR_PRICE is stale (run node tools/car-prices.mjs):\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log(`CAR_PRICE matches the sim for all ${rows.length} cars`);
  } else {
    const body = rows.map(([n, v]) => '  ' + JSON.stringify(n) + ':' + v).join(',\n');
    fs.writeFileSync(OUT, '// ====== FACTORY CAR PRICES (build 308) ======\n' +
      '// Written by tools/car-prices.mjs, never by hand: each factory car\'s build price (engine.cost + vehicle.cost) as the sim\n' +
      '// prices it with its own engine. The guided build\'s budget question reads it; tests/test188.mjs checks it is current.\n' +
      'const CAR_PRICE={\n' + body + '\n};\n');
    console.log(`wrote ${rows.length} prices to src/js/car-prices.js`);
  }
}
