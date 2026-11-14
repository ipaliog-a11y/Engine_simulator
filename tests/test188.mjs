// WHY THIS EXISTS (build 308): the guided build gives a learner a complete real car from three questions. What must hold:
//   · GUIDED BUILD on the title menu opens it; kind, budget and what matters lead to a car with its parts explained;
//   · the car offered is within the budget, of the kind asked, and the best of them by what matters (maker's 0–100);
//   · BUILD THIS CAR loads that car on the VEHICLE tab, and its build price there is the one the list showed;
//   · BACK steps back a question; CAR_PRICE is every factory car's price as the sim prices it today
//     (tools/car-prices.mjs --check, run here so a cost change cannot leave the list stale).
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { priceAll, readList } from '../tools/car-prices.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href + '?title=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];

await page.click('#titleScreen .title-menu button[data-go="guided"]');
const q = () => page.evaluate(() => ({ open: !document.getElementById('guided').hidden, h: (document.querySelector('#gbBody h3') || {}).textContent }));
let s = await q();
if (!s.open || s.h !== 'What kind of car?') fails.push('GUIDED BUILD did not open on the first question: ' + JSON.stringify(s));
await page.click('#gbBody button[data-fam="Compact Turbo"]');
s = await q(); if (s.h !== 'What budget?') fails.push('kind did not lead to the budget: ' + s.h);
await page.click('#gbClose');
s = await q(); if (s.h !== 'What kind of car?') fails.push('BACK did not return to the first question');
await page.click('#gbBody button[data-fam="Compact Turbo"]');
await page.click('#gbBody button[data-budget="30000"]');
await page.click('#gbBody button[data-goal="quick"]');
const res = await page.evaluate(() => {
  const name = document.querySelector('#gbName').textContent.replace(/^\s*\d+\s*/, '').trim();
  const want = FACTORY_CARS.filter(p => p.cat === 'Compact Turbo' && CAR_PRICE[p.name] <= 30000).sort((a, b) => a.real.t100 - b.real.t100)[0];
  return { name, want: want.name, price: CAR_PRICE[name], parts: document.querySelectorAll('#gbBody .gb-parts li').length,
    hscroll: document.documentElement.scrollWidth > innerWidth || document.getElementById('gbBody').scrollWidth > document.getElementById('gbBody').clientWidth };
});
console.log(`Compact Turbo, up to $30,000, quickest: ${res.name} ($${res.price}), ${res.parts} parts explained`);
if (res.name !== res.want) fails.push(`offered ${res.name}, the quickest within budget is ${res.want}`);
if (!(res.price <= 30000)) fails.push('the car offered is over budget');
if (res.parts < 6) fails.push(`only ${res.parts} parts explained`);
if (res.hscroll) fails.push('the guided build scrolls sideways on a phone');
await page.click('#gbBuild');
await page.waitForTimeout(200);
const built = await page.evaluate(() => ({ open: !document.getElementById('guided').hidden, tab: vizMode, car: vehBody && vehBody.name, price: engine.cost + vehicle.cost }));
console.log(`built: ${built.car} on ${built.tab}, priced $${built.price}`);
if (built.open || built.tab !== 'vehicle' || built.car !== res.name) fails.push('BUILD THIS CAR did not load the car on the VEHICLE tab: ' + JSON.stringify(built));
if (built.price !== res.price) fails.push(`the loaded car costs $${built.price}, the list said $${res.price}`);

const have = readList(), rows = await priceAll(page);
const stale = rows.filter(([n, v]) => have[n] !== v);
console.log(`CAR_PRICE: ${rows.length} cars priced, ${stale.length} stale`);
if (stale.length || Object.keys(have).length !== rows.length) fails.push('CAR_PRICE is stale (run node tools/car-prices.mjs): ' + stale.slice(0, 5).map(r => r.join(' ')).join('; '));

await browser.close();
if (errors.length) fails.push(...errors);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');
