// Derived pipe emissions on LIVE (build 257).
//
// WHY THIS EXISTS. Emissions left dimensionless analyser indices; they are now exhaust-pipe
// mass rates from fuel C/H/O + λ, with a LIVE CLEAN/OK/DIRTY readout. What must hold:
//   · at stoich petrol, O2 ≈ 0 and CO2 ≈ fuel carbon × 44/12;
//   · lean → free O2; rich → more CO than at stoich;
//   · cat none is dirtier than stock at a stoich cruise;
//   · DFCO / fuel cut → ~0 CO2;
//   · LIVE shows the analyser tiles; at phone width the page does not scroll sideways;
//   · a pure EV hides the analyser rows.
import { chromium } from './pw.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fails = [];

const r = await page.evaluate(() => {
  const o = {};
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  engine.afrMode = 'fixed';
  engine.cat = 'stock'; engine.catConv = CAT.stock.conv;
  state.rpm = 2500; state.map = 0.55; state.coolant = 90; state.iat = 25; state.fuelCut = false;
  state.ve = computeVE(state.rpm, state.map);
  // Stoich
  state.afr = engine.stoichAFR;
  computeEmissions();
  const y = engine.fuelHC, z = engine.fuelOC, MWf = 12.011 + y * 1.008 + z * 16;
  const afr = state.afr;
  const T_k = effIAT(state.map, state.rpm) + 273.15, MAP_pa = state.map * 1e5, Vd = engine.displacement_L / 1000;
  const air = (MAP_pa * Vd * (state.rpm / 60) * engine.chargesPerRev * state.ve) / (287 * T_k) * (1 - egrRate(state.rpm, state.map));
  const metered = (air / afr) / engine.meteringEff * engine.typeBsfc;
  const burn = metered / engine.typeBsfc;
  const cFrac = 12.011 / MWf;
  const phi = COMB_INEFF_SI; // approx — full model adds overlap/metering; bound loosely
  o.stoich = { co2: state.emCO2, o2: state.emO2, co: state.emCO, burn, expectCO2: burn * 1000 * cFrac * (44.01 / 12.011) * (1 - phi * 0.5) };
  // Lean
  state.afr = engine.stoichAFR * 1.15;
  computeEmissions();
  o.lean = { o2: state.emO2, co: state.emCO };
  // Rich
  state.afr = engine.stoichAFR * 0.85;
  computeEmissions();
  o.rich = { co: state.emCO, o2: state.emO2 };
  // Cat none vs stock at stoich cruise
  state.afr = engine.stoichAFR;
  engine.cat = 'none'; engine.catConv = 0;
  computeEmissions();
  o.none = { rating: state.emRating, co: state.emCO, hc: state.emHC, nox: state.emNOx };
  engine.cat = 'stock'; engine.catConv = CAT.stock.conv;
  computeEmissions();
  o.stock = { rating: state.emRating, co: state.emCO, hc: state.emHC, nox: state.emNOx };
  // Fuel cut
  state.fuelCut = true;
  computeEmissions();
  o.cut = { co2: state.emCO2, co: state.emCO, rating: state.emRating };
  state.fuelCut = false;
  setTab('engine'); updateUI();
  o.ui = {
    emit: document.getElementById('statEmit') && document.getElementById('statEmit').offsetParent !== null,
    co2: document.getElementById('statCO2') && document.getElementById('statCO2').offsetParent !== null,
    rows: document.getElementById('liveEmRows') && !document.getElementById('liveEmRows').hidden,
    label: document.querySelector('#statEmit .value').textContent,
  };
  return o;
});

console.log('== stoich ==', JSON.stringify(r.stoich));
console.log('== lean/rich ==', JSON.stringify({ lean: r.lean, rich: r.rich }));
console.log('== cat ==', JSON.stringify({ none: r.none, stock: r.stock }));
console.log('== cut/ui ==', JSON.stringify({ cut: r.cut, ui: r.ui }));

if (!(r.stoich.o2 < 0.05 * r.stoich.co2 + 0.02)) fails.push(`stoich O2 not near 0: O2=${r.stoich.o2} CO2=${r.stoich.co2}`);
// CO2 should be within ~35% of carbon×44/12 (HC/residual CO pull carbon; cat may add some back)
{ const ratio = r.stoich.co2 / r.stoich.expectCO2;
  if (!(ratio > 0.55 && ratio < 1.25)) fails.push(`stoich CO2 ${r.stoich.co2} vs expect ~${r.stoich.expectCO2} (ratio ${ratio.toFixed(2)})`); }
if (!(r.lean.o2 > r.stoich.o2 + 0.01)) fails.push(`lean O2 ${r.lean.o2} not above stoich ${r.stoich.o2}`);
if (!(r.rich.co > r.stoich.co * 1.5 + 0.01)) fails.push(`rich CO ${r.rich.co} not above stoich ${r.stoich.co}`);
if (!(r.none.rating < r.stock.rating)) fails.push(`cat none rating ${r.none.rating} not dirtier than stock ${r.stock.rating}`);
if (!(r.none.co + r.none.hc + r.none.nox > r.stock.co + r.stock.hc + r.stock.nox)) fails.push('cat none pollutants not higher than stock');
if (!(r.cut.co2 < 1e-6 && r.cut.co < 1e-6 && r.cut.rating === 100)) fails.push(`fuel cut did not zero emissions: ${JSON.stringify(r.cut)}`);
if (!r.ui.emit || !r.ui.co2 || !r.ui.rows) fails.push('LIVE analyser tiles missing');

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(pathToFileURL(path.join(repo, 'index.html')).href, { waitUntil: 'networkidle' });
await phone.waitForTimeout(200);
const scroll = await phone.evaluate(() => {
  applyBuild({ engine: Object.assign({}, DEFAULT_ENGINE), tune: Object.assign({}, STD_TUNE) });
  setTab('engine'); updateUI();
  return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
});
console.log('== phone ==', scroll);
if (scroll.sw > scroll.cw + 1) fails.push(`phone horizontal scroll: ${scroll.sw} > ${scroll.cw}`);
await phone.close();

const ev = await page.evaluate(() => {
  loadVehiclePreset(FACTORY_CARS.find(p => p.engine && /electric|Motor|EV/i.test(JSON.stringify(p))) || FACTORY_CARS.find(p => p.name && /Leaf|Model 3|Ioniq 5|e-Golf/i.test(p.name)));
  // Prefer a known pure EV preset if present
  const evp = (typeof EV_VEHICLE_PRESETS !== 'undefined' && EV_VEHICLE_PRESETS[0]) || null;
  if (evp) loadVehiclePreset(evp);
  setTab('engine'); updateUI();
  const rows = document.getElementById('liveEmRows');
  return { hidden: !rows || rows.hidden, type: engine && engine.type };
});
console.log('== EV ==', ev);
if (ev.type === 'electric' && !ev.hidden) fails.push('EV still shows exhaust analyser rows');

if (errors.length) fails.push(...errors);
console.log(fails.length ? `FAIL (${fails.length})\n` + fails.map(f => ' - ' + f).join('\n') : 'OK');
await browser.close();
process.exit(fails.length ? 1 : 0);
