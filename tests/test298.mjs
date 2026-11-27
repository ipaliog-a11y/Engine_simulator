// WHY THIS EXISTS (build 480). The catalyst's back pressure was a fitted 'restrict' times 350 velocity heads of the
// tail pipe; it is now derived from the brick's substrate (catBrickDpPa). What must hold:
//   · CAT carries cell density and wall thickness, and no fitted 'restrict';
//   · a decat brick loses nothing; a stock 600/4 brick loses more than a sport 200 cpsi one at the same flow;
//   · the brick term is laminar: at fixed density, doubling the flow roughly doubles the channel loss, not quadruples;
//   · at a stock 1.6 NA's redline flow the stock brick loses 3-20 kPa (stock cats at rated flow: about 5-15 kPa);
//   · backPressureBar falls when the cat is removed; no page errors.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const load = over => { applyEngineToForm(Object.assign({}, DEFAULT_ENGINE, PRESETS[0].engine, over)); syncDesignEnable(); buildEngine(); };
  load({ cat: 'stock' });
  const e = engine, rpm = e.redline, T = exhaustGasT(1.0, rpm), rho = 101325 / (287 * T);
  const Q = (e.dispCyl_L / 1000) * (T / 320) * e.cylinders * (rpm / 60 * (e.chargesPerRev || 0.5)) / (e.sysPipes || 1);
  const dp = (cat, q) => catBrickDpPa(q, T, rho, Object.assign({}, e, { cat }));
  const bpStock = backPressureBar(rpm, T);
  load({ cat: 'none' });
  const bpNone = backPressureBar(rpm, T);
  return { name: PRESETS[0].name, fields: Object.keys(CAT.stock), none: dp('none', Q), stock: dp('stock', Q), sport: dp('sport', Q),
    lo: dp('stock', Q * 0.1), lo2: dp('stock', Q * 0.2), bpStock, bpNone };
});
const fails = [];
console.log(`${r.name}: stock ${(r.stock / 1000).toFixed(1)} kPa, sport ${(r.sport / 1000).toFixed(1)}, none ${r.none}; at 10%/20% flow ${r.lo.toFixed(0)}/${r.lo2.toFixed(0)} Pa`);
console.log(`backPressureBar stock ${r.bpStock.toFixed(3)} bar, decat ${r.bpNone.toFixed(3)} bar`);
if (r.fields.includes('restrict')) fails.push('CAT.stock still carries a fitted restrict');
if (!r.fields.includes('cpsi') || !r.fields.includes('wall_mm')) fails.push('CAT.stock lacks its substrate (cpsi, wall_mm)');
if (r.none !== 0) fails.push('a decat brick loses ' + r.none);
if (!(r.stock > r.sport && r.sport > 0)) fails.push('stock brick should lose more than sport, and sport more than none');
const ratio = r.lo2 / r.lo;
if (!(ratio > 1.9 && ratio < 2.6)) fails.push(`doubling a low flow multiplies the loss by ${ratio.toFixed(2)}: not laminar`);
if (!(r.stock > 3000 && r.stock < 20000)) fails.push(`stock brick ${r.stock.toFixed(0)} Pa at redline, outside 3-20 kPa`);
if (!(r.bpNone < r.bpStock)) fails.push('removing the cat did not lower back pressure');
fails.push(...errors);
await browser.close();
if (fails.length) { console.log('\nFAIL\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log('\nPASS');
